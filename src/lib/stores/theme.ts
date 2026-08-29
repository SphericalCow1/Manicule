import { writable } from "svelte/store";
import type { ThemeMode } from "../types";

function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = mode;
}

function createThemeStore() {
  const { subscribe, set, update } = writable<ThemeMode>("light");

  subscribe(applyTheme);

  return {
    subscribe,
    toggle() {
      let next: ThemeMode = "light";
      update((mode) => {
        next = mode === "dark" ? "light" : "dark";
        return next;
      });
      return next;
    },
    set(mode: ThemeMode) {
      set(mode);
    },
  };
}

export const themeStore = createThemeStore();
