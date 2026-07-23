import { defineConfig } from "vite";

export default defineConfig({
  envDir: "../../",
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    target: "es2022"
  }
});
