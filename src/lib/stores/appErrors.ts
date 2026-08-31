import { writable } from "svelte/store";
import { toErrorMessage } from "../errors.js";

type AppErrorState = {
  message: string | null;
};

const initialState: AppErrorState = { message: null };

function createAppErrorStore() {
  const { subscribe, set } = writable<AppErrorState>(initialState);

  return {
    subscribe,
    clear() {
      set(initialState);
    },
    show(message: string) {
      set({ message });
    },
  };
}

export type ActionErrorReporter = (message: string) => void;

export async function runUserAction(
  context: string,
  action: () => unknown | Promise<unknown>,
  reportError: ActionErrorReporter = (message) => appErrorStore.show(message),
) {
  try {
    await action();
    return true;
  } catch (error) {
    reportError(`${context}: ${toErrorMessage(error)}`);
    return false;
  }
}

export const appErrorStore = createAppErrorStore();
