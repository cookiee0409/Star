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
  /** 지면 위 높이. 점프 중에만 0 보다 크다. */
  private height = 0;
  private verticalSpeed = 0;

  constructor(
    readonly avatar: PlayerAvatar,
    private readonly camera: GameCamera
  ) {
    this.input = new InputController();
  }

  update(deltaSeconds: number): void {
    this.updateJump(deltaSeconds);

    const horizontal = this.input.horizontal;
    const vertical = this.input.vertical;
    const hasInput = horizontal !== 0 || vertical !== 0;
    const airborne = this.height > 0;

    if (!hasInput) {
      // 공중에서는 가만히 있어도 점프 자세를 유지한다.
      this.moveState = airborne ? "jump" : "idle";
      this.avatar.setMoveState(this.moveState);
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
    this.moveState = airborne ? "jump" : running ? "run" : "walk";
    this.avatar.setMoveState(this.moveState);
  }

  /**
   * 도약과 낙하.
   *
   * 서버는 높이의 상한만 확인하고 궤적은 다시 굴리지 않는다. 이 게임에서
   * 높이로 이득을 볼 것이 없기 때문이다 — 수집 판정은 x·z 거리로만 한다.
   * 그래서 여기서 계산한 값이 그대로 쓰인다.
   */
  private updateJump(deltaSeconds: number): void {
    if (this.height <= 0 && this.input.consumeJump()) {
      this.verticalSpeed = CONFIG.JUMP_SPEED;
    }
    if (this.height <= 0 && this.verticalSpeed <= 0) {
      return;
    }

    this.verticalSpeed -= CONFIG.GRAVITY * deltaSeconds;
    this.height += this.verticalSpeed * deltaSeconds;
    if (this.height <= 0) {
      this.height = 0;
      this.verticalSpeed = 0;
    }
    this.avatar.root.position.y = this.height;
  }

  snapshot(): MovePayload {
    return {
      x: this.avatar.root.position.x,
      z: this.avatar.root.position.z,
      y: this.height,
      rotationY: this.avatar.root.rotation.y,
      moveState: this.moveState
    };
  }

  consumeCollect(): boolean {
    return this.input.consumeCollect();
  }
}

