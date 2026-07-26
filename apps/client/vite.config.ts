import { defineConfig } from "vite";

export default defineConfig({
  envDir: "../../",
  server: {
    port: 5173,
    strictPort: true
  },
  optimizeDeps: {
    // Babylon 을 사전 번들링에서 뺀다.
    //
    // Babylon 은 셰이더 소스를 동적 import 로 가져온다
    // (예: outlineRenderer 의 import("../Shaders/outline.vertex.js")).
    // Vite 가 Babylon 을 esbuild 로 미리 묶으면 그 상대경로가 묶음 밖을 가리켜
    // 해석에 실패하고, Babylon 은 이름으로 .fx 파일을 HTTP 요청하는 폴백으로
    // 넘어간다. 개발 서버는 없는 경로에 index.html 을 돌려주므로 셰이더 자리에
    // HTML 이 들어가고 "'<' : syntax error" 로 컴파일이 깨진다.
    //
    // 외곽선·그림자맵·rgbdDecode 에서 차례로 겪었다. 기능을 켤 때마다 셰이더를
    // 하나씩 미리 import 해 막을 수도 있지만 끝이 없어서 원인 쪽을 끊는다.
    //
    // 개발 서버에만 영향을 준다. 프로덕션 빌드는 Rollup 이 동적 import 를
    // 정상적으로 묶으므로 원래 문제가 없었다.
    exclude: ["@babylonjs/core", "@babylonjs/materials", "@babylonjs/loaders"]
  },
  build: {
    target: "es2022"
  }
});
