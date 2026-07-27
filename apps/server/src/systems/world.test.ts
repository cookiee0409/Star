import { describe, expect, it } from "vitest";
import {
  CONFIG,
  OBSERVE_POINTS,
  WORLD_OBSTACLES,
  isWalkable
} from "@starfall/shared";

describe("world obstacles", () => {
  it("눈에 보이는 것보다 크게 막지 않는다", () => {
    // 예전에는 나무 한 그루 자리에 8×4m 상자를 두어, 화면에는 아무것도 없는데
    // 지나갈 수 없는 자리가 생겼다. 줄기 굵기를 넘는 판정은 다시 두지 않는다.
    for (const obstacle of WORLD_OBSTACLES) {
      const footprint =
        obstacle.kind === "cylinder"
          ? obstacle.radius * 2
          : Math.max(obstacle.width, obstacle.depth);
      expect(footprint, `${obstacle.x},${obstacle.z}`).toBeLessThanOrEqual(5);
    }
  });

  it("장애물 바로 옆까지 걸어갈 수 있다", () => {
    for (const obstacle of WORLD_OBSTACLES) {
      const reach =
        (obstacle.kind === "cylinder"
          ? obstacle.radius
          : Math.max(obstacle.width, obstacle.depth) / 2) +
        CONFIG.PLAYER_RADIUS +
        0.15;
      const beside = { x: obstacle.x + reach, z: obstacle.z };
      expect(isWalkable(beside), `${beside.x},${beside.z}`).toBe(true);
    }
  });

  it("장애물 한가운데는 막힌다", () => {
    for (const obstacle of WORLD_OBSTACLES) {
      expect(isWalkable({ x: obstacle.x, z: obstacle.z })).toBe(false);
    }
  });

  it("관측 지점은 모두 걸어갈 수 있다", () => {
    for (const point of OBSERVE_POINTS) {
      expect(isWalkable(point), `${point.x},${point.z}`).toBe(true);
    }
  });

  it("장애물끼리 겹치지 않는다", () => {
    // 겹치면 두 판정이 합쳐져 보이는 것보다 넓은 벽이 된다.
    for (let a = 0; a < WORLD_OBSTACLES.length; a += 1) {
      for (let b = a + 1; b < WORLD_OBSTACLES.length; b += 1) {
        const first = WORLD_OBSTACLES[a]!;
        const second = WORLD_OBSTACLES[b]!;
        const gap = Math.hypot(first.x - second.x, first.z - second.z);
        expect(gap, `${a} vs ${b}`).toBeGreaterThan(6);
      }
    }
  });
});
