import { randomUUID } from "node:crypto";
import type { Client } from "@colyseus/core";
import { Room } from "@colyseus/core";
import {
  CLIENT_MESSAGES,
  CONFIG,
  PLAYER_START_POINTS,
  SERVER_MESSAGES,
  isValidNickname,
  sanitizeNickname,
  type CollectPayload,
  type FragmentCollectedPayload,
  type JoinOptions,
  type MeteorImpactPayload,
  type MeteorWarningPayload,
  type MovePayload
} from "@starfall/shared";
import {
  FragmentState,
  GameState,
  PlayerState
} from "../schema/GameState";
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
