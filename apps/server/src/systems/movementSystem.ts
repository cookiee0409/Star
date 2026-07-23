import {
  CONFIG,
  isWalkable,
  type MovePayload
} from "@starfall/shared";
import type { PlayerState } from "../schema/GameState";

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
  const allowedDistance = CONFIG.RUN_SPEED * clampedElapsedSeconds + 0.55;
  if (Math.hypot(payload.x - player.x, payload.z - player.z) > allowedDistance) {
    return { accepted: false, reason: "too-fast" };
  }

  player.x = payload.x;
  player.z = payload.z;
  player.rotationY = payload.rotationY;
  player.moveState = payload.moveState;
  return { accepted: true };
}

