import {
  CONFIG,
  isWalkable,
  type GameState,
  type Point2D
} from "@starfall/shared";

export type RandomSource = () => number;

function randomBetween(min: number, max: number, random: RandomSource): number {
  return min + random() * (max - min);
}

export function createFragmentPositions(
  impact: Point2D,
  count: number,
  random: RandomSource = Math.random
): Point2D[] {
  const positions: Point2D[] = [];
  const safeCount = Math.max(
    CONFIG.FRAGMENTS_MIN,
    Math.min(CONFIG.FRAGMENTS_MAX, Math.floor(count))
  );

  for (let index = 0; index < safeCount; index += 1) {
    let accepted: Point2D | undefined;

    for (let attempt = 0; attempt < 40; attempt += 1) {
      const angle = random() * Math.PI * 2;
      const radius = randomBetween(
        CONFIG.SCATTER_RADIUS_MIN,
        CONFIG.SCATTER_RADIUS_MAX,
        random
      );
      const candidate = {
        x: impact.x + Math.cos(angle) * radius,
        z: impact.z + Math.sin(angle) * radius
      };
      const separated = positions.every(
        (position) =>
          Math.hypot(position.x - candidate.x, position.z - candidate.z) >= 1.4
      );

      if (isWalkable(candidate, 0.4) && separated) {
        accepted = candidate;
        break;
      }
    }

    if (accepted) {
      positions.push(accepted);
    }
  }

  return positions;
}

export type CollectResult =
  | { ok: true; nickname: string; score: number }
  | {
      ok: false;
      reason: "cooldown" | "missing-player" | "missing-fragment" | "too-far";
    };

export function tryCollectFragment(
  state: GameState,
  sessionId: string,
  fragmentId: string,
  now: number,
  lastCollectAt: Map<string, number>
): CollectResult {
  const previousAttempt = lastCollectAt.get(sessionId) ?? 0;
  if (now - previousAttempt < CONFIG.COLLECT_REQUEST_COOLDOWN_MS) {
    return { ok: false, reason: "cooldown" };
  }
  lastCollectAt.set(sessionId, now);

  const player = state.players.get(sessionId);
  if (!player) {
    return { ok: false, reason: "missing-player" };
  }

  const fragment = state.fragments.get(fragmentId);
  if (!fragment) {
    return { ok: false, reason: "missing-fragment" };
  }

  const distance = Math.hypot(player.x - fragment.x, player.z - fragment.z);
  if (distance > CONFIG.COLLECT_RADIUS) {
    return { ok: false, reason: "too-far" };
  }

  state.fragments.delete(fragmentId);
  player.score += 1;
  return { ok: true, nickname: player.nickname, score: player.score };
}

