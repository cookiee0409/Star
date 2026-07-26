import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ColorCurves } from "@babylonjs/core/Materials/colorCurves";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import type { Material } from "@babylonjs/core/Materials/material";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Scene } from "@babylonjs/core/scene";
// mesh.renderOutline 은 이 모듈이 붙여 주는 기능이라 부수효과 import 가 필요하다.
import "@babylonjs/core/Rendering/outlineRenderer";
import { CONFIG, WORLD_OBSTACLES, isWalkable } from "@starfall/shared";
import { createSunShadows } from "./shadows";
import { SKY_HORIZON, getSkyTexture } from "./skyTexture";
import {
  OUTLINE_COLOR,
  enableToonOutline,
  getToonMaterial
} from "./toonMaterial";
import {
  NATURE_ASSETS,
  fitScale,
  loadNatureTemplates,
  placeInstance,
  type NatureTemplates
} from "./natureAssets";

// 초목 밀도. 하나하나가 드로우콜이고, 외곽선이 켜진 것은 두 번 그려진다.
// 프레임이 떨어지면 여기부터 줄인다.
const CLUSTER_COUNT = 26;
const CLUSTER_RADIUS_MIN = 4;
const CLUSTER_RADIUS_MAX = 11;
const CLUSTER_MIN = 6;
const CLUSTER_MAX = 18;
const SCATTER_ATTEMPTS = 200;
const BORDER_TREES = 90;

/** 배치를 매번 같게 하려고 쓰는 고정 시드 난수. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

interface DecorKind {
  readonly template: Mesh | undefined;
  readonly weight: number;
  readonly height: number;
  readonly outline: number;
}

/** 캐릭터 키가 약 1.7m 다. 나무는 그보다 확실히 커야 숲처럼 보인다. */
function decorKinds(templates: NatureTemplates): DecorKind[] {
  return [
    { template: templates.grass, weight: 14, height: 0.45, outline: NATURE_ASSETS.grass.outlineWidth },
    { template: templates.fern, weight: 9, height: 0.6, outline: NATURE_ASSETS.fern.outlineWidth },
    { template: templates.bush, weight: 7, height: 0.9, outline: NATURE_ASSETS.bush.outlineWidth },
    { template: templates.rock, weight: 4, height: 0.7, outline: NATURE_ASSETS.rock.outlineWidth },
    { template: templates.pine, weight: 4, height: 4.5, outline: NATURE_ASSETS.pine.outlineWidth },
    { template: templates.treeAlt, weight: 3, height: 4, outline: NATURE_ASSETS.treeAlt.outlineWidth }
  ].filter((kind) => kind.template !== undefined);
}

function pickKind(kinds: DecorKind[], roll: number): DecorKind {
  const total = kinds.reduce((sum, kind) => sum + kind.weight, 0);
  let remaining = roll * total;
  return kinds.find((kind) => (remaining -= kind.weight) < 0) ?? kinds[0]!;
}

/**
 * 충돌 판정이 없는 장식용 초목을 배치한다.
 * 서버가 아는 통행 가능 영역만 쓰므로 플레이에 영향을 주지 않는다.
 *
 * 균일하게 흩뿌리지 않는다. 그렇게 하면 밀도가 고를 뿐 어디를 봐도 똑같아서
 * 넓은 잔디밭에 물건이 놓인 것처럼 보인다. 실제 숲은 덤불이 몰린 곳과 트인
 * 곳이 번갈아 나온다. 군집 중심을 몇 개 잡고 그 주위에 몰아 심어, 시선이
 * 지나가며 빽빽한 곳과 트인 곳을 번갈아 만나게 한다.
 */
function scatterDecorations(templates: NatureTemplates): void {
  const kinds = decorKinds(templates);
  if (kinds.length === 0) {
    return;
  }

  const random = seededRandom(20260725);
  const half = CONFIG.MAP_SIZE / 2 - 4;
  let placed = 0;

  const place = (x: number, z: number, kind: DecorKind, spread: number): void => {
    if (!isWalkable({ x, z }, 2.2)) {
      return;
    }
    // 크기 편차를 크게 준다. 같은 나무가 같은 크기로 늘어서면 복사한 티가 난다.
    const variance = 0.65 + random() * 0.8;
    placeInstance(
      kind.template!,
      `decor-${placed}`,
      new Vector3(x, 0, z),
      random() * Math.PI * 2,
      fitScale(kind.template!, kind.height) * variance * spread,
      kind.outline
    );
    placed += 1;
  };

  // 군집. 중심에서 멀어질수록 확률이 떨어지도록 제곱근을 쓴다.
  for (let cluster = 0; cluster < CLUSTER_COUNT; cluster += 1) {
    const cx = (random() * 2 - 1) * half;
    const cz = (random() * 2 - 1) * half;
    const radius = CLUSTER_RADIUS_MIN + random() * (CLUSTER_RADIUS_MAX - CLUSTER_RADIUS_MIN);
    const count = CLUSTER_MIN + Math.floor(random() * (CLUSTER_MAX - CLUSTER_MIN));

    for (let index = 0; index < count; index += 1) {
      const angle = random() * Math.PI * 2;
      const distance = Math.sqrt(random()) * radius;
      place(
        cx + Math.cos(angle) * distance,
        cz + Math.sin(angle) * distance,
        pickKind(kinds, random()),
        1
      );
    }
  }

  // 군집 사이를 메우는 성긴 배치. 이게 없으면 빈 곳이 너무 휑하다.
  for (let attempt = 0; attempt < SCATTER_ATTEMPTS; attempt += 1) {
    place(
      (random() * 2 - 1) * half,
      (random() * 2 - 1) * half,
      pickKind(kinds, random()),
      1
    );
  }

  // 맵 가장자리를 나무로 두른다. 지금은 경계 담장이 그대로 보여 무대 세트처럼
  // 읽힌다. 큰 나무로 지평선을 막으면 숲 안에 있는 것처럼 보이고, 시선이 맵
  // 밖으로 새지 않는다.
  const trees = kinds.filter((kind) => kind.height > 3);
  if (trees.length > 0) {
    for (let index = 0; index < BORDER_TREES; index += 1) {
      const along = (index / BORDER_TREES) * Math.PI * 2;
      // 완전한 원이 아니라 안팎으로 흔들어 심어야 줄 세운 티가 안 난다.
      const depth = half - 1 - random() * 7;
      place(
        Math.cos(along) * depth,
        Math.sin(along) * depth,
        trees[Math.floor(random() * trees.length)]!,
        1.15
      );
    }
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

// 검은 외곽선. 아니메 룩의 핵심이라 툰 음영과 반드시 같이 쓴다.
function addOutline(mesh: Mesh, width = 0.03): void {
  enableToonOutline(mesh, mesh.getScene(), width, OUTLINE_COLOR);
}

/**
 * 색 보정.
 *
 * 후처리 패스를 따로 걸지 않는다. 이 설정은 머티리얼 셰이더 안에서 처리되므로
 * 드로우콜도 번들도 늘지 않는다.
 *
 * 참고한 배경화는 화면 전체가 한 색으로 묶여 있다. 그림자는 차갑고 빛은 따뜻해서
 * 물체마다 색이 따로 놀지 않는다. 그늘을 청록으로, 밝은 쪽을 살짝 노랗게 밀어
 * 같은 인상을 만든다.
 */
function applyColorGrading(scene: Scene): void {
  const processing = scene.imageProcessingConfiguration;
  processing.contrast = 1.25;
  processing.exposure = 1.06;

  const curves = new ColorCurves();
  // hue 는 0~360 색상환, density 는 얼마나 물들일지.
  curves.shadowsHue = 190;
  curves.shadowsDensity = 34;
  curves.shadowsSaturation = 8;
  curves.midtonesHue = 172;
  curves.midtonesDensity = 12;
  curves.highlightsHue = 48;
  curves.highlightsDensity = 16;
  curves.globalSaturation = 12;
  processing.colorCurves = curves;
  processing.colorCurvesEnabled = true;

  // 가장자리를 살짝 눌러 시선을 가운데로 모은다. 순검정 대신 하늘의 청록을
  // 어둡게 쓴 색이라 화면 색이 흐트러지지 않는다.
  processing.vignetteEnabled = true;
  processing.vignetteWeight = 2.4;
  processing.vignetteColor = new Color4(0.05, 0.13, 0.15, 0);
  processing.vignetteBlendMode = ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;
}

/**
 * 하늘 반구.
 *
 * infiniteDistance 로 카메라를 따라다니게 해서 아무리 움직여도 끝이 안 보인다.
 * 안개를 끄지 않으면 하늘 자신이 안개색으로 덮여 그라디언트가 사라진다.
 *
 * 색은 emissive 로만 넣고 조명을 끈다. 그래야 텍스처에 그린 값이 화면에 그대로
 * 나온다(diffuse 로 넣으면 빛을 받아 시간대에 따라 변한다).
 */
function createSky(scene: Scene): void {
  const sky = MeshBuilder.CreateSphere(
    "sky",
    { diameter: 400, segments: 24 },
    scene
  );
  sky.infiniteDistance = true;
  sky.isPickable = false;
  sky.applyFog = false;

  const material = new StandardMaterial("sky-material", scene);
  material.emissiveTexture = getSkyTexture(scene);
  material.diffuseColor = Color3.Black();
  material.specularColor = Color3.Black();
  material.disableLighting = true;
  // 우리는 구체 안쪽에 있다.
  material.backFaceCulling = false;
  material.fogEnabled = false;
  sky.material = material;
}

export async function createWorld(scene: Scene): Promise<void> {
  // 자연 에셋이 있으면 쓰고, 없으면 아래에서 원시 도형으로 되돌아간다.
  const templates = await loadNatureTemplates(scene);

  // 아니메 배경화는 하늘이 화면의 주인공이다. 단색으로 두면 파란 벽이 된다.
  // 위는 진한 청록, 지평선 쪽은 옅게 빼서 깊이를 만든다.
  scene.clearColor = new Color4(SKY_HORIZON.r, SKY_HORIZON.g, SKY_HORIZON.b, 1);
  scene.ambientColor = new Color3(0.3, 0.34, 0.36);
  createSky(scene);

  // 공기원근. 먼 것이 하늘색으로 날아가면 작은 디오라마처럼 보인다.
  // 색을 지평선과 똑같이 맞춰야 지면이 하늘로 자연스럽게 이어진다.
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogColor = SKY_HORIZON;
  scene.fogDensity = 0.011;

  applyColorGrading(scene);

  const skyLight = new HemisphericLight(
    "sky-light",
    new Vector3(-0.2, 1, -0.3),
    scene
  );
  // 툰 음영은 빛이 세면 전부 밝은 쪽으로 뭉쳐 색면이 사라진다.
  // 경계가 보이도록 전체 광량을 낮게 유지한다.
  skyLight.intensity = 0.4;
  // 하늘빛은 하늘색을 띠어야 화면 전체 색이 하나로 묶인다.
  skyLight.diffuse = new Color3(0.82, 0.95, 0.96);
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
  createSunShadows(scene, sunLight);

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
  innerGround.receiveShadows = true;

  // 10m 간격 격자선은 걷어냈다. 모눈종이 위에 서 있는 인상을 주는 데다,
  // 아니메 배경화의 지면은 선이 아니라 색면으로 나뉜다.

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

