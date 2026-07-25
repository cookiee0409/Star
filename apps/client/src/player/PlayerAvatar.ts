import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";
import "@babylonjs/core/Rendering/outlineRenderer";
import { CellMaterial } from "@babylonjs/materials/cell/cellMaterial";
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
  plane.position.y = 1.82;
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
  readonly root: Mesh;
  readonly nameplate: Mesh;
  private targetPosition: Vector3;
  private targetRotation = 0;
  private readonly isLocal: boolean;

  constructor(
    scene: Scene,
    sessionId: string,
    nickname: string,
    position: { x: number; z: number },
    isLocal: boolean
  ) {
    this.isLocal = isLocal;
    this.root = MeshBuilder.CreateCapsule(
      `player-${sessionId}`,
      { height: 2.25, radius: CONFIG.PLAYER_RADIUS, tessellation: 12 },
      scene
    );
    this.root.position.set(position.x, 1.125, position.z);
    this.root.isPickable = false;

    const material = new CellMaterial(`player-material-${sessionId}`, scene);
    const color = isLocal ? new Color3(0.46, 0.9, 0.87) : colorFromId(sessionId);
    material.diffuseColor = color;
    material.computeHighLevel = true;
    this.root.material = material;
    this.root.renderOutline = true;
    this.root.outlineWidth = 0.035;
    this.root.outlineColor = new Color3(0.05, 0.04, 0.09);

    const visor = MeshBuilder.CreateSphere(
      `visor-${sessionId}`,
      { diameter: 0.46, segments: 10 },
      scene
    );
    visor.parent = this.root;
    visor.position.set(0, 0.37, 0.45);
    visor.scaling.set(1.2, 0.62, 0.38);
    const visorMaterial = new StandardMaterial(`visor-material-${sessionId}`, scene);
    visorMaterial.diffuseColor = new Color3(0.12, 0.14, 0.23);
    visorMaterial.emissiveColor = new Color3(0.11, 0.13, 0.27);
    visor.material = visorMaterial;

    this.nameplate = createNameplate(nickname, scene, this.root);
    this.targetPosition = this.root.position.clone();
  }

  setNetworkTarget(x: number, z: number, rotationY: number): void {
    this.targetPosition.set(x, 1.125, z);
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
    this.root.dispose(false, true);
  }
}

export function lerpAngle(current: number, target: number, amount: number): number {
  const difference =
    ((target - current + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return current + difference * amount;
}
