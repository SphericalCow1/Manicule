import { writable } from "svelte/store";
import { toErrorPresentation } from "../errors.js";

type AppErrorState = {
  message: string | null;
  detail: string | null;
};

const initialState: AppErrorState = { message: null, detail: null };

function createAppErrorStore() {
  const { subscribe, set } = writable<AppErrorState>(initialState);

  return {
    subscribe,
    clear() {
      set(initialState);
    },
    show(message: string, detail: string | null = null) {
      set({ message, detail });
    },
  };
}

export type ActionErrorReporter = (message: string, detail: string | null) => void;

export async function runUserAction(
  context: string,
  action: () => unknown | Promise<unknown>,
  reportError: ActionErrorReporter = (message, detail) => appErrorStore.show(message, detail),
) {
  try {
    await action();
    return true;
  } catch (error) {
    const presentation = toErrorPresentation(error);
    reportError(`${context}: ${presentation.message}`, presentation.detail);
    return false;
  }
}

export const appErrorStore = createAppErrorStore();
