import { writable } from "svelte/store";

const zoomStorageKey = "mentinote:zoom";
const defaultZoom = 1;
const minZoom = 0.75;
const maxZoom = 1.25;
const zoomStep = 0.05;

function createZoomStore() {
  const { subscribe, set, update } = writable(loadZoom());

  function setZoom(value: number) {
    const next = clampZoom(value);
    localStorage.setItem(zoomStorageKey, String(next));
    set(next);
  }

  return {
    subscribe,
    zoomIn() {
      update((value) => {
        const next = clampZoom(value + zoomStep);
        localStorage.setItem(zoomStorageKey, String(next));
        return next;
      });
    },
    zoomOut() {
      update((value) => {
        const next = clampZoom(value - zoomStep);
        localStorage.setItem(zoomStorageKey, String(next));
        return next;
      });
    },
    reset() {
      setZoom(defaultZoom);
    },
  };
}

function loadZoom() {
  const stored = Number(localStorage.getItem(zoomStorageKey));
  return Number.isFinite(stored) ? clampZoom(stored) : defaultZoom;
}

function clampZoom(value: number) {
  return Math.min(maxZoom, Math.max(minZoom, Math.round(value * 20) / 20));
}

export const zoomStore = createZoomStore();
