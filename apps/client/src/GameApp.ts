import { Callbacks } from "@colyseus/sdk";
// Babylon 은 배럴("@babylonjs/core")에서 가져오면 엔진 전체가 번들에 들어간다.
// 실제로 쓰는 모듈만 경로로 직접 가져와 번들 크기를 줄인다.
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  CLIENT_MESSAGES,
  CONFIG,
  SERVER_MESSAGES,
  type ChatMessagePayload,
  type FragmentCollectedPayload,
  type MeteorForecastPayload,
  type ShowerStartedPayload,
  type MeteorImpactPayload,
  type MeteorWarningPayload,
  type PlayerState
} from "@starfall/shared";
import { AudioController } from "./audio/AudioController";
import { GameCamera } from "./camera/createGameCamera";
import { MeteorEffects } from "./meteor/MeteorEffects";
import { GameConnection } from "./net/GameConnection";
import { resolveServerUrl } from "./net/serverUrl";
import {
  loadCharacterPack,
  type CharacterPack
} from "./player/characterAssets";
import { LocalPlayerController } from "./player/LocalPlayerController";
import { ObservationTracker } from "./player/ObservationTracker";
import { PlayerAvatar } from "./player/PlayerAvatar";
import { createWorld } from "./scene/createWorld";
import type { UIController } from "./ui/UIController";

export class GameApp {
  private engine: Engine | undefined;
  private scene: Scene | undefined;
  private camera: GameCamera | undefined;
  private localPlayer: LocalPlayerController | undefined;
  private readonly remotePlayers = new Map<string, PlayerAvatar>();
  private effects: MeteorEffects | undefined;
  private characters: CharacterPack | undefined;
  private sendAccumulator = 0;
  private nextMeteorAt = 0;
  private playerCount = 0;
  private cameraShake = 0;
  private cameraShakeTime = 0;
  private readonly audio = new AudioController();
  private observation: ObservationTracker | undefined;
  /** 예보를 들고 있는가. 서버 상태를 그대로 따라간다. */
  private hasForecast = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly ui: UIController
  ) {}

  async start(nickname: string): Promise<void> {
    // 입장 버튼 클릭이 이 함수를 부른다. 브라우저가 소리를 허용하는 시점이
    // 바로 이 사용자 입력이므로 여기서 오디오를 연다.
    this.audio.unlock();
    this.audio.play("uiClick");
    this.ui.bindAudioControls(this.audio.volumes, (kind, value) => {
      if (kind === "sfx") {
        this.audio.setSfxVolume(value);
        // 움직인 결과를 바로 들려준다.
        this.audio.play("uiClick");
      } else {
        this.audio.setMusicVolume(value);
      }
    });

    const connection = new GameConnection(resolveServerUrl());
    const room = await connection.connect(nickname, ({ attempt, maxAttempts }) => {
      this.ui.setConnectionStatus(
        `무료 서버를 시작하는 중… (${attempt}/${maxAttempts})`,
        "connecting"
      );
    });

    this.ui.setConnectionStatus("서버 연결됨", "online");
    this.ui.enterGame(nickname);

    this.engine = new Engine(this.canvas, true, {
      preserveDrawingBuffer: false,
      stencil: true,
      adaptToDeviceRatio: true
    });
    this.scene = new Scene(this.engine);
    // 캐릭터 모델은 없어도 되므로 월드와 함께 미리 받아 둔다.
    const [characters] = await Promise.all([
      loadCharacterPack(this.scene),
      createWorld(this.scene)
    ]);
    this.characters = characters;
    this.camera = new GameCamera(this.scene, this.canvas);
    this.effects = new MeteorEffects(this.scene);

    const callbacks = Callbacks.get(room);
    callbacks.onAdd("players", (player, sessionId) => {
      this.playerCount += 1;
      this.ui.setPlayerCount(this.playerCount);

      const isLocal = sessionId === room.sessionId;
      const avatar = new PlayerAvatar(
        this.scene!,
        sessionId,
        player.nickname,
        { x: player.x, z: player.z },
        isLocal,
        this.characters
      );

      if (isLocal) {
        this.localPlayer = new LocalPlayerController(avatar, this.camera!);
        this.ui.setScore(player.score);
        this.ui.setProfile(player.total, player.best);
        this.camera!.follow(avatar.root.position);
      } else {
        this.remotePlayers.set(sessionId, avatar);
      }

      callbacks.onChange(player, () => {
        this.applyPlayerState(sessionId, room.sessionId, player);
      });
    });

    callbacks.onRemove("players", (_player, sessionId) => {
      this.playerCount = Math.max(0, this.playerCount - 1);
      this.ui.setPlayerCount(this.playerCount);
      const avatar = this.remotePlayers.get(sessionId);
      avatar?.dispose();
      this.remotePlayers.delete(sessionId);
    });

    callbacks.onAdd("fragments", (fragment, fragmentId) => {
      this.effects?.addFragment(fragmentId, fragment.x, fragment.z);
    });
    callbacks.onRemove("fragments", (_fragment, fragmentId) => {
      this.effects?.removeFragment(fragmentId);
    });
    callbacks.listen("nextMeteorAt", (value) => {
      this.nextMeteorAt = value;
    });

    room.onMessage(
      SERVER_MESSAGES.METEOR_WARNING,
      (payload: MeteorWarningPayload) => {
        const direction = this.effects?.warn(payload) ?? "하늘";
        this.ui.showMeteorBanner(direction);
        this.audio.play("meteorWarning");
        // 경고가 끝날 때쯤 낙하음이 들어오도록 맞춘다.
        window.setTimeout(() => {
          this.audio.play("meteorFall");
        }, Math.max(0, payload.etaMs - 300));
      }
    );
    room.onMessage(
      SERVER_MESSAGES.METEOR_IMPACT,
      (payload: MeteorImpactPayload) => {
        const intensity = this.effects?.impact(
          payload,
          this.localPlayer?.avatar.root.position
        ) ?? 0;
        this.cameraShake = intensity * 0.18;
        this.cameraShakeTime = intensity * 0.45;
        this.ui.hideMeteorBanner();
        this.audio.play("meteorImpact");
        // 조각은 충돌 직후 서버 상태로 들어온다. 하나씩 소리를 내면 겹쳐서
        // 시끄러우므로 충돌음이 지나간 뒤 한 번만 낸다.
        window.setTimeout(() => this.audio.play("fragmentSpawn"), 420);
      }
    );
    room.onMessage(
      SERVER_MESSAGES.FRAGMENT_COLLECTED,
      (payload: FragmentCollectedPayload) => {
        this.ui.showNotice(`${payload.byNickname} 님이 별 조각을 획득했습니다`);
        this.audio.play("fragmentCollect");
      }
    );
    room.onMessage(SERVER_MESSAGES.CHAT, (payload: ChatMessagePayload) => {
      this.ui.appendChat(payload.nickname, payload.text);
      this.audio.play("chat");
    });
    this.ui.onChat((text) => {
      room.send(CLIENT_MESSAGES.CHAT, { text });
    });

    // 관측을 마치면 서버에 신고한다. 지급 여부는 서버가 자기가 아는 위치로
    // 다시 판정하므로, 이 호출을 위조해도 소용이 없다.
    this.observation = new ObservationTracker((spotIndex) => {
      room.send(CLIENT_MESSAGES.OBSERVE, { spotIndex });
      this.audio.play("fragmentSpawn");
      this.ui.showNotice("관측 완료 · 다음 별똥별을 먼저 알려 드립니다");
    });

    room.onMessage(
      SERVER_MESSAGES.METEOR_FORECAST,
      (payload: MeteorForecastPayload) => {
        const direction = this.effects?.forecast(payload) ?? "하늘";
        this.ui.showNotice(`예보 · ${direction} 쪽에 곧 떨어집니다`);
        this.audio.play("meteorWarning");
      }
    );
    room.onMessage(
      SERVER_MESSAGES.SHOWER_STARTED,
      (payload: ShowerStartedPayload) => {
        this.ui.showNotice(`유성우! 별똥별 ${payload.count}개가 연달아 옵니다`);
        this.audio.play("meteorWarning");
      }
    );
    callbacks.listen("skyGauge", (value) => {
      this.ui.setSkyGauge(value / CONFIG.SKY_GAUGE_GOAL);
    });
    room.onLeave((code) => {
      this.ui.showFatalError(`연결 종료 코드: ${code}`);
    });

    this.nextMeteorAt = room.state.nextMeteorAt;
    this.engine.runRenderLoop(() => {
      const deltaSeconds = Math.min(this.engine!.getDeltaTime() / 1000, 0.05);
      this.update(deltaSeconds, (payload) => {
        room.send(CLIENT_MESSAGES.MOVE, payload);
      }, (fragmentId) => {
        room.send(CLIENT_MESSAGES.COLLECT, { fragmentId });
      });
      this.scene!.render();
    });

    window.addEventListener("resize", () => this.engine?.resize());
  }

  private applyPlayerState(
    sessionId: string,
    localSessionId: string,
    player: PlayerState
  ): void {
    if (sessionId === localSessionId) {
      this.ui.setScore(player.score);
      // 지난 기록은 서버가 저장소를 읽은 뒤 채우므로 입장보다 조금 늦게 온다.
      this.ui.setProfile(player.total, player.best);
      // 서버가 최종 판정이므로 예측값을 여기서 맞춘다.
      this.localPlayer?.syncStamina(player.stamina);
      this.hasForecast = player.hasForecast;
      return;
    }
    const avatar = this.remotePlayers.get(sessionId);
    avatar?.setNetworkTarget(player.x, player.z, player.rotationY);
    // 이동 상태는 서버가 동기화해 주므로 그대로 애니메이션에 넘긴다.
    avatar?.setMoveState(player.moveState);
  }

  private update(
    deltaSeconds: number,
    sendMove: (payload: ReturnType<LocalPlayerController["snapshot"]>) => void,
    collect: (fragmentId: string) => void
  ): void {
    const localPlayer = this.localPlayer;
    const camera = this.camera;
    const effects = this.effects;
    if (!localPlayer || !camera || !effects) {
      return;
    }

    localPlayer.update(deltaSeconds);
    camera.follow(localPlayer.avatar.root.position);
    camera.update(deltaSeconds);
    localPlayer.avatar.updateRemote(deltaSeconds, camera.camera.position);
    this.remotePlayers.forEach((avatar) => {
      avatar.updateRemote(deltaSeconds, camera.camera.position);
    });
    effects.update(deltaSeconds);

    this.sendAccumulator += deltaSeconds;
    const sendInterval = 1 / CONFIG.MOVE_SEND_HZ;
    if (this.sendAccumulator >= sendInterval) {
      this.sendAccumulator %= sendInterval;
      sendMove(localPlayer.snapshot());
    }

    this.ui.setStamina(localPlayer.staminaRatio);

    const observation = this.observation?.update(
      deltaSeconds,
      localPlayer.avatar.root.position,
      camera.lookUpDegrees,
      this.hasForecast
    );
    if (observation) {
      this.ui.setObservation(
        observation.spotIndex !== undefined,
        observation.progress,
        observation.needsLookUp,
        this.hasForecast
      );
    }

    const nearest = effects.nearestFragment(localPlayer.avatar.root.position);
    const canCollect = Boolean(
      nearest && nearest.distance <= CONFIG.COLLECT_RADIUS
    );
    this.ui.setCollectPrompt(canCollect);
    if (canCollect && nearest && localPlayer.consumeCollect()) {
      collect(nearest.id);
    } else if (!canCollect) {
      localPlayer.consumeCollect();
    }

    this.ui.setMeteorTimer(this.nextMeteorAt, effects.isMeteorActive);
    this.updateCameraShake(deltaSeconds, camera.shakeOffset);
  }

  private updateCameraShake(deltaSeconds: number, offset: Vector3): void {
    if (this.cameraShakeTime <= 0) {
      offset.setAll(0);
      return;
    }
    this.cameraShakeTime = Math.max(0, this.cameraShakeTime - deltaSeconds);
    const amount = this.cameraShake * (this.cameraShakeTime / 0.45);
    offset.set(
      (Math.random() - 0.5) * amount,
      (Math.random() - 0.5) * amount,
      0
    );
  }
}
