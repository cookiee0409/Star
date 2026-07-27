import {
  CONFIG,
  isWalkable,
  type MovePayload,
  updateStamina,
  type PlayerState
} from "@starfall/shared";

export interface MovementValidationResult {
  accepted: boolean;
  reason?: "invalid" | "blocked" | "too-fast";
}

export function validateAndApplyMovement(
  player: PlayerState,
  payload: MovePayload,
  elapsedMs: number
): MovementValidationResult {
  const values = [payload.x, payload.z, payload.rotationY];
  if (!values.every(Number.isFinite)) {
    return { accepted: false, reason: "invalid" };
  }

  if (!["idle", "walk", "run"].includes(payload.moveState)) {
    return { accepted: false, reason: "invalid" };
  }

  if (!isWalkable(payload)) {
    return { accepted: false, reason: "blocked" };
  }

  const clampedElapsedSeconds = Math.min(Math.max(elapsedMs, 0), 500) / 1000;

  // 스태미나를 먼저 정산한다. 남지 않았다면 달리기 요청이 걷기로 낮춰지고,
  // 허용 거리도 그만큼 줄어든다.
  const { stamina, allowed } = updateStamina(
    player.stamina,
    payload.moveState,
    clampedElapsedSeconds,
    player.moveState === "run"
  );
  player.stamina = stamina;

  const topSpeed = allowed === "run" ? CONFIG.RUN_SPEED : CONFIG.WALK_SPEED;
  const allowedDistance = topSpeed * clampedElapsedSeconds + 0.55;
  if (Math.hypot(payload.x - player.x, payload.z - player.z) > allowedDistance) {
    return { accepted: false, reason: "too-fast" };
  }

  player.x = payload.x;
  player.z = payload.z;
  player.rotationY = payload.rotationY;
  player.moveState = allowed;
  return { accepted: true };
}

