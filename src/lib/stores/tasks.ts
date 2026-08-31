import { writable } from "svelte/store";
import { listTasks } from "../api.js";
import { toErrorMessage } from "../errors.js";
import type { TaskItem } from "../types.js";

type TaskStoreState = {
  tasks: TaskItem[];
  loading: boolean;
  error: string | null;
};

const initialState: TaskStoreState = {
  tasks: [],
  loading: false,
  error: null,
};

function createTaskStore() {
  const { subscribe, set, update } = writable<TaskStoreState>(initialState);

  return {
    subscribe,
    clear() {
      set(initialState);
    },
    clearError() {
      update((state) => ({ ...state, error: null }));
    },
    async refresh() {
      update((state) => ({ ...state, loading: true, error: null }));

      try {
        const tasks = await listTasks();
        set({ tasks, loading: false, error: null });
      } catch (error) {
        update((state) => ({
          ...state,
          loading: false,
          error: toErrorMessage(error),
        }));
      }
    },
  };
}

export const taskStore = createTaskStore();
