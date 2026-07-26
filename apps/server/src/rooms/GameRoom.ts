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
  type ChatMessagePayload,
  type ChatPayload,
  type CollectPayload,
  type FragmentCollectedPayload,
  type JoinOptions,
  type MeteorImpactPayload,
  type MeteorWarningPayload,
  type MovePayload
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
  }

  onLeave(client: Client): void {
    const nickname = this.state.players.get(client.sessionId)?.nickname ?? "player";
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

    this.clock.setTimeout(() => {
      if (version !== this.scheduleVersion || this.clients.length === 0) {
        return;
      }
      this.beginMeteor(version);
    }, delayMs);
  }

  private beginMeteor(version: number): void {
    const meteorId = randomUUID();
    const target = chooseMeteorTarget();
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
      this.scheduleNextMeteor();
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
