<script lang="ts">
  import CodeMirrorEditor from "./CodeMirrorEditor.svelte";
  import ErrorDialog from "./ErrorDialog.svelte";
  import LinkedReferences from "./LinkedReferences.svelte";
  import { getPageView } from "../api";
  import { toErrorMessage } from "../errors";
  import { editorSessionStore } from "../stores/editorSession";
  import { editorModeStore } from "../stores/editorMode";
  import { appUndoStore } from "../stores/appUndo";
  import { linkOperations, type LinkTargetPane } from "../stores/linkOperations";
  import { workspaceStore } from "../stores/workspace";
  import type { BacklinkView, PageView } from "../types";

  let editor: { saveCurrentDocument: () => void } | null = null;
  let pageView: PageView | null = null;
  let pageViewLoading = false;
  let pageViewError: string | null = null;
  let pageViewRequestKey = "";
  let pageViewRequestSequence = 0;
  let missingLinkPath: string | null = null;

  $: nextPageViewRequestKey =
    $editorSessionStore.path && $editorSessionStore.contentHash
      ? `${$editorSessionStore.path}:${$editorSessionStore.contentHash}`
      : "";

  $: if (nextPageViewRequestKey !== pageViewRequestKey) {
    pageViewRequestKey = nextPageViewRequestKey;
    void loadEditorPageView($editorSessionStore.path);
  }

  async function loadEditorPageView(path: string | null) {
    const requestId = ++pageViewRequestSequence;
    missingLinkPath = null;

    if (!path) {
      pageView = null;
      pageViewLoading = false;
      pageViewError = null;
      return;
    }

    pageViewLoading = true;
    pageViewError = null;

    try {
      const nextPageView = await getPageView(path);
      if (requestId !== pageViewRequestSequence) {
        return;
      }
      pageView = nextPageView;
    } catch (error) {
      if (requestId !== pageViewRequestSequence) {
        return;
      }
      pageView = null;
      pageViewError = toErrorMessage(error);
    } finally {
      if (requestId === pageViewRequestSequence) {
        pageViewLoading = false;
      }
    }
  }

  function openWikiTarget(target: string, targetPane: LinkTargetPane) {
    void linkOperations.open(target, targetPane);
  }

  function openBacklinkInEditor(backlink: BacklinkView) {
    void linkOperations.open(backlink.sourcePath, "editor", { line: backlink.lineStart });
  }

  function openCurrentInRightPane() {
    if ($editorSessionStore.path) {
      void linkOperations.open($editorSessionStore.path, "right");
    }
  }

  function openCurrentLineInRightPane(line: number) {
    if ($editorSessionStore.path) {
      void linkOperations.open($editorSessionStore.path, "right", { line });
    }
  }

  function openBacklinkLineInRightPane(backlink: BacklinkView, line: number) {
    void linkOperations.open(backlink.sourcePath, "right", { line });
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

  function closeErrorDialog() {
    if ($editorSessionStore.error) {
      editorSessionStore.clearError();
      return;
    }
    pageViewError = null;
  }

  async function createMissingPage(openTarget: "editor" | "right") {
    if (!missingLinkPath) {
      return;
    }

    await linkOperations.createAndOpen(missingLinkPath, openTarget, {
      afterCreate: async () => {
        missingLinkPath = null;
        await loadEditorPageView($editorSessionStore.path);
      },
    });
  }

</script>

<section class="editor-pane" aria-label="Editor">
  <div class="pane-header">
    <div class="pane-title-group">
      <div class="pane-nav-actions" aria-label="Editor navigation">
        <button
          type="button"
          title="Back"
          aria-label="Back"
          disabled={!$editorSessionStore.canGoBack}
          on:click={() => void editorSessionStore.goBack()}
        >
          ‹
        </button>
        <button
          type="button"
          title="Forward"
          aria-label="Forward"
          disabled={!$editorSessionStore.canGoForward}
          on:click={() => void editorSessionStore.goForward()}
        >
          ›
        </button>
      </div>
      <h2>{$editorSessionStore.path ?? "Editor"}</h2>
      <button
        type="button"
        class="editor-save-button"
        title={$editorSessionStore.dirty ? "Save current file" : "No unsaved changes"}
        disabled={!$editorSessionStore.path || !$editorSessionStore.dirty || $editorSessionStore.saving || $editorSessionStore.loading || $editorSessionStore.conflict}
        on:click={() => editor?.saveCurrentDocument()}
      >
        Save
      </button>
    </div>
    <div class="editor-header-actions">
      <button
        class="editor-open-right-button pane-transfer-button"
        type="button"
        title="Open current editor page in right pane"
        disabled={!$editorSessionStore.path}
        on:click={openCurrentInRightPane}
      >
        Open Right
      </button>
    </div>
  </div>
  <ErrorDialog
    title="Editor Error"
    message={$editorSessionStore.error ?? pageViewError}
    onClose={closeErrorDialog}
    secondaryActionLabel={$editorSessionStore.conflict ? "Reload from disk" : null}
    onSecondaryAction={$editorSessionStore.conflict ? () => editorSessionStore.reloadFromDisk() : null}
    primaryActionLabel={$editorSessionStore.conflict ? "Overwrite disk" : null}
    onPrimaryAction={$editorSessionStore.conflict ? () => editorSessionStore.overwriteDisk() : null}
  />
  <div class="editor-scroll">
    <CodeMirrorEditor
      bind:this={editor}
      value={$editorSessionStore.content}
      documentPath={$editorSessionStore.path}
      pages={$workspaceStore.pages}
      taskStates={$workspaceStore.taskStates}
      taskStateColors={$workspaceStore.taskStateColors}
      folderColors={$workspaceStore.folderColors}
      taskDoneSoundEnabled={$workspaceStore.taskDoneSoundEnabled}
      mode={$editorModeStore}
      revealLine={$editorSessionStore.revealLine}
      revealToken={$editorSessionStore.revealToken}
      disabled={!$editorSessionStore.path || $editorSessionStore.loading}
      onChange={(content) => editorSessionStore.setContent(content)}
      onSave={(content) => void editorSessionStore.save(content)}
      onEditorHistoryChange={(path) => appUndoStore.recordEditorChange(path)}
      onEditorHistoryDiscard={(path) => appUndoStore.discardEditorHistory(path)}
      onOpenWikiLink={openWikiTarget}
      onOpenSourceLineInRightPane={openCurrentLineInRightPane}
    />
    {#if missingLinkPath}
      <div class="missing-link-action editor-missing-link-action">
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
    {#if pageViewLoading}
      <div class="editor-linked-references-status">Loading linked references</div>
    {:else if pageView && pageView.backlinks.length > 0}
      <LinkedReferences
        compact
        backlinks={pageView.backlinks}
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
        onOpenSourceLineInRightPane={openBacklinkLineInRightPane}
        sourceLineMenuTargets={["right"]}
      />
    {/if}
  </div>
</section>
