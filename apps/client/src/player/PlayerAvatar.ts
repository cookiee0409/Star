import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { Scene } from "@babylonjs/core/scene";
import type { MoveState } from "@starfall/shared";
import "@babylonjs/core/Rendering/outlineRenderer";
import { CellMaterial } from "@babylonjs/materials/cell/cellMaterial";
import {
  createCharacterInstance,
  type CharacterInstance
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
  parent: AbstractMesh
): Mesh {
  const plane = MeshBuilder.CreatePlane(
    `nameplate-${nickname}`,
    { width: 2.2, height: 0.52 },
    scene
  );
  plane.parent = parent;
  // 루트가 발밑에 있으므로 키 위로 올린다.
  plane.position.y = 2.75;
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

export class PlayerAvatar {
  /** 발이 닿는 지점. 위치·회전은 항상 이 노드가 기준이다. */
  readonly root: Mesh;
  readonly nameplate: Mesh;
  private targetPosition: Vector3;
  private targetRotation = 0;
  private readonly isLocal: boolean;
  private readonly character: CharacterInstance | undefined;

  constructor(
    scene: Scene,
    sessionId: string,
    nickname: string,
    position: { x: number; z: number },
    isLocal: boolean,
    characters?: AssetContainer
  ) {
    this.isLocal = isLocal;
    const color = isLocal ? new Color3(0.46, 0.9, 0.87) : colorFromId(sessionId);

    // 빈 루트를 지면에 두고 몸통을 그 아래 붙인다.
    // 캡슐이든 모델이든 바깥에서는 root 하나만 다루면 된다.
    this.root = new Mesh(`player-${sessionId}`, scene);
    this.root.position.set(position.x, 0, position.z);
    this.root.isPickable = false;

    this.character = characters
      ? createCharacterInstance(characters, scene, `player-${sessionId}`, color)
      : undefined;

    if (this.character) {
      this.character.root.parent = this.root;
    } else {
      this.buildCapsule(scene, sessionId, color);
    }

    this.nameplate = createNameplate(nickname, scene, this.root);
    this.targetPosition = this.root.position.clone();
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

    const material = new CellMaterial(`player-material-${sessionId}`, scene);
    material.diffuseColor = color;
    material.computeHighLevel = true;
    body.material = material;
    body.renderOutline = true;
    body.outlineWidth = 0.035;
    body.outlineColor = new Color3(0.05, 0.04, 0.09);

    const visor = MeshBuilder.CreateSphere(
      `visor-${sessionId}`,
      { diameter: 0.46, segments: 10 },
      scene
    );
    visor.parent = body;
    visor.position.set(0, 0.37, 0.45);
    visor.scaling.set(1.2, 0.62, 0.38);
    visor.isPickable = false;
    const visorMaterial = new StandardMaterial(`visor-material-${sessionId}`, scene);
    visorMaterial.diffuseColor = new Color3(0.12, 0.14, 0.23);
    visorMaterial.emissiveColor = new Color3(0.11, 0.13, 0.27);
    visor.material = visorMaterial;
  }

  /** 이동 상태에 맞는 애니메이션으로 전환한다. 모델이 없으면 아무 일도 하지 않는다. */
  setMoveState(state: MoveState): void {
    this.character?.setMoveState(state);
  }

  setNetworkTarget(x: number, z: number, rotationY: number): void {
    this.targetPosition.set(x, 0, z);
    this.targetRotation = rotationY;
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

    this.nameplate.setEnabled(
      Vector3.DistanceSquared(this.root.position, cameraPosition) <=
        CONFIG.NAMEPLATE_HIDE_DISTANCE ** 2
    );
  }

  dispose(): void {
    this.character?.dispose();
    this.root.dispose(false, true);
  }
}

export function lerpAngle(current: number, target: number, amount: number): number {
  const difference =
    ((target - current + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return current + difference * amount;
}
