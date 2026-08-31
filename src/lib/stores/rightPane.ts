import { writable } from "svelte/store";
import { getPageView } from "../api.js";
import { toErrorMessage } from "../errors.js";
import type { PageView } from "../types.js";

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

function createRightPaneStore() {
  const { subscribe, set, update } = writable<RightPaneState>(initialState);
  let currentState = initialState;
  let requestSequence = 0;
  let backStack: string[] = [];
  let forwardStack: string[] = [];

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
      return;
    }

    const requestId = ++requestSequence;
    const previousPath = currentState.path;
    update((state) => ({ ...state, path, loading: true, error: null }));

    try {
      const pageView = await getPageView(path);
      if (requestId !== requestSequence) {
        return;
      }
      if (options.recordHistory !== false && previousPath && previousPath !== path) {
        backStack = [...backStack, previousPath];
        forwardStack = [];
      }
      set({
        path,
        pageView,
        revealLine: options.line ?? null,
        revealToken: options.line ? currentState.revealToken + 1 : currentState.revealToken,
        loading: false,
        canGoBack: backStack.length > 0,
        canGoForward: forwardStack.length > 0,
        error: null,
      });
    } catch (error) {
      if (requestId !== requestSequence) {
        return;
      }
      update((state) => ({
        ...state,
        loading: false,
        error: toErrorMessage(error),
      }));
    }
  }

  return {
    subscribe,
    clear() {
      requestSequence += 1;
      backStack = [];
      forwardStack = [];
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
        const pageView = await getPageView(path);
        if (requestId !== requestSequence) {
          return;
        }
        update((state) => ({
          ...state,
          path,
          pageView,
          revealLine: state.revealLine,
          revealToken: state.revealToken,
          canGoBack: backStack.length > 0,
          canGoForward: forwardStack.length > 0,
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
      backStack = [];
      forwardStack = [];
      set(initialState);
    },
    async goBack() {
      const targetPath = backStack.at(-1);
      const previousPath = currentState.path;
      if (!targetPath || !previousPath) {
        return;
      }

      await open(targetPath, { recordHistory: false });
      if (currentState.path !== targetPath) {
        return;
      }

      backStack = backStack.slice(0, -1);
      forwardStack = [...forwardStack, previousPath];
      syncHistoryFlags();
    },
    async goForward() {
      const targetPath = forwardStack.at(-1);
      const previousPath = currentState.path;
      if (!targetPath || !previousPath) {
        return;
      }

      await open(targetPath, { recordHistory: false });
      if (currentState.path !== targetPath) {
        return;
      }

      forwardStack = forwardStack.slice(0, -1);
      backStack = [...backStack, previousPath];
      syncHistoryFlags();
    },
  };

  function syncHistoryFlags() {
    update((state) => ({
      ...state,
      canGoBack: backStack.length > 0,
      canGoForward: forwardStack.length > 0,
    }));
  }
}

export const rightPaneStore = createRightPaneStore();
