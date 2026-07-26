// 쿼터뷰 추적 카메라.
//
// ArcRotateCamera 를 쓰지 않는 이유: 그 카메라는 항상 대상을 바라본다. 그래서
// 위를 보려면 카메라 자신이 대상보다 아래로 내려가야 하고, 곧 땅속에 들어간다.
// 하늘을 올려다볼 수가 없다.
//
// targetScreenOffset 으로 우회해 봤지만 그것은 뷰를 "회전"시키는 게 아니라
// "평행이동"시킨다. 카메라를 옆으로 옮기는 것과 같아서, 무한히 먼 하늘은 그대로
// 있고 가까운 지형만 화면 밖으로 밀려났다.
//
// 그래서 궤도(카메라가 어디 있는가)와 시선(어디를 보는가)을 분리한다.
//   - 아래를 볼 때는 둘이 같다. 기존 궤도 카메라와 똑같이 동작한다.
//   - 수평보다 위를 볼 때는 카메라를 그 자리에 두고 시선만 든다.
// 덕분에 카메라가 땅에 박히지 않으면서 머리 꼭대기까지 올려다볼 수 있다.
import { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";
import { Scalar } from "@babylonjs/core/Maths/math.scalar";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import { CONFIG } from "@starfall/shared";

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/** 우클릭 드래그 감도. 값이 클수록 천천히 돈다(픽셀당 라디안의 역수). */
const YAW_SENSITIVITY = 380;
const PITCH_SENSITIVITY = 420;
const RIGHT_BUTTON = 2;

export class GameCamera {
  readonly camera: TargetCamera;
  /** 별똥별 충돌 연출이 쓰는 흔들림. 매 프레임 위치에 더해진다. */
  readonly shakeOffset = Vector3.Zero();

  private yaw = -Math.PI * 0.25;
  /** 시선의 상하 각. 양수면 내려다보고 음수면 올려다본다. */
  private pitch = toRadians(CONFIG.CAM_PITCH_DEG);
  // CONFIG 가 as const 라 그대로 두면 리터럴 타입(14)으로 좁혀져 줌이 막힌다.
  private distance: number = CONFIG.CAM_DISTANCE;
  private readonly focus = Vector3.Zero();
  private readonly desiredFocus = Vector3.Zero();
  private dragging = false;

  constructor(scene: Scene, canvas: HTMLCanvasElement) {
    this.camera = new TargetCamera(
      "game-camera",
      new Vector3(0, 8, -12),
      scene
    );
    this.camera.fov = toRadians(CONFIG.CAM_FOV_DEG);
    // 올려다보면 카메라가 캐릭터에 가까워진다. 기본값(1)이면 앞이 잘린다.
    this.camera.minZ = 0.3;
    scene.activeCamera = this.camera;

    // 입력은 직접 다룬다. Babylon 내장 입력은 대상을 바라보는 전제라 쓸 수 없다.
    canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    canvas.addEventListener("pointerdown", (event) => {
      if (event.button === RIGHT_BUTTON) {
        this.dragging = true;
        canvas.setPointerCapture(event.pointerId);
      }
    });
    canvas.addEventListener("pointerup", (event) => {
      if (event.button === RIGHT_BUTTON) {
        this.dragging = false;
        canvas.releasePointerCapture(event.pointerId);
      }
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!this.dragging) {
        return;
      }
      this.yaw += event.movementX / YAW_SENSITIVITY;
      this.pitch = Scalar.Clamp(
        this.pitch + event.movementY / PITCH_SENSITIVITY,
        -toRadians(CONFIG.CAM_LOOK_UP_MAX_DEG),
        toRadians(CONFIG.CAM_LOOK_DOWN_MAX_DEG)
      );
    });
    canvas.addEventListener(
      "wheel",
      (event) => {
        this.distance = Scalar.Clamp(
          this.distance + event.deltaY * 0.02,
          CONFIG.CAM_MIN_ZOOM,
          CONFIG.CAM_MAX_ZOOM
        );
      },
      { passive: true }
    );
  }

  follow(position: Vector3): void {
    this.desiredFocus.copyFrom(position);
    // 허리가 아니라 가슴 높이를 본다. 캐릭터가 화면 한가운데에서 조금 내려앉아
    // 위쪽에 하늘이 들어올 자리가 생긴다.
    this.desiredFocus.y = 1.2;
  }

  update(deltaSeconds: number): void {
    const amount = 1 - Math.pow(0.002, deltaSeconds);
    Vector3.LerpToRef(
      this.focus,
      this.desiredFocus,
      Scalar.Clamp(amount, 0, 1),
      this.focus
    );

    // 궤도 고도. 시선을 위로 들어도 카메라는 이 아래로 내려가지 않는다.
    const orbit = Scalar.Clamp(
      this.pitch,
      toRadians(CONFIG.CAM_ORBIT_MIN_DEG),
      toRadians(CONFIG.CAM_LOOK_DOWN_MAX_DEG)
    );

    // 카메라가 바라보는 수평 방향.
    const forwardX = Math.sin(this.yaw);
    const forwardZ = Math.cos(this.yaw);
    const flat = this.distance * Math.cos(orbit);
    const rise = this.distance * Math.sin(orbit);

    this.camera.position.set(
      this.focus.x - forwardX * flat + this.shakeOffset.x,
      this.focus.y + rise + this.shakeOffset.y,
      this.focus.z - forwardZ * flat + this.shakeOffset.z
    );
    // TargetCamera 는 rotation 에서 시선을 만든다.
    // forward = (cos(x)·sin(y), -sin(x), cos(x)·cos(y)) — 위 계산과 같은 규약이다.
    // orbit 과 pitch 가 같을 때는 정확히 focus 를 바라보고, pitch 가 더 위를
    // 가리키면 카메라는 그대로 둔 채 시선만 올라간다.
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }

  flattenedForward(): Vector3 {
    return new Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }
}
