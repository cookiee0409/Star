import { Callbacks } from "@colyseus/sdk";
import {
  Engine,
  Scene,
  Vector3
} from "@babylonjs/core";
import {
  CLIENT_MESSAGES,
  CONFIG,
  SERVER_MESSAGES,
  type FragmentCollectedPayload,
  type MeteorImpactPayload,
  type MeteorWarningPayload,
  type PlayerState
} from "@starfall/shared";
import { GameCamera } from "./camera/createGameCamera";
import { MeteorEffects } from "./meteor/MeteorEffects";
import { GameConnection } from "./net/GameConnection";
import { LocalPlayerController } from "./player/LocalPlayerController";
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
  private sendAccumulator = 0;
  private nextMeteorAt = 0;
  private playerCount = 0;
  private cameraShake = 0;
  private cameraShakeTime = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly ui: UIController
  ) {}

  async start(nickname: string): Promise<void> {
    const serverUrl =
      import.meta.env.VITE_SERVER_URL?.trim() || "http://localhost:2567";
    const connection = new GameConnection(serverUrl);
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
    createWorld(this.scene);
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
        isLocal
      );

      if (isLocal) {
        this.localPlayer = new LocalPlayerController(avatar, this.camera!);
        this.ui.setScore(player.score);
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
      }
    );
    room.onMessage(
      SERVER_MESSAGES.FRAGMENT_COLLECTED,
      (payload: FragmentCollectedPayload) => {
        this.ui.showNotice(`${payload.byNickname} 님이 별 조각을 획득했습니다`);
      }
    );
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
      return;
    }
    this.remotePlayers
      .get(sessionId)
      ?.setNetworkTarget(player.x, player.z, player.rotationY);
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
    this.updateCameraShake(deltaSeconds, camera.camera.target);
  }

  private updateCameraShake(deltaSeconds: number, target: Vector3): void {
    if (this.cameraShakeTime <= 0) {
      return;
    }
    this.cameraShakeTime = Math.max(0, this.cameraShakeTime - deltaSeconds);
    const amount = this.cameraShake * (this.cameraShakeTime / 0.45);
    target.x += (Math.random() - 0.5) * amount;
    target.y += (Math.random() - 0.5) * amount;
  }
}
