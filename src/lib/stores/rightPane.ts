import { writable } from "svelte/store";
import { getPageView } from "../api.js";
import { toErrorMessage } from "../errors.js";
import type { PageView } from "../types.js";
import { createNavigationHistory } from "./navigationHistory.js";

type RightPaneState = {
  path: string | null;
  pageView: PageView | null;
  revealLine: number | null;
  revealToken: number;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  error: string | null;
};

const initialState: RightPaneState = {
  path: null,
  pageView: null,
  revealLine: null,
  revealToken: 0,
  loading: false,
  canGoBack: false,
  canGoForward: false,
  error: null,
};

type RightPaneOpenOptions = {
  recordHistory?: boolean;
  line?: number;
};

export type RightPaneDependencies = {
  getPageView: (path: string) => Promise<PageView>;
};

const defaultDependencies: RightPaneDependencies = { getPageView };

export function createRightPaneStore(dependencies: RightPaneDependencies = defaultDependencies) {
  const { subscribe, set, update } = writable<RightPaneState>(initialState);
  let currentState = initialState;
  let requestSequence = 0;
  const navigationHistory = createNavigationHistory();

  subscribe((state) => {
    currentState = state;
  });

  async function open(path: string, options: RightPaneOpenOptions = {}) {
    if (currentState.path === path) {
      update((state) => ({
        ...state,
        revealLine: options.line ?? state.revealLine,
        revealToken: options.line ? state.revealToken + 1 : state.revealToken,
        error: null,
      }));
      return true;
    }

    const requestId = ++requestSequence;
    const previousPath = currentState.path;
    update((state) => ({ ...state, path, loading: true, error: null }));

    try {
      const pageView = await dependencies.getPageView(path);
      if (requestId !== requestSequence) {
        return false;
      }
      if (options.recordHistory !== false && previousPath && previousPath !== path) {
        navigationHistory.record(previousPath, path);
      }
      const historyAvailability = navigationHistory.availability();
      set({
        path,
        pageView,
        revealLine: options.line ?? null,
        revealToken: options.line ? currentState.revealToken + 1 : currentState.revealToken,
        loading: false,
        ...historyAvailability,
        error: null,
      });
      return true;
    } catch (error) {
      if (requestId !== requestSequence) {
        return false;
      }
      update((state) => ({
        ...state,
        path: previousPath,
        loading: false,
        error: toErrorMessage(error),
      }));
      return false;
    }
  }

  return {
    subscribe,
    clear() {
      requestSequence += 1;
      navigationHistory.clear();
      set(initialState);
    },
    clearError() {
      update((state) => ({ ...state, error: null }));
    },
    open,
    async refresh() {
      if (!currentState.path) {
        return;
      }

      const path = currentState.path;
      const requestId = ++requestSequence;

      try {
        const pageView = await dependencies.getPageView(path);
        if (requestId !== requestSequence) {
          return;
        }
        update((state) => ({
          ...state,
          path,
          pageView,
          revealLine: state.revealLine,
          revealToken: state.revealToken,
          ...navigationHistory.availability(),
          error: null,
        }));
      } catch (error) {
        if (requestId !== requestSequence) {
          return;
        }
        update((state) => ({
          ...state,
          error: toErrorMessage(error),
        }));
      }
    },
    clearIfPath(path: string) {
      if (currentState.path !== path) {
        return;
      }

      requestSequence += 1;
      navigationHistory.clear();
      set(initialState);
    },
    async goBack() {
      await navigationHistory.goBack(currentState.path, (targetPath) =>
        open(targetPath, { recordHistory: false }),
      );
      syncHistoryFlags();
    },
    async goForward() {
      await navigationHistory.goForward(currentState.path, (targetPath) =>
        open(targetPath, { recordHistory: false }),
      );
      syncHistoryFlags();
    },
  };

  function syncHistoryFlags() {
    update((state) => ({
      ...state,
      ...navigationHistory.availability(),
    }));
  }
}

export const rightPaneStore = createRightPaneStore();
