import { randomUUID } from "node:crypto";
import type { Client } from "@colyseus/core";
import { Room } from "@colyseus/core";
import {
  CLIENT_MESSAGES,
  CONFIG,
  FragmentState,
  GameState,
  PLAYER_START_POINTS,
  PlayerState,
  SERVER_MESSAGES,
  isValidNickname,
  sanitizeChat,
  sanitizeNickname,
  sanitizePlayerId,
  type ChatMessagePayload,
  type ChatPayload,
  type CollectPayload,
  type FragmentCollectedPayload,
  type JoinOptions,
  type MeteorForecastPayload,
  type MeteorImpactPayload,
  type MeteorWarningPayload,
  type MovePayload,
  type ObservePayload,
  type Point2D,
  type ShowerStartedPayload
} from "@starfall/shared";
import {
  createFragmentPositions,
  tryCollectFragment
} from "../systems/fragmentSystem";
import {
  chooseMeteorTarget,
  randomFragmentCount,
  randomMeteorDelayMs
} from "../systems/meteorSystem";
import { validateAndApplyMovement } from "../systems/movementSystem";
import { validateObservation } from "../systems/observeSystem";
import { createScoreStore } from "../storage/ScoreStore";

function readMeteorScale(): number {
  const parsed = Number.parseFloat(process.env.METEOR_INTERVAL_SCALE ?? "1");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export class GameRoom extends Room<{ state: GameState }> {
  state = new GameState();
  maxClients = CONFIG.MAX_PLAYERS;

  private readonly lastMoveAt = new Map<string, number>();
  private readonly lastCollectAt = new Map<string, number>();
  private readonly lastChatAt = new Map<string, number>();
  private readonly lastChatText = new Map<string, string>();
  /** 세션 ID(접속마다 바뀜) -> 플레이어 ID(브라우저가 들고 다님). */
  private readonly playerIds = new Map<string, string>();
  private readonly store = createScoreStore();
  private scheduleVersion = 0;
  private readonly meteorIntervalScale = readMeteorScale();

  onCreate(): void {
    this.onMessage(
      CLIENT_MESSAGES.MOVE,
      (client: Client, payload: MovePayload) => {
        const player = this.state.players.get(client.sessionId);
        if (!player) {
          return;
        }

        const now = Date.now();
        const previous = this.lastMoveAt.get(client.sessionId) ?? now - 100;
        const result = validateAndApplyMovement(player, payload, now - previous);
        if (result.accepted) {
          this.lastMoveAt.set(client.sessionId, now);
        }
      }
    );

    this.onMessage(
      CLIENT_MESSAGES.COLLECT,
      (client: Client, payload: CollectPayload) => {
        if (!payload || typeof payload.fragmentId !== "string") {
          return;
        }

        const result = tryCollectFragment(
          this.state,
          client.sessionId,
          payload.fragmentId,
          Date.now(),
          this.lastCollectAt
        );
        if (!result.ok) {
          return;
        }

        const event: FragmentCollectedPayload = {
          fragmentId: payload.fragmentId,
          byNickname: result.nickname
        };
        this.broadcast(SERVER_MESSAGES.FRAGMENT_COLLECTED, event);
        this.addToSkyGauge();
      }
    );

    this.onMessage(
      CLIENT_MESSAGES.OBSERVE,
      (client: Client, payload: ObservePayload) => {
        const player = this.state.players.get(client.sessionId);
        if (!player || !payload) {
          return;
        }
        const result = validateObservation(
          player,
          payload.spotIndex,
          player.hasForecast
        );
        if (result.ok) {
          player.hasForecast = true;
        }
      }
    );

    this.onMessage(
      CLIENT_MESSAGES.CHAT,
      (client: Client, payload: ChatPayload) => {
        const player = this.state.players.get(client.sessionId);
        if (!player || !payload || typeof payload.text !== "string") {
          return;
        }
        // 길이 제한을 붙여 자르기 전에 통째로 정규화하면 아주 긴 문자열에
        // 정규식을 돌리게 된다. 먼저 넉넉히 자른 뒤 다듬는다.
        const text = sanitizeChat(
          payload.text.slice(0, CONFIG.CHAT_MAX_LENGTH * 4),
          CONFIG.CHAT_MAX_LENGTH
        );
        if (text.length === 0) {
          return;
        }

        const now = Date.now();
        const previous = this.lastChatAt.get(client.sessionId) ?? 0;
        if (now - previous < CONFIG.CHAT_COOLDOWN_MS) {
          return;
        }
        // 같은 말을 연달아 보내는 것도 도배다.
        if (this.lastChatText.get(client.sessionId) === text) {
          return;
        }
        this.lastChatAt.set(client.sessionId, now);
        this.lastChatText.set(client.sessionId, text);

        // 보낸 사람은 서버가 아는 닉네임으로 고정한다.
        // 클라이언트가 보낸 이름을 그대로 쓰면 남을 사칭할 수 있다.
        const message: ChatMessagePayload = {
          sessionId: client.sessionId,
          nickname: player.nickname,
          text,
          at: now
        };
        this.broadcast(SERVER_MESSAGES.CHAT, message);
      }
    );
  }

  onJoin(client: Client, options: JoinOptions): void {
    if (!options || !isValidNickname(options.nickname)) {
      throw new Error("닉네임은 문자와 숫자로 2~12자여야 합니다.");
    }

    // 신원이 없거나 형식이 어긋나면 새로 발급한다. 클라이언트가 이걸 받아
    // 저장해 두면 다음에 와서 기록을 이어받는다.
    const playerId = sanitizePlayerId(options.playerId) ?? randomUUID();
    this.playerIds.set(client.sessionId, playerId);

    const spawn =
      PLAYER_START_POINTS[this.state.players.size % PLAYER_START_POINTS.length] ??
      PLAYER_START_POINTS[0]!;
    const player = new PlayerState();
    player.sessionId = client.sessionId;
    player.nickname = sanitizeNickname(options.nickname);
    player.x = spawn.x;
    player.z = spawn.z;
    this.state.players.set(client.sessionId, player);
    this.lastMoveAt.set(client.sessionId, Date.now());

    console.log(
      `[room:${this.roomId}] ${player.nickname} joined (${this.clients.length}/${this.maxClients})`
    );

    if (this.clients.length === 1 && this.state.nextMeteorAt === 0) {
      this.scheduleNextMeteor();
    }

    // 지난 기록을 상태에 채운다. 저장소가 느리거나 실패해도 입장은 막지 않는다.
    void this.store
      .load(playerId)
      .then((record) => {
        // 읽는 동안 나갔을 수 있다.
        const current = this.state.players.get(client.sessionId);
        if (!current || !record) {
          return;
        }
        current.total = record.total;
        current.best = record.best;
      })
      .catch((error: unknown) => {
        console.warn("[store] 기록을 읽지 못했습니다.", error);
      });
  }

  onLeave(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    const nickname = player?.nickname ?? "player";

    // 나갈 때 이번 판 점수를 누적에 반영한다. 조각을 주울 때마다 쓰면 방이
    // 붐빌 때 저장이 잦아지고, 어차피 이 게임엔 중간 이탈로 잃을 게 없다.
    const playerId = this.playerIds.get(client.sessionId);
    if (playerId && player && player.score > 0) {
      void this.store
        .record(playerId, nickname, player.score)
        .catch((error: unknown) => {
          console.warn("[store] 기록을 저장하지 못했습니다.", error);
        });
    }
    this.playerIds.delete(client.sessionId);

    this.state.players.delete(client.sessionId);
    this.lastMoveAt.delete(client.sessionId);
    this.lastCollectAt.delete(client.sessionId);
    this.lastChatAt.delete(client.sessionId);
    this.lastChatText.delete(client.sessionId);

    console.log(
      `[room:${this.roomId}] ${nickname} left (${this.clients.length}/${this.maxClients})`
    );

    if (this.clients.length === 0) {
      this.scheduleVersion += 1;
      this.state.nextMeteorAt = 0;
    }
  }

  private scheduleNextMeteor(): void {
    if (this.clients.length === 0) {
      this.state.nextMeteorAt = 0;
      return;
    }

    const version = ++this.scheduleVersion;
    const delayMs = randomMeteorDelayMs(this.meteorIntervalScale);
    this.state.nextMeteorAt = Date.now() + delayMs;

    // 낙하 지점을 지금 정한다. 예보를 정규 경고보다 먼저 보내려면 그 시점에
    // 목표를 이미 알고 있어야 한다.
    const target = chooseMeteorTarget();
    this.scheduleForecast(version, target, delayMs);

    this.clock.setTimeout(() => {
      if (version !== this.scheduleVersion || this.clients.length === 0) {
        return;
      }
      this.beginMeteor(version, target);
    }, delayMs);
  }

  /**
   * 관측으로 예보를 받아 둔 사람에게만 조기 통보를 예약한다.
   *
   * 이게 관측의 보상이다. 남보다 OBSERVE_FORECAST_LEAD 초 먼저 출발할 수 있다.
   * 대기 시간이 그보다 짧으면(유성우 등) 예보를 건너뛴다 — 이미 늦었다.
   */
  private scheduleForecast(
    version: number,
    target: Point2D,
    delayMs: number
  ): void {
    const leadMs = CONFIG.OBSERVE_FORECAST_LEAD * 1000;
    const at = delayMs - leadMs;
    if (at <= 0) {
      return;
    }

    this.clock.setTimeout(() => {
      if (version !== this.scheduleVersion || this.clients.length === 0) {
        return;
      }
      const payload: MeteorForecastPayload = {
        targetX: target.x,
        targetZ: target.z,
        leadMs
      };
      for (const client of this.clients) {
        const player = this.state.players.get(client.sessionId);
        if (player?.hasForecast) {
          // 한 번 쓰면 사라진다. 다시 받으려면 또 관측해야 한다.
          player.hasForecast = false;
          client.send(SERVER_MESSAGES.METEOR_FORECAST, payload);
        }
      }
    }, at);
  }

  /**
   * 방 공동 게이지. 누가 줍든 함께 오른다.
   *
   * 가득 차면 유성우가 오고 게이지는 0으로 돌아간다. 경쟁 일변도에 협력 축을
   * 하나 얹는 장치라, 개인 점수와 달리 누구 것도 아니다.
   */
  private addToSkyGauge(): void {
    if (this.state.showerActive) {
      return;
    }
    this.state.skyGauge += 1;
    if (this.state.skyGauge < CONFIG.SKY_GAUGE_GOAL) {
      return;
    }

    this.state.skyGauge = 0;
    this.state.showerActive = true;
    const payload: ShowerStartedPayload = { count: CONFIG.SHOWER_METEORS };
    this.broadcast(SERVER_MESSAGES.SHOWER_STARTED, payload);

    // 예정된 별똥별을 취소하고 유성우로 대체한다. scheduleVersion 을 올리면
    // 대기 중이던 타이머가 스스로 물러난다.
    const version = ++this.scheduleVersion;
    this.state.nextMeteorAt = 0;
    for (let index = 0; index < CONFIG.SHOWER_METEORS; index += 1) {
      const isLast = index === CONFIG.SHOWER_METEORS - 1;
      this.clock.setTimeout(() => {
        if (version !== this.scheduleVersion || this.clients.length === 0) {
          return;
        }
        this.beginMeteor(version, chooseMeteorTarget(), isLast);
      }, index * CONFIG.SHOWER_INTERVAL * 1000);
    }
  }

  private beginMeteor(
    version: number,
    target: Point2D,
    isLastOfShower = true
  ): void {
    const meteorId = randomUUID();
    const etaMs = CONFIG.METEOR_WARNING_LEAD * 1000;
    this.state.nextMeteorAt = 0;

    const warning: MeteorWarningPayload = {
      meteorId,
      targetX: target.x,
      targetZ: target.z,
      etaMs
    };
    this.broadcast(SERVER_MESSAGES.METEOR_WARNING, warning);

    const impactDelayMs =
      etaMs + Math.round(CONFIG.METEOR_FALL_DURATION * 1000);
    this.clock.setTimeout(() => {
      if (version !== this.scheduleVersion || this.clients.length === 0) {
        return;
      }
      this.impactMeteor(meteorId, target);
      // 유성우 중간이면 다음 별똥별은 이미 예약돼 있다. 여기서 또 예약하면
      // 두 일정이 겹쳐 서로를 취소한다. 마지막 것만 평상시 주기로 돌아간다.
      if (isLastOfShower) {
        this.state.showerActive = false;
        this.scheduleNextMeteor();
      }
    }, impactDelayMs);
  }

  private impactMeteor(meteorId: string, target: { x: number; z: number }): void {
    const impact: MeteorImpactPayload = {
      meteorId,
      x: target.x,
      z: target.z
    };
    this.broadcast(SERVER_MESSAGES.METEOR_IMPACT, impact);

    const positions = createFragmentPositions(target, randomFragmentCount());
    positions.forEach((position, index) => {
      const fragmentId = `${meteorId}-${index}`;
      const fragment = new FragmentState();
      fragment.id = fragmentId;
      fragment.x = position.x;
      fragment.z = position.z;
      this.state.fragments.set(fragmentId, fragment);

      this.clock.setTimeout(() => {
        this.state.fragments.delete(fragmentId);
      }, CONFIG.FRAGMENT_LIFETIME * 1000);
    });
  }
}
