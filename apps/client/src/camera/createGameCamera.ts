import {
  ArcRotateCamera,
  ArcRotateCameraPointersInput,
  Scalar,
  Scene,
  Vector3
} from "@babylonjs/core";
import { CONFIG } from "@starfall/shared";

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

export class GameCamera {
  readonly camera: ArcRotateCamera;
  private desiredTarget = Vector3.Zero();

  constructor(scene: Scene, canvas: HTMLCanvasElement) {
    this.camera = new ArcRotateCamera(
      "game-camera",
      -Math.PI / 4,
      toRadians(CONFIG.CAM_PITCH_DEG),
      CONFIG.CAM_DISTANCE,
      Vector3.Zero(),
      scene
    );
    this.camera.fov = toRadians(CONFIG.CAM_FOV_DEG);
    this.camera.lowerRadiusLimit = CONFIG.CAM_MIN_ZOOM;
    this.camera.upperRadiusLimit = CONFIG.CAM_MAX_ZOOM;
    this.camera.lowerBetaLimit = toRadians(35);
    this.camera.upperBetaLimit = toRadians(58);
    this.camera.inertia = 0.74;
    this.camera.angularSensibilityX = 1_000;
    this.camera.angularSensibilityY = 1_200;
    this.camera.wheelPrecision = 28;
    this.camera.panningSensibility = 0;
    this.camera.attachControl(canvas, true);

    const pointerInput = this.camera.inputs.attached
      .pointers as ArcRotateCameraPointersInput | undefined;
    if (pointerInput) {
      pointerInput.buttons = [2];
    }

    canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  follow(position: Vector3): void {
    this.desiredTarget.copyFrom(position);
    this.desiredTarget.y = 0.75;
  }

  update(deltaSeconds: number): void {
    const amount = 1 - Math.pow(0.002, deltaSeconds);
    this.camera.target = Vector3.Lerp(
      this.camera.target,
      this.desiredTarget,
      Scalar.Clamp(amount, 0, 1)
    );
  }

  flattenedForward(): Vector3 {
    const direction = this.camera.getForwardRay().direction.clone();
    direction.y = 0;
    return direction.normalize();
  }
}
