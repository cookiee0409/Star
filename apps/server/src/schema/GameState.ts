import { MapSchema, Schema, type } from "@colyseus/schema";
import type { MoveState } from "@starfall/shared";

export class PlayerState extends Schema {
  @type("string") sessionId = "";
  @type("string") nickname = "";
  @type("number") x = 0;
  @type("number") z = 0;
  @type("number") rotationY = 0;
  @type("string") moveState: MoveState = "idle";
  @type("number") score = 0;
}

export class FragmentState extends Schema {
  @type("string") id = "";
  @type("number") x = 0;
  @type("number") z = 0;
}

export class GameState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type({ map: FragmentState }) fragments = new MapSchema<FragmentState>();
  @type("number") nextMeteorAt = 0;
}

