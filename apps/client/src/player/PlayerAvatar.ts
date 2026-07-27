import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";
import type { MoveState } from "@starfall/shared";
import "@babylonjs/core/Rendering/outlineRenderer";
import { enableToonOutline, getToonMaterial } from "../scene/toonMaterial";
import {
  OUTLINE_COLOR,
  OUTLINE_WIDTH,
  createCharacterInstance,
  pickCharacter,
  type CharacterInstance,
  type CharacterPack
} from "./characterAssets";
import { CONFIG } from "@starfall/shared";

function colorFromId(id: string): Color3 {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) | 0;
  }
  const palette = [
    new Color3(0.47, 0.83, 0.85),
    new Color3(0.92, 0.59, 0.72),
    new Color3(0.95, 0.74, 0.4),
    new Color3(0.59, 0.55, 0.95),
    new Color3(0.55, 0.82, 0.53)
  ];
  return palette[Math.abs(hash) % palette.length] ?? palette[0]!;
}

function createNameplate(
  nickname: string,
  scene: Scene,
  parent: AbstractMesh,
  height: number
): Mesh {
  const plane = MeshBuilder.CreatePlane(
    `nameplate-${nickname}`,
    { width: 2.2, height: 0.52 },
    scene
  );
  plane.parent = parent;
  // 루트가 발밑에 있으므로 머리 위로 올린다.
  plane.position.y = height;
  plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
  plane.isPickable = false;

  const texture = new DynamicTexture(
    `nameplate-texture-${nickname}`,
    { width: 512, height: 128 },
    scene,
    true
  );
  texture.hasAlpha = true;
  const context =
    texture.getContext() as unknown as CanvasRenderingContext2D;
  context.clearRect(0, 0, 512, 128);
  context.fillStyle = "rgba(17, 14, 29, 0.82)";
  context.beginPath();
  context.roundRect(22, 14, 468, 92, 38);
  context.fill();
  context.strokeStyle = "rgba(255, 255, 255, 0.18)";
  context.lineWidth = 3;
  context.stroke();
  context.fillStyle = "#fffaff";
  context.font = "600 42px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(nickname, 256, 62, 425);
  texture.update();

  const material = new StandardMaterial(`nameplate-material-${nickname}`, scene);
  material.diffuseTexture = texture;
  material.opacityTexture = texture;
  material.emissiveColor = Color3.White();
  material.disableLighting = true;
  material.backFaceCulling = false;
  plane.material = material;
  return plane;
}

/** 말풍선이 떠 있는 시간(초). */
const BUBBLE_SECONDS = 4.5;
const BUBBLE_WIDTH = 512;
const BUBBLE_HEIGHT = 160;

/**
 * 말풍선 텍스처를 다시 그린다.
 *
 * 캔버스라 글자 수에 맞춰 배경 폭을 재야 한다. 너무 긴 말은 두 줄로 접고,
 * 그래도 넘치면 잘라낸다 — 채팅은 서버에서 100자로 제한된다.
 */
function drawBubble(texture: DynamicTexture, text: string): void {
  const context = texture.getContext() as unknown as CanvasRenderingContext2D;
  context.clearRect(0, 0, BUBBLE_WIDTH, BUBBLE_HEIGHT);
  context.font = "600 34px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";

  const lines: string[] = [];
  let line = "";
  for (const character of text) {
    const candidate = line + character;
    if (context.measureText(candidate).width > BUBBLE_WIDTH - 90 && line) {
      lines.push(line);
      line = character;
      if (lines.length === 2) {
        break;
      }
    } else {
      line = candidate;
    }
  }
  if (lines.length < 2 && line) {
    lines.push(line);
  }

  const widest = Math.max(...lines.map((entry) => context.measureText(entry).width));
  const boxWidth = Math.min(BUBBLE_WIDTH - 16, widest + 54);
  const boxHeight = lines.length > 1 ? 108 : 68;
  const left = (BUBBLE_WIDTH - boxWidth) / 2;
  const top = (BUBBLE_HEIGHT - boxHeight) / 2 - 8;

  context.fillStyle = "rgba(255, 250, 255, 0.94)";
  context.beginPath();
  context.roundRect(left, top, boxWidth, boxHeight, 24);
  context.fill();

  // 꼬리. 아래를 가리켜 누가 한 말인지 분명해진다.
  context.beginPath();
  context.moveTo(BUBBLE_WIDTH / 2 - 13, top + boxHeight - 2);
  context.lineTo(BUBBLE_WIDTH / 2 + 13, top + boxHeight - 2);
  context.lineTo(BUBBLE_WIDTH / 2, top + boxHeight + 22);
  context.closePath();
  context.fill();

  context.fillStyle = "#171326";
  lines.forEach((entry, index) => {
    const offset = lines.length > 1 ? index * 40 - 20 : 0;
    context.fillText(entry, BUBBLE_WIDTH / 2, top + boxHeight / 2 + offset);
  });
  texture.update();
}

export class PlayerAvatar {
  /** 발이 닿는 지점. 위치·회전은 항상 이 노드가 기준이다. */
  readonly root: Mesh;
  readonly nameplate: Mesh;
  private readonly bubble: Mesh;
  private readonly bubbleTexture: DynamicTexture;
  private bubbleTimer: number | undefined;
  private targetPosition: Vector3;
  private targetRotation = 0;
  private readonly isLocal: boolean;
  private readonly character: CharacterInstance | undefined;
  /** 외곽선이 켜진 파트와 기준 두께. 매 프레임 두께를 맞추려고 미리 모아 둔다. */
  private readonly outlined: { mesh: AbstractMesh; width: number }[] = [];

  constructor(
    scene: Scene,
    sessionId: string,
    nickname: string,
    position: { x: number; z: number },
    isLocal: boolean,
    pack?: CharacterPack
  ) {
    this.isLocal = isLocal;
    const color = isLocal ? new Color3(0.46, 0.9, 0.87) : colorFromId(sessionId);

    // 빈 루트를 지면에 두고 몸통을 그 아래 붙인다.
    // 캡슐이든 모델이든 바깥에서는 root 하나만 다루면 된다.
    this.root = new Mesh(`player-${sessionId}`, scene);
    this.root.position.set(position.x, 0, position.z);
    this.root.isPickable = false;

    // 색은 캡슐로 떨어졌을 때만 쓰인다. 모델은 자기 텍스처를 그대로 입는다.
    const container = pack ? pickCharacter(pack, sessionId) : undefined;
    this.character = container
      ? createCharacterInstance(container, scene, `player-${sessionId}`, color)
      : undefined;

    if (this.character) {
      this.character.root.parent = this.root;
    } else {
      this.buildCapsule(scene, sessionId, color);
    }

    // 이름표는 모델 키에 맞춰 올린다. 캐릭터를 바꿔도 붕 뜨거나 겹치지 않는다.
    const headHeight = this.measureHeight() + 0.35;
    this.nameplate = createNameplate(nickname, scene, this.root, headHeight);

    // 말풍선은 이름표보다 위에 둔다. 겹치면 둘 다 읽기 어렵다.
    this.bubble = MeshBuilder.CreatePlane(
      `bubble-${sessionId}`,
      { width: 2.6, height: 0.82 },
      scene
    );
    this.bubble.parent = this.root;
    this.bubble.position.y = headHeight + 0.62;
    this.bubble.billboardMode = Mesh.BILLBOARDMODE_ALL;
    this.bubble.isPickable = false;
    this.bubble.setEnabled(false);

    this.bubbleTexture = new DynamicTexture(
      `bubble-texture-${sessionId}`,
      { width: BUBBLE_WIDTH, height: BUBBLE_HEIGHT },
      scene,
      true
    );
    this.bubbleTexture.hasAlpha = true;
    const bubbleMaterial = new StandardMaterial(`bubble-material-${sessionId}`, scene);
    bubbleMaterial.diffuseTexture = this.bubbleTexture;
    bubbleMaterial.opacityTexture = this.bubbleTexture;
    bubbleMaterial.emissiveColor = Color3.White();
    bubbleMaterial.disableLighting = true;
    bubbleMaterial.backFaceCulling = false;
    this.bubble.material = bubbleMaterial;

    this.targetPosition = this.root.position.clone();

    this.root.getChildMeshes().forEach((mesh) => {
      if (mesh.renderOutline) {
        this.outlined.push({ mesh, width: mesh.outlineWidth });
      }
    });
  }

  /** 지금 붙어 있는 몸통의 실제 키를 잰다. */
  private measureHeight(): number {
    const { min, max } = this.root.getHierarchyBoundingVectors(true);
    const height = max.y - min.y;
    return Number.isFinite(height) && height > 0.1 ? height : 2.25;
  }

  /** 모델이 없을 때 쓰는 기본 몸통. */
  private buildCapsule(scene: Scene, sessionId: string, color: Color3): void {
    const body = MeshBuilder.CreateCapsule(
      `player-body-${sessionId}`,
      { height: 2.25, radius: CONFIG.PLAYER_RADIUS, tessellation: 12 },
      scene
    );
    body.parent = this.root;
    body.position.y = 1.125;
    body.isPickable = false;

    // 머티리얼은 색이 같으면 공유한다. 모델과 같은 규칙이다.
    body.material = getToonMaterial(scene, `player-material-${sessionId}`, {
      color
    });
    enableToonOutline(body, scene, OUTLINE_WIDTH * 1.75, OUTLINE_COLOR);

    const visor = MeshBuilder.CreateSphere(
      `visor-${sessionId}`,
      { diameter: 0.46, segments: 10 },
      scene
    );
    visor.parent = body;
    visor.position.set(0, 0.37, 0.45);
    visor.scaling.set(1.2, 0.62, 0.38);
    visor.isPickable = false;
    visor.material = getToonMaterial(scene, `visor-material-${sessionId}`, {
      color: new Color3(0.12, 0.14, 0.23)
    });
  }

  /** 이동 상태에 맞는 애니메이션으로 전환한다. 모델이 없으면 아무 일도 하지 않는다. */
  setMoveState(state: MoveState): void {
    this.character?.setMoveState(state);
  }

  setNetworkTarget(x: number, y: number, z: number, rotationY: number): void {
    this.targetPosition.set(x, y, z);
    this.targetRotation = rotationY;
  }

  /**
   * 머리 위 말풍선.
   *
   * 이름표와 같은 방식(빌보드 평면 + 캔버스 텍스처)이다. 남이 보낸 문자열을
   * 캔버스에 그리므로 DOM 이 아니고, 태그가 실행될 여지가 없다.
   */
  say(text: string): void {
    if (this.bubbleTimer !== undefined) {
      window.clearTimeout(this.bubbleTimer);
    }
    drawBubble(this.bubbleTexture, text);
    this.bubble.setEnabled(true);
    this.bubbleTimer = window.setTimeout(() => {
      this.bubble.setEnabled(false);
    }, BUBBLE_SECONDS * 1000);
  }

  updateRemote(deltaSeconds: number, cameraPosition: Vector3): void {
    if (!this.isLocal) {
      const amount = 1 - Math.pow(1 - CONFIG.REMOTE_INTERPOLATION, deltaSeconds * 60);
      this.root.position = Vector3.Lerp(
        this.root.position,
        this.targetPosition,
        Math.min(1, amount)
      );
      this.root.rotation.y = lerpAngle(
        this.root.rotation.y,
        this.targetRotation,
        Math.min(1, amount)
      );
    }

    const distance = Vector3.Distance(this.root.position, cameraPosition);
    const near = distance <= CONFIG.NAMEPLATE_HIDE_DISTANCE;
    this.nameplate.setEnabled(near);
    // 말풍선은 멀면 숨기되, 가까워졌다고 지나간 말이 되살아나면 안 된다.
    if (!near) {
      this.bubble.setEnabled(false);
    }

    // 외곽선 두께는 월드 단위라 줌인하면 굵어지고 줌아웃하면 사라진다.
    // 기준 거리에 맞춰 보정해 화면에서 보이는 선 굵기를 일정하게 유지한다.
    // 아니메 룩에서 선 굵기는 셰이딩만큼 눈에 띄는 요소다.
    const scale = Math.min(1.7, Math.max(0.7, distance / CONFIG.CAM_DISTANCE));
    for (const entry of this.outlined) {
      entry.mesh.outlineWidth = entry.width * scale;
    }
  }

  dispose(): void {
    if (this.bubbleTimer !== undefined) {
      window.clearTimeout(this.bubbleTimer);
    }
    this.bubble.material?.dispose(false, true);
    this.character?.dispose();
    // 이름표만 이 아바타의 것이다. 텍스처까지 직접 정리한다.
    // 몸통 머티리얼은 플레이어끼리 공유하므로 여기서 지우면 안 된다.
    this.nameplate.material?.dispose(false, true);
    this.root.dispose(false, false);
  }
}

export function lerpAngle(current: number, target: number, amount: number): number {
  const difference =
    ((target - current + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return current + difference * amount;
}
