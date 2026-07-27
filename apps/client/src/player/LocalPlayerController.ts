import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  CONFIG,
  resolveMovement,
  updateStamina,
  type MovePayload,
  type MoveState
} from "@starfall/shared";
import type { GameCamera } from "../camera/createGameCamera";
import { InputController } from "./InputController";
import { lerpAngle, PlayerAvatar } from "./PlayerAvatar";

export class LocalPlayerController {
  private readonly input: InputController;
  private moveState: MoveState = "idle";
  /**
   * 스태미나 예측값.
   *
   * 서버가 최종 판정을 하지만 여기서도 같은 식(shared 의 updateStamina)으로
   * 굴려야 한다. 클라이언트만 계속 달리면 서버가 이동 거리를 초과로 보고
   * 거절해 캐릭터가 뒤로 튕긴다.
   */
  private stamina: number = CONFIG.STAMINA_MAX;

  constructor(
    readonly avatar: PlayerAvatar,
    private readonly camera: GameCamera
  ) {
    this.input = new InputController();
  }

  /** HUD 표시용. 0~1 로 정규화해서 준다. */
  get staminaRatio(): number {
    return this.stamina / CONFIG.STAMINA_MAX;
  }

  /** 서버가 보내온 값으로 예측을 맞춘다. 오래 굴리면 조금씩 어긋난다. */
  syncStamina(value: number): void {
    this.stamina = value;
  }

  update(deltaSeconds: number): void {
    const horizontal = this.input.horizontal;
    const vertical = this.input.vertical;
    const hasInput = horizontal !== 0 || vertical !== 0;

    const wasRunning = this.moveState === "run";
    const requested: MoveState = !hasInput
      ? "idle"
      : this.input.running
        ? "run"
        : "walk";
    const settled = updateStamina(
      this.stamina,
      requested,
      deltaSeconds,
      wasRunning
    );
    this.stamina = settled.stamina;

    if (!hasInput) {
      this.moveState = "idle";
      this.avatar.setMoveState(this.moveState);
      return;
    }

    const forward = this.camera.flattenedForward();
    const right = Vector3.Cross(Vector3.Up(), forward).normalize();
    const direction = forward.scale(vertical).add(right.scale(horizontal)).normalize();
    const running = settled.allowed === "run";
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
    this.avatar.setMoveState(this.moveState);
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

