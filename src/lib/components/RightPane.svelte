<script lang="ts">
  import ErrorDialog from "./ErrorDialog.svelte";
  import MarkdownView from "./MarkdownView.svelte";
  import LinkedReferences from "./LinkedReferences.svelte";
  import { toggleCheckbox, updateTaskPriority, updateTaskStatus } from "../api";
  import { appUndoStore } from "../stores/appUndo";
  import { editorSessionStore } from "../stores/editorSession";
  import { mainViewStore } from "../stores/mainView";
  import { rightPaneStore } from "../stores/rightPane";
  import { taskStore } from "../stores/tasks";
  import { playTaskDoneSound } from "../taskCompletionSound";
  import { workspaceStore } from "../stores/workspace";
  import type { BacklinkView } from "../types";

  let lastPagePath: string | null = null;
  let missingLinkPath: string | null = null;

  $: if ($rightPaneStore.path !== lastPagePath) {
    lastPagePath = $rightPaneStore.path;
    missingLinkPath = null;
  }

  function openWikiTarget(target: string) {
    void rightPaneStore.open(target.endsWith(".md") ? target : `${target}.md`);
  }

  function openWikiTargetInEditor(target: string) {
    mainViewStore.set("editor");
    void editorSessionStore.open(target.endsWith(".md") ? target : `${target}.md`);
  }

  function openBacklinkInEditor(backlink: BacklinkView) {
    mainViewStore.set("editor");
    void editorSessionStore.open(backlink.sourcePath, { line: backlink.lineStart });
  }

  function openCurrentInEditor() {
    if ($rightPaneStore.path) {
      mainViewStore.set("editor");
      void editorSessionStore.open($rightPaneStore.path);
    }
  }

  function openCurrentLineInEditor(line: number) {
    if ($rightPaneStore.path) {
      mainViewStore.set("editor");
      void editorSessionStore.open($rightPaneStore.path, { line });
    }
  }

  function openBacklinkLineInEditor(backlink: BacklinkView, line: number) {
    mainViewStore.set("editor");
    void editorSessionStore.open(backlink.sourcePath, { line });
  }

  function closeErrorDialog() {
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

    const page = await workspaceStore.createPage(missingLinkPath);
    if (!page) {
      return;
    }

    const createdPath = page.path;
    missingLinkPath = null;
    await rightPaneStore.refresh();

    if (openTarget === "editor") {
      mainViewStore.set("editor");
      await editorSessionStore.open(createdPath);
    } else {
      await rightPaneStore.open(createdPath);
    }
  }

  async function toggleCheckboxForPath(path: string | null, line: number, previousChecked: boolean) {
    if (!path) {
      return;
    }

    if ($editorSessionStore.path === path) {
      isolateMiddleEditorHistory();
      const changed = editorSessionStore.toggleCheckboxLine(line);
      if (changed) {
        const saved = await editorSessionStore.save();
        if (saved) {
          appUndoStore.push({
            kind: "checkbox",
            path,
            line,
            beforeChecked: previousChecked,
            afterChecked: !previousChecked,
          });
          isolateMiddleEditorHistory();
        }
      }
      await rightPaneStore.refresh();
      return;
    }

    const result = await toggleCheckbox(path, line);
    appUndoStore.push({
      kind: "checkbox",
      path: result.path,
      line: result.line,
      beforeChecked: previousChecked,
      afterChecked: result.checked,
    });
    await rightPaneStore.refresh();
  }

  async function changeTaskStatusForPath(
    path: string | null,
    line: number,
    currentStatus: string,
    nextStatus: string,
  ) {
    if (!path || currentStatus === nextStatus) {
      return;
    }

    if ($editorSessionStore.path === path) {
      isolateMiddleEditorHistory();
      const changed = editorSessionStore.setTaskStatusLine(
        line,
        currentStatus,
        nextStatus,
        $workspaceStore.taskStates,
      );
      if (changed) {
        const saved = await editorSessionStore.save();
        if (saved) {
          appUndoStore.push({
            kind: "task-status",
            path,
            line,
            beforeStatus: currentStatus,
            afterStatus: nextStatus,
          });
          isolateMiddleEditorHistory();
          playTaskDoneSound(
            nextStatus,
            $workspaceStore.taskStates,
            $workspaceStore.taskDoneSoundEnabled,
          );
        }
      }
      await rightPaneStore.refresh();
      void taskStore.refresh();
      return;
    }

    const result = await updateTaskStatus(path, line, currentStatus, nextStatus);
    appUndoStore.push({
      kind: "task-status",
      path: result.task.path,
      line: result.task.line,
      beforeStatus: currentStatus,
      afterStatus: nextStatus,
    });
    await rightPaneStore.refresh();
    void taskStore.refresh();
    playTaskDoneSound(
      nextStatus,
      $workspaceStore.taskStates,
      $workspaceStore.taskDoneSoundEnabled,
    );
  }

  async function changeTaskPriorityForPath(
    path: string | null,
    line: number,
    currentPriority: string | null,
    nextPriority: string | null,
  ) {
    if (!path) {
      return;
    }

    if (currentPriority === nextPriority) {
      return;
    }

    if ($editorSessionStore.path === path) {
      isolateMiddleEditorHistory();
      const changed = editorSessionStore.setTaskPriorityLine(
        line,
        nextPriority,
        $workspaceStore.taskStates,
      );
      if (changed) {
        const saved = await editorSessionStore.save();
        if (saved) {
          appUndoStore.push({
            kind: "task-priority",
            path,
            line,
            beforePriority: currentPriority,
            afterPriority: nextPriority,
          });
          isolateMiddleEditorHistory();
        }
      }
      await rightPaneStore.refresh();
      void taskStore.refresh();
      return;
    }

    const result = await updateTaskPriority(path, line, nextPriority);
    appUndoStore.push({
      kind: "task-priority",
      path: result.task.path,
      line: result.task.line,
      beforePriority: currentPriority,
      afterPriority: nextPriority,
    });
    await rightPaneStore.refresh();
    void taskStore.refresh();
  }

  function isolateMiddleEditorHistory() {
    window.dispatchEvent(new CustomEvent("semtags-editor-isolate-history"));
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
    message={$rightPaneStore.error}
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
          onWikiLink={openWikiTarget}
          onMissingWikiLink={requestMissingPage}
          onCheckboxToggle={(line, checked) =>
            void toggleCheckboxForPath($rightPaneStore.path, line, checked)}
          onOpenWikiLinkInEditor={openWikiTargetInEditor}
          onOpenWikiLinkInRightPane={openWikiTarget}
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
          onWikiLink={openWikiTarget}
          onMissingWikiLink={requestMissingPage}
          onOpenWikiLinkInEditor={openWikiTargetInEditor}
          onOpenWikiLinkInRightPane={openWikiTarget}
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
