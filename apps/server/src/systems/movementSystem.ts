import {
  CONFIG,
  isWalkable,
  type MovePayload,
  type PlayerState
} from "@starfall/shared";

export interface MovementValidationResult {
  accepted: boolean;
  reason?: "invalid" | "blocked" | "too-fast";
}

/** v²/2g. 도약 속도와 중력이 정하는 최고 높이. */
const MAX_JUMP_HEIGHT =
  (CONFIG.JUMP_SPEED * CONFIG.JUMP_SPEED) / (2 * CONFIG.GRAVITY);

export function validateAndApplyMovement(
  player: PlayerState,
  payload: MovePayload,
  elapsedMs: number
): MovementValidationResult {
  const values = [payload.x, payload.z, payload.y, payload.rotationY];
  if (!values.every(Number.isFinite)) {
    return { accepted: false, reason: "invalid" };
  }

  if (!["idle", "walk", "run", "jump"].includes(payload.moveState)) {
    return { accepted: false, reason: "invalid" };
  }

  // 높이는 점프 한 번으로 닿을 수 있는 범위 안이어야 한다.
  // 궤적까지 서버에서 다시 굴리지는 않는다 — 이 게임에서 높이로 이득을 볼
  // 것이 없어(수집 판정은 x·z 거리로만 한다) 상한만 막으면 충분하다.
  if (payload.y < 0 || payload.y > MAX_JUMP_HEIGHT + 0.5) {
    return { accepted: false, reason: "invalid" };
  }

  if (!isWalkable(payload)) {
    return { accepted: false, reason: "blocked" };
  }

  const clampedElapsedSeconds = Math.min(Math.max(elapsedMs, 0), 500) / 1000;
  const allowedDistance = CONFIG.RUN_SPEED * clampedElapsedSeconds + 0.55;
  if (Math.hypot(payload.x - player.x, payload.z - player.z) > allowedDistance) {
    return { accepted: false, reason: "too-fast" };
  }

  player.x = payload.x;
  player.z = payload.z;
  player.y = payload.y;
  player.rotationY = payload.rotationY;
  player.moveState = payload.moveState;
  return { accepted: true };
}

