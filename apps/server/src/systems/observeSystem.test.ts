import { describe, expect, it } from "vitest";
import { CONFIG, OBSERVE_POINTS } from "@starfall/shared";
import { validateObservation } from "./observeSystem";

const spot = OBSERVE_POINTS[0]!;

describe("validateObservation", () => {
  it("지점 안에 있으면 통과한다", () => {
    expect(validateObservation(spot, 0, false)).toEqual({ ok: true });
  });

  it("멀리 있으면 거절한다", () => {
    // 클라이언트가 "관측했다"고 우겨도 서버가 아는 위치로 판정한다.
    const far = { x: spot.x + 40, z: spot.z };
    expect(validateObservation(far, 0, false)).toEqual({
      ok: false,
      reason: "too-far"
    });
  });

  it("경계 바로 바깥은 여유 안에서 봐준다", () => {
    // 이동 보간과 왕복 지연 때문에 딱 잘라내면 억울한 경우가 생긴다.
    const edge = { x: spot.x + CONFIG.OBSERVE_RADIUS + 0.4, z: spot.z };
    expect(validateObservation(edge, 0, false).ok).toBe(true);
  });

  it("여유를 넘으면 거절한다", () => {
    const outside = { x: spot.x + CONFIG.OBSERVE_RADIUS + 2, z: spot.z };
    expect(validateObservation(outside, 0, false).ok).toBe(false);
  });

  it("없는 지점 번호는 거절한다", () => {
    const rejected = { ok: false, reason: "unknown-spot" };
    expect(validateObservation(spot, 99, false)).toEqual(rejected);
    expect(validateObservation(spot, -1, false)).toEqual(rejected);
    expect(validateObservation(spot, 1.5, false)).toEqual(rejected);
  });

  it("이미 예보를 들고 있으면 더 쌓이지 않는다", () => {
    expect(validateObservation(spot, 0, true)).toEqual({
      ok: false,
      reason: "already-held"
    });
  });

  it("관측 지점은 모두 걸어갈 수 있는 자리다", async () => {
    // 장애물 안이나 맵 밖에 두면 아예 도달할 수 없다.
    const { isWalkable } = await import("@starfall/shared");
    for (const point of OBSERVE_POINTS) {
      expect(isWalkable(point), `${point.x},${point.z}`).toBe(true);
    }
  });
});
