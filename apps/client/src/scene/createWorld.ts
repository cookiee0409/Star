import {
  Color3,
  Color4,
  DirectionalLight,
  HemisphericLight,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3
} from "@babylonjs/core";
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

export function createWorld(scene: Scene): void {
  scene.clearColor = new Color4(0.1, 0.075, 0.18, 1);
  scene.ambientColor = new Color3(0.21, 0.2, 0.34);

  const skyLight = new HemisphericLight(
    "sky-light",
    new Vector3(-0.2, 1, -0.3),
    scene
  );
  skyLight.intensity = 1.25;
  skyLight.diffuse = new Color3(0.72, 0.75, 1);
  skyLight.groundColor = new Color3(0.18, 0.14, 0.28);

  const moonLight = new DirectionalLight(
    "moon-light",
    new Vector3(-0.6, -1, 0.35),
    scene
  );
  moonLight.intensity = 0.62;
  moonLight.diffuse = new Color3(0.76, 0.82, 1);

  const ground = MeshBuilder.CreateGround(
    "ground",
    { width: CONFIG.MAP_SIZE, height: CONFIG.MAP_SIZE, subdivisions: 2 },
    scene
  );
  ground.material = makeMaterial(
    "ground-material",
    scene,
    new Color3(0.19, 0.22, 0.27)
  );
  ground.receiveShadows = true;

  const innerGround = MeshBuilder.CreateGround(
    "inner-ground",
    { width: CONFIG.MAP_SIZE - 4, height: CONFIG.MAP_SIZE - 4 },
    scene
  );
  innerGround.position.y = 0.012;
  innerGround.material = makeMaterial(
    "inner-ground-material",
    scene,
    new Color3(0.22, 0.27, 0.29)
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
    makeMaterial("rock-a", scene, new Color3(0.33, 0.31, 0.42)),
    makeMaterial("rock-b", scene, new Color3(0.24, 0.34, 0.37)),
    makeMaterial("rock-c", scene, new Color3(0.37, 0.29, 0.34))
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

