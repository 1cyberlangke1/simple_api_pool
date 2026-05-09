import { build } from "esbuild-wasm";

const define = {
  __APP_VERSION__: JSON.stringify(process.env.APP_VERSION || "dev"),
  __APP_REVISION__: JSON.stringify(process.env.APP_REVISION || "local"),
  __APP_BUILD_TIME__: JSON.stringify(process.env.APP_BUILD_TIME || "unknown")
};

await build({
  absWorkingDir: process.cwd(),
  entryPoints: {
    app: "src/app.js",
    styles: "src/styles.css"
  },
  bundle: true,
  charset: "utf8",
  define,
  format: "iife",
  legalComments: "none",
  logLevel: "info",
  outdir: "assets",
  platform: "browser",
  target: ["es2018"]
});
