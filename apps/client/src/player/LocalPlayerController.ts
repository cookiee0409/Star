import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  CONFIG,
  resolveMovement,
  type MovePayload,
  type MoveState
} from "@starfall/shared";
import type { GameCamera } from "../camera/createGameCamera";
import { InputController } from "./InputController";
import { lerpAngle, PlayerAvatar } from "./PlayerAvatar";

export class LocalPlayerController {
  private readonly input: InputController;
  private moveState: MoveState = "idle";

  constructor(
    readonly avatar: PlayerAvatar,
    private readonly camera: GameCamera
  ) {
    this.input = new InputController();
  }

  update(deltaSeconds: number): void {
    const horizontal = this.input.horizontal;
    const vertical = this.input.vertical;
    const hasInput = horizontal !== 0 || vertical !== 0;

    if (!hasInput) {
      this.moveState = "idle";
      return;
    }

    const forward = this.camera.flattenedForward();
    const right = Vector3.Cross(Vector3.Up(), forward).normalize();
    const direction = forward.scale(vertical).add(right.scale(horizontal)).normalize();
    const running = this.input.running;
    const speed = running ? CONFIG.RUN_SPEED : CONFIG.WALK_SPEED;
    const delta = direction.scale(speed * deltaSeconds);
    const current = {
      x: this.avatar.root.position.x,
      z: this.avatar.root.position.z
    };
    const resolved = resolveMovement(current, { x: delta.x, z: delta.z });

    this.avatar.root.position.x = resolved.x;
    this.avatar.root.position.z = resolved.z;
    const targetRotation = Math.atan2(direction.x, direction.z);
    const rotationAmount = 1 - Math.pow(1 - CONFIG.ROTATION_LERP, deltaSeconds * 60);
    this.avatar.root.rotation.y = lerpAngle(
      this.avatar.root.rotation.y,
      targetRotation,
      Math.min(1, rotationAmount)
    );
    this.moveState = running ? "run" : "walk";
  }

  snapshot(): MovePayload {
    return {
      x: this.avatar.root.position.x,
      z: this.avatar.root.position.z,
      rotationY: this.avatar.root.rotation.y,
      moveState: this.moveState
    };
  }

  consumeCollect(): boolean {
    return this.input.consumeCollect();
  }
}

