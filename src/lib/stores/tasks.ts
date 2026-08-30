import { writable } from "svelte/store";
import { listTasks, updateTaskPriority, updateTaskStatus } from "../api";
import { toErrorMessage } from "../errors";
import type { TaskItem, TaskStatus } from "../types";

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
    async updateStatus(task: TaskItem, newStatus: TaskStatus) {
      if (task.status === newStatus) {
        return null;
      }

      update((state) => ({ ...state, loading: true, error: null }));

      try {
        const result = await updateTaskStatus(task.path, task.line, task.status, newStatus);
        const tasks = await listTasks();
        set({ tasks, loading: false, error: null });
        return result.task;
      } catch (error) {
        update((state) => ({
          ...state,
          loading: false,
          error: toErrorMessage(error),
        }));
        return null;
      }
    },
    async updatePriority(task: TaskItem, priority: string | null) {
      if (task.priority === priority) {
        return null;
      }

      update((state) => ({ ...state, loading: true, error: null }));

      try {
        const result = await updateTaskPriority(task.path, task.line, priority);
        const tasks = await listTasks();
        set({ tasks, loading: false, error: null });
        return result.task;
      } catch (error) {
        update((state) => ({
          ...state,
          loading: false,
          error: toErrorMessage(error),
        }));
        return null;
      }
    },
  };
}

export const taskStore = createTaskStore();
