import { describe, expect, it } from "vitest";
import { PlayerState } from "../schema/GameState";
import { validateAndApplyMovement } from "./movementSystem";

describe("movement validation", () => {
  it("accepts ordinary movement and rejects a teleport", () => {
    const player = new PlayerState();
    const accepted = validateAndApplyMovement(
      player,
      { x: 0.4, z: 0, rotationY: 1, moveState: "walk" },
      100
    );
    const rejected = validateAndApplyMovement(
      player,
      { x: 20, z: 0, rotationY: 1, moveState: "run" },
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
        { x: Number.NaN, z: 0, rotationY: 0, moveState: "idle" },
        100
      )
    ).toEqual({ accepted: false, reason: "invalid" });
  });
});

