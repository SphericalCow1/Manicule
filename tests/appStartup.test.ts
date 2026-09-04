import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("keeps the startup screen free of branding artwork", () => {
  const appSource = readFileSync(join(process.cwd(), "src/App.svelte"), "utf8");

  assert.ok(!/welcomeIllustration|welcome-illustration/.test(appSource));
  assert.match(
    appSource,
    /<main class="welcome-screen" aria-busy="true" aria-label="Loading Logtext"><\/main>/,
  );
});
