import assert from "node:assert/strict";
import test from "node:test";

import { get } from "svelte/store";
import { appErrorStore, runUserAction } from "../src/lib/stores/appErrors.js";

test("reports a rejected user action once with action context", async () => {
  const messages: string[] = [];

  const succeeded = await runUserAction(
    "Could not move page",
    async () => {
      throw new Error("disk is read-only");
    },
    (message) => messages.push(message),
  );

  assert.equal(succeeded, false);
  assert.deepEqual(messages, ["Could not move page: disk is read-only"]);
});

test("does not report successful or store-handled outcomes", async () => {
  const messages: string[] = [];

  assert.equal(await runUserAction("Could not refresh", async () => undefined, messages.push), true);
  assert.equal(await runUserAction("Could not save", async () => false, messages.push), true);
  assert.deepEqual(messages, []);
});

test("stores and clears the current application error", () => {
  appErrorStore.show("Could not open dialog: unavailable");
  assert.equal(get(appErrorStore).message, "Could not open dialog: unavailable");

  appErrorStore.clear();
  assert.equal(get(appErrorStore).message, null);
});
