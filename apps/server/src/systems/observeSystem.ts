// 관측 판정.
//
// 클라이언트는 "몇 번 지점에서 관측을 마쳤다"고 신고만 한다. 좌표는 보내지
// 않는다 — 보내 봐야 믿을 수 없기 때문이다. 서버가 자기가 아는 플레이어
// 위치로 다시 재고, 멀면 그냥 버린다.
import { CONFIG, OBSERVE_POINTS, type Point2D } from "@starfall/shared";

/** 클라이언트 왕복과 이동 보간 때문에 생기는 오차를 감안한 여유(m). */
const TOLERANCE = 0.5;

export type ObserveRejection = "unknown-spot" | "too-far" | "already-held";

export type ObserveResult =
  | { ok: true }
  | { ok: false; reason: ObserveRejection };

export function validateObservation(
  position: Point2D,
  spotIndex: number,
  alreadyHasForecast: boolean
): ObserveResult {
  if (!Number.isInteger(spotIndex)) {
    return { ok: false, reason: "unknown-spot" };
  }
  const spot = OBSERVE_POINTS[spotIndex];
  if (!spot) {
    return { ok: false, reason: "unknown-spot" };
  }
  // 이미 들고 있으면 쌓이지 않는다. 한 번에 하나다.
  if (alreadyHasForecast) {
    return { ok: false, reason: "already-held" };
  }

  const distance = Math.hypot(position.x - spot.x, position.z - spot.z);
  if (distance > CONFIG.OBSERVE_RADIUS + TOLERANCE) {
    return { ok: false, reason: "too-far" };
  }
  return { ok: true };
}
