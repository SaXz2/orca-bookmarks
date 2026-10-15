import { build, context } from "esbuild";
import { cpSync, mkdirSync } from "node:fs";

const watch = process.argv.includes("--watch");

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: {
    "background": "src/background.ts",
    "popup/popup": "src/ui/popup/popup.ts",
    "options/options": "src/ui/options/options.ts",
    "player/player": "src/ui/player/player.ts",
  },
  bundle: true,
  format: "esm",
  target: "chrome120",
  outdir: "dist",
  sourcemap: true,
  logLevel: "info",
};

function copyStatic() {
  mkdirSync("dist", { recursive: true });
  cpSync("src/manifest.json", "dist/manifest.json");
  cpSync("src/ui/popup/popup.html", "dist/popup/popup.html");
  cpSync("src/ui/popup/popup.css", "dist/popup/popup.css");
  cpSync("src/ui/options/options.html", "dist/options/options.html");
  cpSync("src/ui/options/options.css", "dist/options/options.css");
  mkdirSync("dist/player", { recursive: true });
  cpSync("src/ui/player/player.html", "dist/player/player.html");
  cpSync("src/ui/player/player.css", "dist/player/player.css");
}

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  copyStatic();
  console.log("[build] watching...");
} else {
  await build(options);
  copyStatic();
  console.log("[build] done → dist/");
}
