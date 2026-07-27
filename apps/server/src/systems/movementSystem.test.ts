import { describe, expect, it } from "vitest";
import { CONFIG, PlayerState, type MovePayload } from "@starfall/shared";
import { validateAndApplyMovement } from "./movementSystem";

const move = (payload: Partial<MovePayload>): MovePayload => ({
  x: 0,
  z: 0,
  y: 0,
  rotationY: 0,
  moveState: "walk",
  ...payload
});

describe("movement validation", () => {
  it("accepts ordinary movement and rejects a teleport", () => {
    const player = new PlayerState();
    const accepted = validateAndApplyMovement(
      player,
      move({ x: 0.4, rotationY: 1 }),
      100
    );
    const rejected = validateAndApplyMovement(
      player,
      move({ x: 20, rotationY: 1, moveState: "run" }),
      100
    );

    expect(accepted.accepted).toBe(true);
    expect(rejected).toEqual({ accepted: false, reason: "too-fast" });
    expect(player.x).toBe(0.4);
  });

  it("rejects non-finite coordinates", () => {
    const player = new PlayerState();
    expect(
      validateAndApplyMovement(
        player,
        move({ x: Number.NaN, moveState: "idle" }),
        100
      )
    ).toEqual({ accepted: false, reason: "invalid" });
  });

  it("accepts a jump within reach", () => {
    const player = new PlayerState();
    const peak = (CONFIG.JUMP_SPEED * CONFIG.JUMP_SPEED) / (2 * CONFIG.GRAVITY);
    const result = validateAndApplyMovement(
      player,
      move({ y: peak, moveState: "jump" }),
      100
    );
    expect(result.accepted).toBe(true);
    expect(player.y).toBeCloseTo(peak);
  });

  it("rejects a height no jump could reach", () => {
    // 높이를 위조해 지형 위로 올라서는 것을 막는다.
    const player = new PlayerState();
    expect(
      validateAndApplyMovement(player, move({ y: 40, moveState: "jump" }), 100)
    ).toEqual({ accepted: false, reason: "invalid" });
  });

  it("rejects negative height", () => {
    const player = new PlayerState();
    expect(
      validateAndApplyMovement(player, move({ y: -3 }), 100)
    ).toEqual({ accepted: false, reason: "invalid" });
  });
});
