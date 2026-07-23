export type MoveState = "idle" | "walk" | "run";

export interface Point2D {
  x: number;
  z: number;
}

export interface MovePayload extends Point2D {
  rotationY: number;
  moveState: MoveState;
}

export interface CollectPayload {
  fragmentId: string;
}

export interface MeteorWarningPayload {
  meteorId: string;
  targetX: number;
  targetZ: number;
  etaMs: number;
}

export interface MeteorImpactPayload {
  meteorId: string;
  x: number;
  z: number;
}

export interface FragmentCollectedPayload {
  fragmentId: string;
  byNickname: string;
}

export interface JoinOptions {
  nickname: string;
}

