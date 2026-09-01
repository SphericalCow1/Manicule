import assert from "node:assert/strict";
import test from "node:test";

import { resolveDialogReturnFocus } from "../src/lib/dialogFocus.js";

function focusTarget(isConnected: boolean) {
  return { isConnected } as HTMLElement;
}

test("prefers an explicit connected dialog return target", () => {
  const explicitTarget = focusTarget(true);
  const previousTarget = focusTarget(true);

  assert.equal(resolveDialogReturnFocus(explicitTarget, previousTarget), explicitTarget);
});

test("falls back when a previous menu trigger was removed", () => {
  const disconnectedMenuTrigger = focusTarget(false);
  const previousTarget = focusTarget(true);

  assert.equal(
    resolveDialogReturnFocus(disconnectedMenuTrigger, previousTarget),
    previousTarget,
  );
});

test("does not focus detached elements after a dialog closes", () => {
  assert.equal(resolveDialogReturnFocus(focusTarget(false), focusTarget(false)), null);
});
