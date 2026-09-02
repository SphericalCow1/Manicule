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

  assert.equal(packageJson.name, "mentinote");
  assert.equal(tauriConfig.productName, "mentiNote");
  assert.equal(tauriConfig.identifier, "dev.mentinote.desktop");
  assert.equal(tauriConfig.app.windows[0]?.title, "mentiNote");
  assert.match(cargoToml, /^name = "mentinote"$/m);
  assert.match(cargoToml, /^default-run = "mentiNote"$/m);
  assert.match(cargoToml, /^name = "mentiNote"$/m);
  assert.match(cargoToml, /^name = "mentinote_lib"$/m);
  assert.match(indexHtml, /<title>mentiNote<\/title>/);
});

test("keeps the About dialog product name and repository link current", () => {
  const appSource = readFileSync(join(root, "src/App.svelte"), "utf8");

  assert.match(appSource, /<h2 id="about-dialog-title">mentiNote<\/h2>/);
  assert.match(appSource, /https:\/\/github\.com\/SphericalCow1\/mentiNote/);
  assert.match(appSource, /A local Markdown-based knowledge workspace/);
});
