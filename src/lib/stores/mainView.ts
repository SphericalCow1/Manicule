import { writable } from "svelte/store";

export type MainView = "editor" | "tasks";

export const mainViewStore = writable<MainView>("editor");
