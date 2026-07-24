// 빌드 산출물을 저장소 루트의 dist로도 복사한다.
//
// Vercel의 Root Directory 설정에 따라 출력 폴더를 찾는 기준 경로가
// apps/client 가 되기도 하고 저장소 루트가 되기도 한다.
// 두 위치 모두에 산출물을 두어 어느 쪽을 보더라도 배포가 성공하게 만든다.
import { cpSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const clientDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(clientDir, "dist");
const destination = resolve(clientDir, "../../dist");

if (!existsSync(source)) {
  console.error(`[copy-dist] 빌드 산출물을 찾을 수 없습니다: ${source}`);
  process.exit(1);
}

cpSync(source, destination, { recursive: true });
console.log(`[copy-dist] ${source} -> ${destination}`);
