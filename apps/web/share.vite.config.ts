import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist-share",
    rollupOptions: { input: fileURLToPath(new URL("share.html", import.meta.url)) },
  },
});
