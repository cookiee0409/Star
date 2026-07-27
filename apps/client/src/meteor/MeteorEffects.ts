import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";
import {
  CONFIG,
  type MeteorImpactPayload,
  type MeteorForecastPayload,
  type MeteorWarningPayload,
  type Point2D
} from "@starfall/shared";

interface FragmentVisual {
  mesh: Mesh;
  baseY: number;
  phase: number;
}

interface MeteorVisual {
  id: string;
  body: Mesh;
  light: PointLight;
  trail: Mesh[];
  start: Vector3;
  target: Vector3;
  fallStartsAt: number;
}

interface ImpactVisual {
  meshes: Mesh[];
  velocities: Vector3[];
  startedAt: number;
  flash: PointLight;
}

// 크레이터는 파편과 달리 바닥에 남겨 두는 연출이라 자동으로 사라지지 않는다.
// 방을 오래 유지하면 무한히 쌓이므로 최근 것만 남기고 오래된 것부터 지운다.
const MAX_CRATERS = 8;

// 낙하 예정 시각을 이만큼 넘기면 충돌 메시지를 놓친 것으로 보고 정리한다.
// (연결이 끊기거나 메시지를 유실해도 메시와 라이트가 남지 않게 한다.)
const METEOR_CLEANUP_GRACE_MS = 5_000;

function material(
  name: string,
  scene: Scene,
  diffuse: Color3,
  emissive: Color3
): StandardMaterial {
  const result = new StandardMaterial(name, scene);
  result.diffuseColor = diffuse;
  result.emissiveColor = emissive;
  result.specularColor = emissive.scale(0.35);
  return result;
}

function hashAngle(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 33 + id.charCodeAt(index)) | 0;
  }
  return (Math.abs(hash) % 6283) / 1000;
}

export class MeteorEffects {
  private readonly fragments = new Map<string, FragmentVisual>();
  private readonly meteors = new Map<string, MeteorVisual>();
  private readonly impacts: ImpactVisual[] = [];
  private readonly craters: Mesh[] = [];
  private readonly fragmentMaterial: StandardMaterial;
  private readonly meteorMaterial: StandardMaterial;
  private readonly trailMaterial: StandardMaterial;
  private readonly craterMaterial: StandardMaterial;
  private meteorActive = false;

  constructor(private readonly scene: Scene) {
    this.fragmentMaterial = material(
      "fragment-material",
      scene,
      new Color3(0.95, 0.68, 0.22),
      new Color3(0.72, 0.4, 0.05)
    );
    this.meteorMaterial = material(
      "meteor-material",
      scene,
      new Color3(1, 0.76, 0.43),
      new Color3(1, 0.42, 0.08)
    );
    this.trailMaterial = material(
      "trail-material",
      scene,
      new Color3(0.69, 0.55, 1),
      new Color3(0.45, 0.28, 1)
    );
    this.craterMaterial = material(
      "crater-material",
      scene,
      new Color3(0.09, 0.075, 0.12),
      new Color3(0.025, 0.018, 0.04)
    );
    this.craterMaterial.alpha = 0.82;
  }

  warn(payload: MeteorWarningPayload): string {
    this.meteorActive = true;
    const angle = hashAngle(payload.meteorId);
    const target = new Vector3(payload.targetX, 0.6, payload.targetZ);
    const start = new Vector3(
      payload.targetX + Math.cos(angle) * 26,
      31,
      payload.targetZ + Math.sin(angle) * 26
    );
    const body = MeshBuilder.CreatePolyhedron(
      `meteor-${payload.meteorId}`,
      { type: 1, size: 1.15 },
      this.scene
    );
    body.position.copyFrom(start);
    body.material = this.meteorMaterial;

    const light = new PointLight(
      `meteor-light-${payload.meteorId}`,
      start.clone(),
      this.scene
    );
    light.diffuse = new Color3(1, 0.54, 0.22);
    light.intensity = 5;
    light.range = 15;

    const trail = Array.from({ length: 6 }, (_, index) => {
      const mesh = MeshBuilder.CreateSphere(
        `meteor-trail-${payload.meteorId}-${index}`,
        { diameter: 0.72 - index * 0.075, segments: 6 },
        this.scene
      );
      mesh.position.copyFrom(start);
      mesh.material = this.trailMaterial;
      return mesh;
    });

    this.meteors.set(payload.meteorId, {
      id: payload.meteorId,
      body,
      light,
      trail,
      start,
      target,
      fallStartsAt: performance.now() + payload.etaMs
    });
    return this.directionLabel(target);
  }

  /**
   * 관측으로 얻은 조기 예보. 방향만 알려 주고 연출은 만들지 않는다.
   *
   * 별똥별은 아직 하늘에 없다. 여기서 궤적을 띄우면 예보를 받은 사람만
   * 실제와 다른 화면을 보게 된다.
   */
  forecast(payload: MeteorForecastPayload): string {
    return this.directionLabel(
      new Vector3(payload.targetX, 0.6, payload.targetZ)
    );
  }

  impact(payload: MeteorImpactPayload, playerPosition?: Vector3): number {
    this.disposeMeteor(payload.meteorId);
    this.meteorActive = false;

    const crater = MeshBuilder.CreateDisc(
      `crater-${payload.meteorId}`,
      { radius: 2.2, tessellation: 32 },
      this.scene
    );
    crater.rotation.x = Math.PI / 2;
    crater.position.set(payload.x, 0.035, payload.z);
    crater.material = this.craterMaterial;
    this.craters.push(crater);
    while (this.craters.length > MAX_CRATERS) {
      this.craters.shift()?.dispose();
    }

    const flash = new PointLight(
      `impact-light-${payload.meteorId}`,
      new Vector3(payload.x, 1.2, payload.z),
      this.scene
    );
    flash.diffuse = new Color3(1, 0.66, 0.28);
    flash.intensity = 18;
    flash.range = 26;

    const debrisMaterial = material(
      `debris-material-${payload.meteorId}`,
      this.scene,
      new Color3(0.76, 0.5, 0.2),
      new Color3(0.45, 0.2, 0.025)
    );
    const meshes: Mesh[] = [crater];
    const velocities: Vector3[] = [Vector3.Zero()];
    for (let index = 0; index < 12; index += 1) {
      const angle = (index / 12) * Math.PI * 2 + (index % 3) * 0.11;
      const piece = MeshBuilder.CreatePolyhedron(
        `impact-piece-${payload.meteorId}-${index}`,
        { type: 1, size: 0.15 + (index % 4) * 0.035 },
        this.scene
      );
      piece.position.set(payload.x, 0.3, payload.z);
      piece.material = debrisMaterial;
      meshes.push(piece);
      velocities.push(
        new Vector3(Math.cos(angle) * (3.5 + (index % 3)), 4 + (index % 4), Math.sin(angle) * (3.5 + (index % 3)))
      );
    }

    this.impacts.push({
      meshes,
      velocities,
      startedAt: performance.now(),
      flash
    });

    if (!playerPosition) {
      return 0;
    }
    const distance = Math.hypot(
      playerPosition.x - payload.x,
      playerPosition.z - payload.z
    );
    return Math.max(0, 1 - distance / 28);
  }

  addFragment(id: string, x: number, z: number): void {
    if (this.fragments.has(id)) {
      return;
    }
    const mesh = MeshBuilder.CreatePolyhedron(
      `fragment-${id}`,
      { type: 1, size: 0.62 },
      this.scene
    );
    mesh.position.set(x, 0.85, z);
    mesh.rotation.z = Math.PI / 4;
    mesh.material = this.fragmentMaterial;
    this.fragments.set(id, {
      mesh,
      baseY: mesh.position.y,
      phase: (this.fragments.size * 1.83) % (Math.PI * 2)
    });
  }

  removeFragment(id: string): void {
    const visual = this.fragments.get(id);
    if (!visual) {
      return;
    }
    visual.mesh.dispose();
    this.fragments.delete(id);
  }

  nearestFragment(position: Vector3): { id: string; distance: number } | null {
    let nearest: { id: string; distance: number } | null = null;
    this.fragments.forEach((visual, id) => {
      const distance = Math.hypot(
        position.x - visual.mesh.position.x,
        position.z - visual.mesh.position.z
      );
      if (!nearest || distance < nearest.distance) {
        nearest = { id, distance };
      }
    });
    return nearest;
  }

  update(deltaSeconds: number): void {
    const now = performance.now();
    this.fragments.forEach((visual) => {
      visual.phase += deltaSeconds * 2.1;
      visual.mesh.position.y = visual.baseY + Math.sin(visual.phase) * 0.16;
      visual.mesh.rotation.y += deltaSeconds * 1.5;
    });

    const fallDurationMs = CONFIG.METEOR_FALL_DURATION * 1000;
    const stale: string[] = [];
    this.meteors.forEach((meteor) => {
      const elapsed = now - meteor.fallStartsAt;
      if (elapsed < 0) {
        const pulse = 0.85 + Math.sin(now * 0.008) * 0.13;
        meteor.body.scaling.setAll(pulse);
        return;
      }
      if (elapsed > fallDurationMs + METEOR_CLEANUP_GRACE_MS) {
        stale.push(meteor.id);
        return;
      }
      const progress = Math.min(1, elapsed / fallDurationMs);
      const eased = progress * progress;
      meteor.body.position = Vector3.Lerp(meteor.start, meteor.target, eased);
      meteor.light.position.copyFrom(meteor.body.position);
      meteor.trail.forEach((trail, index) => {
        const offsetProgress = Math.max(0, eased - (index + 1) * 0.035);
        trail.position = Vector3.Lerp(meteor.start, meteor.target, offsetProgress);
      });
    });

    stale.forEach((id) => this.disposeMeteor(id));
    if (this.meteors.size === 0) {
      this.meteorActive = false;
    }

    for (let index = this.impacts.length - 1; index >= 0; index -= 1) {
      const impact = this.impacts[index]!;
      const ageSeconds = (now - impact.startedAt) / 1000;
      impact.flash.intensity = Math.max(0, 18 * (1 - ageSeconds * 3.5));
      impact.meshes.slice(1).forEach((mesh, meshIndex) => {
        const velocity = impact.velocities[meshIndex + 1]!;
        velocity.y -= 9.8 * deltaSeconds;
        mesh.position.addInPlace(velocity.scale(deltaSeconds));
        mesh.rotation.x += deltaSeconds * 5;
        mesh.rotation.z += deltaSeconds * 3;
        if (mesh.position.y < 0.08) {
          mesh.position.y = 0.08;
          velocity.setAll(0);
        }
      });

      if (ageSeconds > 1.35) {
        impact.meshes.slice(1).forEach((mesh) => mesh.dispose(false, true));
        impact.flash.dispose();
        this.impacts.splice(index, 1);
      }
    }
  }

  get isMeteorActive(): boolean {
    return this.meteorActive;
  }

  private directionLabel(target: Point2D): string {
    const horizontal = target.x > 8 ? "동쪽" : target.x < -8 ? "서쪽" : "";
    const vertical = target.z > 8 ? "북쪽" : target.z < -8 ? "남쪽" : "";
    return `${vertical}${horizontal}` || "가까운 하늘";
  }

  private disposeMeteor(id: string): void {
    const meteor = this.meteors.get(id);
    if (!meteor) {
      return;
    }
    meteor.body.dispose();
    meteor.trail.forEach((mesh) => mesh.dispose());
    meteor.light.dispose();
    this.meteors.delete(id);
  }
}

