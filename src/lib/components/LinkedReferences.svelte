<script lang="ts">
  import { filterBacklinks } from "../backlinkGroups";
  import type { BacklinkView, FolderColors, PageSummary, TaskStateColors, TaskStatus } from "../types";
  import { compactPageFolderLabel } from "../wikiLinks";
  import type { LinkTargetPane } from "../stores/linkOperations";
  import MarkdownView from "./MarkdownView.svelte";

  export let backlinks: BacklinkView[] = [];
  export let pages: PageSummary[] = [];
  export let taskStates: TaskStatus[] = [];
  export let taskStateColors: TaskStateColors = {};
  export let folderColors: FolderColors = {};
  export let compact = false;
  export let initiallyCollapsed = false;
  export let openTasksOnly = false;
  export let onOpenTasksOnlyChange: (openTasksOnly: boolean) => void = () => {};
  export let onWikiLink: (target: string) => void;
  export let onMissingWikiLink: (path: string) => void;
  export let onOpenWikiLink: (target: string, targetPane: LinkTargetPane) => void = () => {};
  export let onOpenSourceInEditor: (backlink: BacklinkView) => void;
  export let onOpenSourceLineInEditor: (backlink: BacklinkView, line: number) => void = () => {};
  export let onOpenSourceLineInRightPane: (backlink: BacklinkView, line: number) => void = () => {};
  export let sourceLineMenuTargets: Array<"editor" | "right"> = [];
  export let enableTaskContextMenu = false;
  export let onCheckboxToggle: (path: string, line: number, checked: boolean) => void = () => {};
  export let onTaskStatusChange: (
    path: string,
    line: number,
    currentStatus: string,
    nextStatus: string,
  ) => void = () => {};
  export let onTaskPriorityChange: (
    path: string,
    line: number,
    currentPriority: string | null,
    nextPriority: string | null,
  ) => void = () => {};

  let backlinkFilter = "";
  let collapsedBacklinkKeys = new Set<string>();
  let collapsed = initiallyCollapsed;
  let lastBacklinkKey = "";

  $: backlinkKey = backlinks.map((backlink) => `${backlink.sourcePath}:${backlink.lineStart}`).join("|");
  $: filteredBacklinks = filterBacklinks(backlinks, backlinkFilter, {
    openTasksOnly,
    taskStates,
  });

  $: if (backlinkKey !== lastBacklinkKey) {
    lastBacklinkKey = backlinkKey;
    backlinkFilter = "";
    collapsedBacklinkKeys = new Set();
    collapsed = initiallyCollapsed;
  }

  function updateOpenTasksOnly(checked: boolean) {
    openTasksOnly = checked;
    onOpenTasksOnlyChange(checked);
  }

  function toggleBacklink(backlink: BacklinkView) {
    const key = backlinkKeyFor(backlink);
    const next = new Set(collapsedBacklinkKeys);

    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }

    collapsedBacklinkKeys = next;
  }

  function backlinkKeyFor(backlink: BacklinkView) {
    return `${backlink.sourcePath}:${backlink.lineStart}`;
  }

  function headingLabel(backlink: BacklinkView) {
    return backlinkHeadings(backlink).join(" / ");
  }

  function sourceLabel(backlink: BacklinkView) {
    const folder = compactPageFolderLabel(backlink.sourcePath, pages);
    return folder ? `${folder} / ${backlink.sourceTitle}` : backlink.sourceTitle;
  }

  function backlinkHeadings(backlink: BacklinkView) {
    return backlink.sourceHeadings[0] === backlink.sourceTitle
      ? backlink.sourceHeadings.slice(1)
      : backlink.sourceHeadings;
  }
</script>

<section class:compact class="backlinks" aria-label="Linked References">
  <div class="backlinks-header">
    <button
      type="button"
      class="backlinks-toggle"
      aria-expanded={!collapsed}
      on:click={() => (collapsed = !collapsed)}
    >
      <span>{collapsed ? "▸" : "▾"}</span>
      <h3>Linked References</h3>
    </button>
    <small>{filteredBacklinks.length} / {backlinks.length}</small>
  </div>

  {#if !collapsed}
    <div class="backlink-controls">
      <input
        type="search"
        bind:value={backlinkFilter}
        placeholder="Filter backlinks"
        aria-label="Filter backlinks"
      />
      <label>
        <input
          type="checkbox"
          checked={openTasksOnly}
          on:change={(event) => updateOpenTasksOnly(event.currentTarget.checked)}
        />
        Open Tasks only
      </label>
    </div>
    {#if filteredBacklinks.length === 0}
      <p class="backlink-empty">No backlinks match this filter.</p>
    {/if}
    <div class="backlink-list">
      {#each filteredBacklinks as backlink}
        {@const backlinkCollapsed = collapsedBacklinkKeys.has(backlinkKeyFor(backlink))}
        <article class="backlink">
          <header>
            <div class="backlink-source-row">
              <button
                type="button"
                class="backlink-source"
                aria-expanded={!backlinkCollapsed}
                title={`${backlink.sourcePath}:${backlink.lineStart}`}
                on:click={() => toggleBacklink(backlink)}
              >
                <span>{backlinkCollapsed ? "▸" : "▾"}</span>
                <strong>{sourceLabel(backlink)}</strong>
              </button>
              <button
                type="button"
                class="backlink-edit-source"
                title={`Edit source at line ${backlink.lineStart}`}
                on:click={() => onOpenSourceInEditor(backlink)}
              >
                Edit
              </button>
            </div>
            {#if backlinkHeadings(backlink).length > 0}
              <div class="backlink-heading-context">{headingLabel(backlink)}</div>
            {/if}
          </header>
          {#if !backlinkCollapsed}
            <div class="backlink-content">
              <MarkdownView
                content={backlink.blockMarkdown}
                {pages}
                {taskStates}
                {taskStateColors}
                {folderColors}
                sourceLineNumbers={backlink.lineNumbers}
                onWikiLink={onWikiLink}
                onMissingWikiLink={onMissingWikiLink}
                onCheckboxToggle={(line, checked) =>
                  onCheckboxToggle(backlink.sourcePath, line, checked)}
                {onOpenWikiLink}
                onOpenSourceLineInEditor={(line) => onOpenSourceLineInEditor(backlink, line)}
                onOpenSourceLineInRightPane={(line) =>
                  onOpenSourceLineInRightPane(backlink, line)}
                {sourceLineMenuTargets}
                {enableTaskContextMenu}
                onTaskStatusChange={(line, currentStatus, nextStatus) =>
                  onTaskStatusChange(backlink.sourcePath, line, currentStatus, nextStatus)}
                onTaskPriorityChange={(line, currentPriority, nextPriority) =>
                  onTaskPriorityChange(backlink.sourcePath, line, currentPriority, nextPriority)}
              />
            </div>
          {/if}
        </article>
      {/each}
    </div>
  {/if}
</section>
