import type { PageSummary } from "../types.js";
import { editorSessionStore } from "./editorSession.js";
import { mainViewStore } from "./mainView.js";
import { rightPaneStore } from "./rightPane.js";
import { workspaceStore } from "./workspace.js";

export type LinkTargetPane = "editor" | "right";

export type LinkOpenOptions = {
  line?: number;
  recordHistory?: boolean;
};

export type CreateLinkOptions = LinkOpenOptions & {
  afterCreate?: (page: PageSummary) => void | Promise<void>;
};

export type LinkOperationDependencies = {
  showEditor: () => void;
  openEditor: (path: string, options: LinkOpenOptions) => Promise<unknown>;
  openRightPane: (path: string, options: LinkOpenOptions) => Promise<unknown>;
  createPage: (path: string) => Promise<PageSummary | null | undefined>;
};

const defaultDependencies: LinkOperationDependencies = {
  showEditor: () => mainViewStore.set("editor"),
  openEditor: (path, options) => editorSessionStore.open(path, options),
  openRightPane: (path, options) => rightPaneStore.open(path, options),
  createPage: (path) => workspaceStore.createPage(path),
};

export function markdownPathForLinkTarget(target: string) {
  return target.endsWith(".md") ? target : `${target}.md`;
}

export function createLinkOperations(
  dependencies: LinkOperationDependencies = defaultDependencies,
) {
  async function open(
    target: string,
    targetPane: LinkTargetPane,
    options: LinkOpenOptions = {},
  ) {
    const path = markdownPathForLinkTarget(target);

    if (targetPane === "editor") {
      dependencies.showEditor();
      await dependencies.openEditor(path, options);
    } else {
      await dependencies.openRightPane(path, options);
    }

    return path;
  }

  return {
    open,
    async createAndOpen(
      target: string,
      targetPane: LinkTargetPane,
      options: CreateLinkOptions = {},
    ) {
      const page = await dependencies.createPage(markdownPathForLinkTarget(target));
      if (!page) {
        return null;
      }

      await options.afterCreate?.(page);
      await open(page.path, targetPane, {
        line: options.line,
        recordHistory: options.recordHistory,
      });
      return page;
    },
  };
}

export const linkOperations = createLinkOperations();
