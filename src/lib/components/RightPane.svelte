<script lang="ts">
  import ErrorDialog from "./ErrorDialog.svelte";
  import MarkdownView from "./MarkdownView.svelte";
  import LinkedReferences from "./LinkedReferences.svelte";
  import { linkOperations, type LinkTargetPane } from "../stores/linkOperations";
  import { mutationOperations } from "../stores/mutationOperations";
  import { rightPaneStore } from "../stores/rightPane";
  import { workspaceStore } from "../stores/workspace";
  import type { BacklinkView } from "../types";

  let lastPagePath: string | null = null;
  let missingLinkPath: string | null = null;
  let mutationError: string | null = null;

  $: if ($rightPaneStore.path !== lastPagePath) {
    lastPagePath = $rightPaneStore.path;
    missingLinkPath = null;
    mutationError = null;
  }

  function openWikiTarget(target: string, targetPane: LinkTargetPane) {
    void linkOperations.open(target, targetPane);
  }

  function openBacklinkInEditor(backlink: BacklinkView) {
    void linkOperations.open(backlink.sourcePath, "editor", { line: backlink.lineStart });
  }

  function openCurrentInEditor() {
    if ($rightPaneStore.path) {
      void linkOperations.open($rightPaneStore.path, "editor");
    }
  }

  function openCurrentLineInEditor(line: number) {
    if ($rightPaneStore.path) {
      void linkOperations.open($rightPaneStore.path, "editor", { line });
    }
  }

  function openBacklinkLineInEditor(backlink: BacklinkView, line: number) {
    void linkOperations.open(backlink.sourcePath, "editor", { line });
  }

  function closeErrorDialog() {
    mutationError = null;
    rightPaneStore.clearError();
  }

  function saveBacklinkOpenTasksOnly(openTasksOnly: boolean) {
    void workspaceStore.saveBacklinkViewConfig({
      ...$workspaceStore.backlinkView,
      openTasksOnly,
    });
  }

  function requestMissingPage(path: string) {
    missingLinkPath = path;
  }

  async function createMissingPage(openTarget: "editor" | "right") {
    if (!missingLinkPath) {
      return;
    }

    await linkOperations.createAndOpen(missingLinkPath, openTarget, {
      afterCreate: async () => {
        missingLinkPath = null;
        await rightPaneStore.refresh();
      },
    });
  }

  async function toggleCheckboxForPath(path: string | null, line: number, previousChecked: boolean) {
    const result = await mutationOperations.toggleCheckbox(path, line, previousChecked);
    mutationError = result.error;
  }

  async function changeTaskStatusForPath(
    path: string | null,
    line: number,
    currentStatus: string,
    nextStatus: string,
  ) {
    const result = await mutationOperations.setTaskStatus(
      path,
      line,
      currentStatus,
      nextStatus,
    );
    mutationError = result.error;
  }

  async function changeTaskPriorityForPath(
    path: string | null,
    line: number,
    currentPriority: string | null,
    nextPriority: string | null,
  ) {
    const result = await mutationOperations.setTaskPriority(
      path,
      line,
      currentPriority,
      nextPriority,
    );
    mutationError = result.error;
  }
</script>

<aside class="right-pane" aria-label="Right pane">
  <div class="pane-header">
    <div class="pane-title-group">
      <div class="pane-nav-actions" aria-label="Right pane navigation">
        <button
          type="button"
          title="Back"
          aria-label="Back"
          disabled={!$rightPaneStore.canGoBack}
          on:click={() => void rightPaneStore.goBack()}
        >
          ‹
        </button>
        <button
          type="button"
          title="Forward"
          aria-label="Forward"
          disabled={!$rightPaneStore.canGoForward}
          on:click={() => void rightPaneStore.goForward()}
        >
          ›
        </button>
      </div>
      <h2>{$rightPaneStore.path ?? "Right Pane"}</h2>
    </div>
    <div class="right-pane-header-actions">
      <button
        class="pane-transfer-button"
        type="button"
        title="Open current right pane page in editor"
        disabled={!$rightPaneStore.path}
        on:click={openCurrentInEditor}
      >
        Open Editor
      </button>
      {#if $rightPaneStore.loading}
        <span class="status">Loading</span>
      {/if}
    </div>
  </div>
  <ErrorDialog
    title="Right Pane Error"
    message={mutationError ?? $rightPaneStore.error}
    onClose={closeErrorDialog}
  />

  {#if !$rightPaneStore.pageView}
    <div class="preview-empty">Open a page in the right pane to preview it with backlinks.</div>
  {:else}
    <div class="right-pane-scroll">
      <article class="preview-content">
        {#if missingLinkPath}
          <div class="missing-link-action">
            <span>Create missing page <strong>{missingLinkPath}</strong>?</span>
            <div>
              <button type="button" on:click={() => createMissingPage("right")}>
                Create + open right
              </button>
              <button type="button" on:click={() => createMissingPage("editor")}>
                Create + open editor
              </button>
              <button type="button" on:click={() => (missingLinkPath = null)}>
                Cancel
              </button>
            </div>
          </div>
        {/if}
        <MarkdownView
          content={$rightPaneStore.pageView.content}
          pages={$workspaceStore.pages}
          taskStates={$workspaceStore.taskStates}
          taskStateColors={$workspaceStore.taskStateColors}
          folderColors={$workspaceStore.folderColors}
          highlightedLine={$rightPaneStore.revealLine}
          highlightToken={$rightPaneStore.revealToken}
          onWikiLink={(target) => openWikiTarget(target, "right")}
          onMissingWikiLink={requestMissingPage}
          onCheckboxToggle={(line, checked) =>
            void toggleCheckboxForPath($rightPaneStore.path, line, checked)}
          onOpenWikiLink={openWikiTarget}
          onOpenSourceLineInEditor={openCurrentLineInEditor}
          sourceLineMenuTargets={["editor"]}
          enableTaskContextMenu
          onTaskStatusChange={(line, currentStatus, nextStatus) =>
            void changeTaskStatusForPath($rightPaneStore.path, line, currentStatus, nextStatus)}
          onTaskPriorityChange={(line, currentPriority, nextPriority) =>
            void changeTaskPriorityForPath($rightPaneStore.path, line, currentPriority, nextPriority)}
        />
      </article>

      {#if $rightPaneStore.pageView.backlinks.length > 0}
        <LinkedReferences
          backlinks={$rightPaneStore.pageView.backlinks}
          pages={$workspaceStore.pages}
          taskStates={$workspaceStore.taskStates}
          taskStateColors={$workspaceStore.taskStateColors}
          folderColors={$workspaceStore.folderColors}
          openTasksOnly={$workspaceStore.backlinkView.openTasksOnly}
          onOpenTasksOnlyChange={saveBacklinkOpenTasksOnly}
          onWikiLink={(target) => openWikiTarget(target, "right")}
          onMissingWikiLink={requestMissingPage}
          onOpenWikiLink={openWikiTarget}
          onOpenSourceInEditor={openBacklinkInEditor}
          onOpenSourceLineInEditor={openBacklinkLineInEditor}
          sourceLineMenuTargets={["editor"]}
          enableTaskContextMenu
          onCheckboxToggle={(path, line, checked) => void toggleCheckboxForPath(path, line, checked)}
          onTaskStatusChange={(path, line, currentStatus, nextStatus) =>
            void changeTaskStatusForPath(path, line, currentStatus, nextStatus)}
          onTaskPriorityChange={(path, line, currentPriority, nextPriority) =>
            void changeTaskPriorityForPath(path, line, currentPriority, nextPriority)}
        />
      {/if}
    </div>
  {/if}
</aside>
