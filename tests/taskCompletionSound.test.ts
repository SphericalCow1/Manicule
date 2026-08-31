import assert from "node:assert/strict";
import test from "node:test";

import { playTaskDoneSound } from "../src/lib/taskCompletionSound.js";

test("plays one sound for a transition to the configured closed state", () => {
  const runtime = globalThis as unknown as { window?: unknown };
  const originalWindow = runtime.window;
  const originalNow = Date.now;
  let now = 1_000;
  let oscillatorCount = 0;

  class FakeAudioParam {
    setValueAtTime() {}
    exponentialRampToValueAtTime() {}
  }

  class FakeGain {
    gain = new FakeAudioParam();
    connect() {}
  }

  class FakeOscillator {
    type = "sine";
    frequency = new FakeAudioParam();
    connect() {}
    start() {}
    stop() {}
  }

  class FakeAudioContext {
    state = "running";
    currentTime = 0;
    destination = {};
    createGain() {
      return new FakeGain();
    }
    createOscillator() {
      oscillatorCount += 1;
      return new FakeOscillator();
    }
    async resume() {}
  }

  runtime.window = { AudioContext: FakeAudioContext };
  Date.now = () => now;

  try {
    playTaskDoneSound("WAITING", ["TODO", "WAITING", "DONE"], true);
    assert.equal(oscillatorCount, 0);

    playTaskDoneSound("DONE", ["TODO", "WAITING", "DONE"], true);
    playTaskDoneSound("DONE", ["TODO", "WAITING", "DONE"], true);
    assert.equal(oscillatorCount, 4);

    now += 200;
    playTaskDoneSound("CLOSED", ["TODO", "CLOSED"], true);
    assert.equal(oscillatorCount, 8);

    now += 200;
    playTaskDoneSound("CLOSED", ["TODO", "CLOSED"], false);
    assert.equal(oscillatorCount, 8);
  } finally {
    runtime.window = originalWindow;
    Date.now = originalNow;
  }
});
