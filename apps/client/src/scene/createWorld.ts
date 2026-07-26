import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import type { Material } from "@babylonjs/core/Materials/material";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";
// mesh.renderOutline 은 이 모듈이 붙여 주는 기능이라 부수효과 import 가 필요하다.
import "@babylonjs/core/Rendering/outlineRenderer";
import { CONFIG, WORLD_OBSTACLES, isWalkable } from "@starfall/shared";
import { getToonMaterial } from "./toonMaterial";
import {
  NATURE_ASSETS,
  fitScale,
  loadNatureTemplates,
  placeInstance,
  type NatureTemplates
} from "./natureAssets";

/** 배치를 매번 같게 하려고 쓰는 고정 시드 난수. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/**
 * 충돌 판정이 없는 장식용 초목을 흩뿌린다.
 * 서버가 아는 통행 가능 영역만 쓰므로 플레이에 영향을 주지 않는다.
 */
function scatterDecorations(templates: NatureTemplates): void {
  // 큰 나무는 드물게, 작은 풀은 흔하게 섞어 밀도에 변화를 준다.
  // 캐릭터 키가 약 2.25m 다. 나무는 그보다 확실히 크되 화면을 다 덮지 않게 잡는다.
  const kinds = [
    { template: templates.grass, weight: 12, height: 0.45, outline: NATURE_ASSETS.grass.outlineWidth },
    { template: templates.fern, weight: 8, height: 0.6, outline: NATURE_ASSETS.fern.outlineWidth },
    { template: templates.bush, weight: 5, height: 0.9, outline: NATURE_ASSETS.bush.outlineWidth },
    { template: templates.rock, weight: 4, height: 0.7, outline: NATURE_ASSETS.rock.outlineWidth },
    { template: templates.pine, weight: 2, height: 4.5, outline: NATURE_ASSETS.pine.outlineWidth },
    { template: templates.treeAlt, weight: 1, height: 4, outline: NATURE_ASSETS.treeAlt.outlineWidth }
  ].filter((kind) => kind.template !== undefined);

  if (kinds.length === 0) {
    return;
  }

  const totalWeight = kinds.reduce((sum, kind) => sum + kind.weight, 0);
  const random = seededRandom(20260725);
  const half = CONFIG.MAP_SIZE / 2 - 4;
  let placed = 0;

  for (let attempt = 0; attempt < 900 && placed < 240; attempt += 1) {
    const x = (random() * 2 - 1) * half;
    const z = (random() * 2 - 1) * half;
    // 장애물 안이나 맵 밖에는 두지 않는다.
    if (!isWalkable({ x, z }, 2.2)) {
      continue;
    }

    let roll = random() * totalWeight;
    const kind = kinds.find((candidate) => (roll -= candidate.weight) < 0) ?? kinds[0]!;
    const template = kind.template!;
    const variance = 0.8 + random() * 0.5;

    placeInstance(
      template,
      `decor-${placed}`,
      new Vector3(x, 0, z),
      random() * Math.PI * 2,
      fitScale(template, kind.height) * variance,
      kind.outline
    );
    placed += 1;
  }
}

function makeMaterial(
  name: string,
  scene: Scene,
  diffuse: Color3,
  emissive = Color3.Black()
): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = diffuse;
  material.emissiveColor = emissive;
  material.specularColor = new Color3(0.08, 0.08, 0.11);
  return material;
}

// 툰 음영용 머티리얼(scene/toonMaterial.ts).
// 빛을 부드럽게 섞지 않고 경계에서 끊고, 그림자를 한색으로 물들여
// 아니메풍의 납작한 색면을 만든다.
//
// rim 을 넘기는 이유: 바닥처럼 넓고 평평한 면은 시선이 스치는 지평선 쪽에서
// 림 라이트가 띠처럼 번진다. 지면 계열만 끈다.
function makeToonMaterial(
  name: string,
  scene: Scene,
  diffuse: Color3,
  rim = 1
): Material {
  return getToonMaterial(scene, name, { color: diffuse, rim });
}

// 검은 외곽선. 아니메 룩의 핵심이라 셀 음영과 반드시 같이 쓴다.
function addOutline(mesh: Mesh, width = 0.03): void {
  mesh.renderOutline = true;
  mesh.outlineWidth = width;
  mesh.outlineColor = new Color3(0.05, 0.04, 0.09);
}

export async function createWorld(scene: Scene): Promise<void> {
  // 자연 에셋이 있으면 쓰고, 없으면 아래에서 원시 도형으로 되돌아간다.
  const templates = await loadNatureTemplates(scene);

  // 아니메풍은 어두운 대비보다 밝고 평평한 하늘색이 어울린다.
  scene.clearColor = new Color4(0.55, 0.79, 0.86, 1);
  scene.ambientColor = new Color3(0.3, 0.34, 0.36);

  const skyLight = new HemisphericLight(
    "sky-light",
    new Vector3(-0.2, 1, -0.3),
    scene
  );
  // 툰 음영은 빛이 세면 전부 밝은 쪽으로 뭉쳐 색면이 사라진다.
  // 경계가 보이도록 전체 광량을 낮게 유지한다.
  skyLight.intensity = 0.4;
  skyLight.diffuse = new Color3(1, 0.98, 0.92);
  skyLight.groundColor = new Color3(0.4, 0.45, 0.38);

  // 해를 머리 위에 두면 세워진 면(캐릭터 몸통·나무 줄기)이 빛을 거의 못 받아
  // 명암 경계가 정수리에만 생긴다. 고도를 낮춰 옆에서 비추게 한다.
  const sunLight = new DirectionalLight(
    "sun-light",
    new Vector3(-0.5, -0.72, 0.48),
    scene
  );
  sunLight.intensity = 0.95;
  sunLight.diffuse = new Color3(1, 0.96, 0.85);

  const ground = MeshBuilder.CreateGround(
    "ground",
    { width: CONFIG.MAP_SIZE, height: CONFIG.MAP_SIZE, subdivisions: 2 },
    scene
  );
  ground.material = makeToonMaterial(
    "ground-material",
    scene,
    new Color3(0.35, 0.5, 0.28),
    0
  );
  ground.receiveShadows = true;

  const innerGround = MeshBuilder.CreateGround(
    "inner-ground",
    { width: CONFIG.MAP_SIZE - 4, height: CONFIG.MAP_SIZE - 4 },
    scene
  );
  innerGround.position.y = 0.012;
  innerGround.material = makeToonMaterial(
    "inner-ground-material",
    scene,
    new Color3(0.44, 0.6, 0.33),
    0
  );

  const pathMaterial = makeMaterial(
    "path-material",
    scene,
    new Color3(0.29, 0.3, 0.34),
    new Color3(0.018, 0.018, 0.025)
  );
  for (let offset = -40; offset <= 40; offset += 10) {
    const horizontal = MeshBuilder.CreateBox(
      `path-h-${offset}`,
      { width: 96, depth: 0.05, height: 0.018 },
      scene
    );
    horizontal.position.set(0, 0.028, offset);
    horizontal.material = pathMaterial;

    const vertical = MeshBuilder.CreateBox(
      `path-v-${offset}`,
      { width: 0.05, depth: 96, height: 0.018 },
      scene
    );
    vertical.position.set(offset, 0.029, 0);
    vertical.material = pathMaterial;
  }

  const rockMaterials = [
    makeToonMaterial("rock-a", scene, new Color3(0.62, 0.58, 0.52), 0.5),
    makeToonMaterial("rock-b", scene, new Color3(0.45, 0.6, 0.45), 0.5),
    makeToonMaterial("rock-c", scene, new Color3(0.72, 0.66, 0.55), 0.5)
  ];

  WORLD_OBSTACLES.forEach((obstacle, index) => {
    // 실제 모델이 있으면 그것으로 대체한다.
    // 충돌 판정은 서버의 WORLD_OBSTACLES 가 그대로 담당하므로,
    // 모델은 해당 크기에 맞춰 얹기만 한다.
    const isTree = obstacle.kind === "box";
    const template = isTree ? templates.tree : templates.rock;
    if (template) {
      placeInstance(
        template,
        `obstacle-${index}`,
        new Vector3(obstacle.x, 0, obstacle.z),
        isTree ? obstacle.rotationY : index * 1.1,
        // 나무는 충돌 크기보다 크게 자라야 자연스럽다.
        // 충돌 판정은 서버의 WORLD_OBSTACLES 가 그대로 담당한다.
        fitScale(template, obstacle.height * (isTree ? 1.6 : 1.1)),
        isTree
          ? NATURE_ASSETS.tree.outlineWidth
          : NATURE_ASSETS.rock.outlineWidth
      );
      return;
    }

    const mesh =
      obstacle.kind === "box"
        ? MeshBuilder.CreateBox(
            `obstacle-${index}`,
            {
              width: obstacle.width,
              depth: obstacle.depth,
              height: obstacle.height
            },
            scene
          )
        : MeshBuilder.CreateCylinder(
            `obstacle-${index}`,
            {
              diameter: obstacle.radius * 2,
              height: obstacle.height,
              tessellation: 7
            },
            scene
          );
    mesh.position.set(obstacle.x, obstacle.height / 2, obstacle.z);
    if (obstacle.kind === "box") {
      mesh.rotation.y = obstacle.rotationY;
    }
    mesh.material = rockMaterials[index % rockMaterials.length] ?? rockMaterials[0]!;
    addOutline(mesh, 0.06);
  });

  const borderMaterial = makeMaterial(
    "border-material",
    scene,
    new Color3(0.14, 0.13, 0.22),
    new Color3(0.05, 0.04, 0.1)
  );
  const half = CONFIG.MAP_SIZE / 2;
  const borders = [
    { x: 0, z: -half, width: CONFIG.MAP_SIZE + 1, depth: 0.8 },
    { x: 0, z: half, width: CONFIG.MAP_SIZE + 1, depth: 0.8 },
    { x: -half, z: 0, width: 0.8, depth: CONFIG.MAP_SIZE + 1 },
    { x: half, z: 0, width: 0.8, depth: CONFIG.MAP_SIZE + 1 }
  ];
  borders.forEach((border, index) => {
    const mesh = MeshBuilder.CreateBox(
      `border-${index}`,
      { width: border.width, depth: border.depth, height: 0.7 },
      scene
    );
    mesh.position.set(border.x, 0.28, border.z);
    mesh.material = borderMaterial;
  });

  const starMaterial = makeMaterial(
    "ground-star-material",
    scene,
    new Color3(0.43, 0.38, 0.2),
    new Color3(0.18, 0.13, 0.03)
  );
  [
    [-41, -42],
    [41, 40],
    [-42, 39],
    [42, -40]
  ].forEach(([x = 0, z = 0], index) => {
    const marker = MeshBuilder.CreateCylinder(
      `corner-star-${index}`,
      { diameter: 1.4, height: 0.08, tessellation: 6 },
      scene
    );
    marker.position.set(x, 0.07, z);
    marker.material = starMaterial;
  });

  scatterDecorations(templates);
}

