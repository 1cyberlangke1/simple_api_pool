import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { build } from "vite";

const define = {
  __APP_VERSION__: JSON.stringify(process.env.APP_VERSION || "dev"),
  __APP_REVISION__: JSON.stringify(process.env.APP_REVISION || "local"),
  __APP_BUILD_TIME__: JSON.stringify(process.env.APP_BUILD_TIME || "unknown"),
  "process.env.NODE_ENV": JSON.stringify("production")
};

await build({
  appType: "custom",
  build: {
    cssCodeSplit: false,
    emptyOutDir: false,
    lib: {
      entry: path.resolve("src/main.tsx"),
      fileName: function fileName() {
        return "app.js";
      },
      formats: ["iife"],
      name: "SimpleApiPoolFrontend"
    },
    outDir: "assets",
    rollupOptions: {
      output: {
        assetFileNames: function assetFileNames(assetInfo) {
          const assetName = String(assetInfo.name || "");
          if (assetName.endsWith(".css")) {
            return "styles.css";
          }
          return "[name][extname]";
        }
      }
    },
    sourcemap: false,
    target: "es2018"
  },
  configFile: false,
  define,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve("src")
    }
  }
});
