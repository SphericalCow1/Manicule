import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(join(root, path), "utf8")) as T;
}

test("keeps application versions in sync", () => {
  const packageJson = readJson<{ version: string }>("package.json");
  const tauriConfig = readJson<{ version: string }>("src-tauri/tauri.conf.json");
  const cargoToml = readFileSync(join(root, "src-tauri/Cargo.toml"), "utf8");

  assert.match(cargoToml, new RegExp(`^version = "${packageJson.version}"$`, "m"));
  assert.equal(tauriConfig.version, packageJson.version);
});

test("keeps application naming consistent across build metadata", () => {
  const packageJson = readJson<{ name: string }>("package.json");
  const tauriConfig = readJson<{
    productName: string;
    identifier: string;
    app: { windows: Array<{ title: string }> };
  }>("src-tauri/tauri.conf.json");
  const cargoToml = readFileSync(join(root, "src-tauri/Cargo.toml"), "utf8");
  const indexHtml = readFileSync(join(root, "index.html"), "utf8");

  assert.equal(packageJson.name, "logtext");
  assert.equal(tauriConfig.productName, "Logtext");
  assert.equal(tauriConfig.identifier, "dev.logtext.desktop");
  assert.equal(tauriConfig.app.windows[0]?.title, "Logtext");
  assert.match(cargoToml, /^name = "logtext"$/m);
  assert.match(cargoToml, /^default-run = "Logtext"$/m);
  assert.match(cargoToml, /^name = "Logtext"$/m);
  assert.match(cargoToml, /^name = "manicule_lib"$/m);
  assert.match(indexHtml, /<title>Logtext<\/title>/);
});

test("keeps the About dialog product name and repository link current", () => {
  const appSource = readFileSync(join(root, "src/App.svelte"), "utf8");

  assert.match(appSource, /<h2 id="about-dialog-title">Logtext<\/h2>/);
  assert.match(appSource, /https:\/\/github\.com\/SphericalCow1\/Manicule/);
  assert.match(appSource, /A local Markdown-based knowledge workspace/);
});
