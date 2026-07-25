import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";
// mesh.renderOutline 은 이 모듈이 붙여 주는 기능이라 부수효과 import 가 필요하다.
import "@babylonjs/core/Rendering/outlineRenderer";
import { CellMaterial } from "@babylonjs/materials/cell/cellMaterial";
import { CONFIG, WORLD_OBSTACLES } from "@starfall/shared";

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

// 툰(셀) 음영용 머티리얼.
// 빛을 부드럽게 섞지 않고 단계로 끊어 아니메풍의 납작한 색면을 만든다.
function makeCellMaterial(
  name: string,
  scene: Scene,
  diffuse: Color3
): CellMaterial {
  const material = new CellMaterial(name, scene);
  material.diffuseColor = diffuse;
  material.computeHighLevel = true; // 2단계 대신 3단계 음영
  return material;
}

// 검은 외곽선. 아니메 룩의 핵심이라 셀 음영과 반드시 같이 쓴다.
function addOutline(mesh: Mesh, width = 0.03): void {
  mesh.renderOutline = true;
  mesh.outlineWidth = width;
  mesh.outlineColor = new Color3(0.05, 0.04, 0.09);
}

export function createWorld(scene: Scene): void {
  // 아니메풍은 어두운 대비보다 밝고 평평한 하늘색이 어울린다.
  scene.clearColor = new Color4(0.55, 0.79, 0.86, 1);
  scene.ambientColor = new Color3(0.3, 0.34, 0.36);

  const skyLight = new HemisphericLight(
    "sky-light",
    new Vector3(-0.2, 1, -0.3),
    scene
  );
  // 셀 음영은 빛이 세면 전부 가장 밝은 단계로 뭉쳐 색면이 사라진다.
  // 단계가 보이도록 전체 광량을 낮게 유지한다.
  skyLight.intensity = 0.45;
  skyLight.diffuse = new Color3(1, 0.98, 0.92);
  skyLight.groundColor = new Color3(0.4, 0.45, 0.38);

  const sunLight = new DirectionalLight(
    "sun-light",
    new Vector3(-0.6, -1, 0.35),
    scene
  );
  sunLight.intensity = 0.85;
  sunLight.diffuse = new Color3(1, 0.96, 0.85);

  const ground = MeshBuilder.CreateGround(
    "ground",
    { width: CONFIG.MAP_SIZE, height: CONFIG.MAP_SIZE, subdivisions: 2 },
    scene
  );
  ground.material = makeCellMaterial(
    "ground-material",
    scene,
    new Color3(0.35, 0.5, 0.28)
  );
  ground.receiveShadows = true;

  const innerGround = MeshBuilder.CreateGround(
    "inner-ground",
    { width: CONFIG.MAP_SIZE - 4, height: CONFIG.MAP_SIZE - 4 },
    scene
  );
  innerGround.position.y = 0.012;
  innerGround.material = makeCellMaterial(
    "inner-ground-material",
    scene,
    new Color3(0.44, 0.6, 0.33)
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
    makeCellMaterial("rock-a", scene, new Color3(0.62, 0.58, 0.52)),
    makeCellMaterial("rock-b", scene, new Color3(0.45, 0.6, 0.45)),
    makeCellMaterial("rock-c", scene, new Color3(0.72, 0.66, 0.55))
  ];

  WORLD_OBSTACLES.forEach((obstacle, index) => {
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
}

