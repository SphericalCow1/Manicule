import assert from "node:assert/strict";
import test from "node:test";

import { get } from "svelte/store";
import { appErrorStore, runUserAction } from "../src/lib/stores/appErrors.js";

test("reports a rejected user action once with action context", async () => {
  const reports: Array<{ message: string; detail: string | null }> = [];

  const succeeded = await runUserAction(
    "Could not move page",
    async () => {
      throw new Error("disk is read-only");
    },
    (message, detail) => reports.push({ message, detail }),
  );

  assert.equal(succeeded, false);
  assert.deepEqual(reports, [
    { message: "Could not move page: disk is read-only", detail: null },
  ]);
});

test("does not report successful or store-handled outcomes", async () => {
  const messages: string[] = [];
  const report = (message: string) => messages.push(message);

  assert.equal(await runUserAction("Could not refresh", async () => undefined, report), true);
  assert.equal(await runUserAction("Could not save", async () => false, report), true);
  assert.deepEqual(messages, []);
});

test("stores and clears the current application error", () => {
  appErrorStore.show("Could not open dialog: unavailable");
  assert.deepEqual(get(appErrorStore), {
    message: "Could not open dialog: unavailable",
    detail: null,
  });

  appErrorStore.clear();
  assert.deepEqual(get(appErrorStore), { message: null, detail: null });
});

test("stores technical details separately from the user-facing message", async () => {
  const succeeded = await runUserAction("Could not rename page", async () => {
    throw {
      code: "io",
      message: "The page could not be renamed.",
      detail: "permission denied",
    };
  });

  assert.equal(succeeded, false);
  assert.deepEqual(get(appErrorStore), {
    message: "Could not rename page: The page could not be renamed.",
    detail: "permission denied",
  });
  appErrorStore.clear();
});
