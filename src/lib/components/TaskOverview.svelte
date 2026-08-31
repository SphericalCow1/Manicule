<script lang="ts">
  import { onDestroy } from "svelte";
  import MarkdownIt from "markdown-it";
  import ErrorDialog from "./ErrorDialog.svelte";
  import { keepContextMenuInViewport } from "../contextMenuPosition";
  import { clickMenuMnemonic } from "../menuMnemonics";
  import { taskColorStyle } from "../taskColors";
  import { linkOperations } from "../stores/linkOperations";
  import { mutationOperations } from "../stores/mutationOperations";
  import { taskStore } from "../stores/tasks";
  import { workspaceStore } from "../stores/workspace";
  import { applyWikiLinkColorStyles, compactPageLabel, renderWikiLinks } from "../wikiLinks";
  import type { TaskItem, TaskOverviewConfig, TaskOverviewGroupMode, TaskStatus } from "../types";

  type StatusFilter = "OPEN" | TaskStatus | "ALL";
  type PriorityFilter = "ALL" | "NONE" | string;

  let statusFilter: StatusFilter = "OPEN";
  let priorityFilter: PriorityFilter = "ALL";
  let textFilter = "";
  let groupMode: TaskOverviewGroupMode = "status";
  let updatingTaskKey: string | null = null;
  let localError: string | null = null;
  let loadedRoot: string | null = null;
  let lastSavedConfigJson = "";
  let saveConfigTimer: ReturnType<typeof setTimeout> | null = null;
  const editablePriorityOptions = ["A", "B", "C"];
  let taskContextMenu: {
    x: number;
    y: number;
    task: TaskItem;
  } | null = null;
  let menuElement: HTMLElement | null = null;
  const inlineMarkdown = new MarkdownIt({
    breaks: false,
    html: false,
    linkify: true,
  });

  function closeErrorDialog() {
    localError = null;
    taskStore.clearError();
  }

  $: doneState = $workspaceStore.taskStates[$workspaceStore.taskStates.length - 1] ?? "DONE";
  $: if ($workspaceStore.root !== loadedRoot) {
    applyTaskOverviewConfig($workspaceStore.taskOverview);
    loadedRoot = $workspaceStore.root;
    lastSavedConfigJson = JSON.stringify(currentTaskOverviewConfig());
  }
  $: availablePriorities = uniquePriorities($taskStore.tasks);
  $: filteredTasks = filterTasks(
    $taskStore.tasks,
    statusFilter,
    priorityFilter,
    textFilter,
    doneState,
  );
  $: groupedTasks = groupTasks(filteredTasks, groupMode);
  $: if ($workspaceStore.root && loadedRoot === $workspaceStore.root) {
    scheduleTaskOverviewConfigSave();
  }

  function filterTasks(
    tasks: TaskItem[],
    selectedStatus: StatusFilter,
    selectedPriority: PriorityFilter,
    query: string,
    closedStatus: TaskStatus,
  ) {
    const normalizedQuery = query.trim().toLowerCase();

    return tasks.filter((task) => {
      const statusMatches =
        selectedStatus === "ALL" ||
        (selectedStatus === "OPEN" && task.status !== closedStatus) ||
        task.status === selectedStatus;
      const priorityMatches =
        selectedPriority === "ALL" ||
        (selectedPriority === "NONE" && !task.priority) ||
        task.priority === selectedPriority;
      const textMatches =
        !normalizedQuery ||
        task.text.toLowerCase().includes(normalizedQuery) ||
        task.path.toLowerCase().includes(normalizedQuery);

      return statusMatches && priorityMatches && textMatches;
    });
  }

  function uniquePriorities(tasks: TaskItem[]) {
    return [...new Set(tasks.map((task) => task.priority).filter(Boolean) as string[])].sort(
      comparePriorityValues,
    );
  }

  function groupTasks(tasks: TaskItem[], mode: TaskOverviewGroupMode) {
    const groups = new Map<string, TaskItem[]>();

    for (const task of tasks) {
      for (const key of groupKeys(task, mode)) {
        groups.set(key, [...(groups.get(key) ?? []), task]);
      }
    }

    return [...groups.entries()]
      .map(([label, items]) => ({
        label,
        items: [...items].sort(compareTasks),
      }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }

  function groupKeys(task: TaskItem, mode: TaskOverviewGroupMode) {
    if (mode === "status") {
      return [task.status];
    }

    if (mode === "folder") {
      return [task.path.includes("/") ? task.path.split("/").slice(0, -1).join("/") : "/"];
    }

    if (mode === "priority") {
      return [task.priority ? `#${task.priority}` : "No priority"];
    }

    if (mode === "linked-page") {
      if (task.linkedPages.length === 0) {
        return ["No linked page"];
      }

      return [
        ...new Set(
          task.linkedPages.map((link) =>
            link.exists && link.resolvedPath
              ? compactPageLabel(link.resolvedPath, $workspaceStore.pages)
              : `Missing: ${link.label || link.target}`,
          ),
        ),
      ];
    }

    return [task.title];
  }

  function compareTasks(left: TaskItem, right: TaskItem) {
    const priorityCompare = comparePriorityValues(left.priority, right.priority);
    if (priorityCompare !== 0) {
      return priorityCompare;
    }

    const pathCompare = right.path.localeCompare(left.path);
    return pathCompare || left.line - right.line;
  }

  function comparePriorityValues(left: string | null, right: string | null) {
    if (left && !right) {
      return -1;
    }

    if (!left && right) {
      return 1;
    }

    if (!left || !right) {
      return 0;
    }

    return left.localeCompare(right, undefined, { numeric: true });
  }

  function taskKey(task: TaskItem) {
    return `${task.path}:${task.line}`;
  }

  function taskDisplayText(task: TaskItem) {
    let text = task.text.trimStart();

    for (const marker of ["[ ] ", "[x] ", "[X] "]) {
      if (text.startsWith(marker)) {
        text = text.slice(marker.length).trimStart();
        break;
      }
    }

    if (text.startsWith(task.status)) {
      const remaining = text.slice(task.status.length);
      if (!remaining) {
        return "";
      }
      if (/^\s/.test(remaining) || remaining.startsWith("[#")) {
        text = remaining.trimStart();
      }
    }

    if (task.priority && text.startsWith(`[#${task.priority}]`)) {
      text = text.slice(task.priority.length + 3).trimStart();
    }

    return text;
  }

  function taskHeadingContext(task: TaskItem) {
    return task.sourceHeadings.join(" / ");
  }

  function taskParentContext(task: TaskItem) {
    return task.parentBlocks
      .map((block) => taskDisplayText({ ...task, text: block, priority: null }))
      .filter(Boolean)
      .join(" / ");
  }

  function renderTaskText(task: TaskItem) {
    return applyWikiLinkColorStyles(
      inlineMarkdown.renderInline(renderWikiLinks(taskDisplayText(task), $workspaceStore.pages)),
      $workspaceStore.pages,
      $workspaceStore.folderColors,
    );
  }

  function handleTaskMainClick(task: TaskItem, event: MouseEvent) {
    const link = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>("a");
    const href = link?.getAttribute("href");

    if (href?.startsWith("semtags:")) {
      event.preventDefault();
      event.stopPropagation();
      void linkOperations.open(decodeURIComponent(href.slice("semtags:".length)), "right");
      return;
    }

    if (href?.startsWith("semtags-missing:")) {
      event.preventDefault();
      event.stopPropagation();
      localError = `Linked page does not exist: ${decodeURIComponent(
        href.slice("semtags-missing:".length),
      )}`;
      return;
    }

    openTask(task);
  }

  function handleTaskMainKeydown(task: TaskItem, event: KeyboardEvent) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    openTask(task);
  }

  function handleTaskChipKeydown(task: TaskItem, event: KeyboardEvent) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    openTaskContextMenu(task, event);
  }

  async function changeTaskStatus(task: TaskItem, newStatus: string) {
    if (!newStatus || newStatus === task.status) {
      return;
    }

    taskContextMenu = null;
    localError = null;
    updatingTaskKey = taskKey(task);
    const result = await mutationOperations.setTaskStatus(
      task.path,
      task.line,
      task.status,
      newStatus,
    );
    localError = result.error;
    updatingTaskKey = null;
  }

  async function changeTaskPriority(task: TaskItem, nextPriority: string | null) {
    if (nextPriority === task.priority) {
      return;
    }

    taskContextMenu = null;
    localError = null;
    updatingTaskKey = taskKey(task);
    const result = await mutationOperations.setTaskPriority(
      task.path,
      task.line,
      task.priority,
      nextPriority,
    );
    localError = result.error;
    updatingTaskKey = null;
  }

  function openTaskContextMenu(task: TaskItem, event: MouseEvent | KeyboardEvent) {
    event.preventDefault();
    event.stopPropagation();
    const fallbackRect =
      event.currentTarget instanceof HTMLElement
        ? event.currentTarget.getBoundingClientRect()
        : null;
    taskContextMenu = {
      x: event instanceof MouseEvent ? event.clientX : (fallbackRect?.left ?? 0),
      y: event instanceof MouseEvent ? event.clientY : (fallbackRect?.bottom ?? 0),
      task,
    };
  }

  function closeTaskContextMenu() {
    taskContextMenu = null;
  }

  function handleWindowKeydown(event: KeyboardEvent) {
    if (taskContextMenu && clickMenuMnemonic(event, menuElement)) {
      return;
    }

    if (event.key === "Escape") {
      closeTaskContextMenu();
    }
  }

  function editTask(task: TaskItem) {
    void linkOperations.open(task.path, "editor", { line: task.line });
  }

  function openTask(task: TaskItem) {
    void linkOperations.open(task.path, "right", { line: task.line });
  }

  function editTaskFromButton(task: TaskItem, event: MouseEvent) {
    event.stopPropagation();
    editTask(task);
  }

  function refreshTasks() {
    void taskStore.refresh();
  }

  function applyTaskOverviewConfig(config: TaskOverviewConfig) {
    statusFilter = config.statusFilter || "OPEN";
    priorityFilter = config.priorityFilter || "ALL";
    textFilter = config.textFilter || "";
    groupMode = isTaskOverviewGroupMode(config.groupMode) ? config.groupMode : "status";
  }

  function currentTaskOverviewConfig(): TaskOverviewConfig {
    return {
      statusFilter,
      priorityFilter,
      textFilter,
      groupMode,
    };
  }

  function scheduleTaskOverviewConfigSave() {
    const config = currentTaskOverviewConfig();
    const serialized = JSON.stringify(config);

    if (serialized === lastSavedConfigJson) {
      return;
    }

    if (saveConfigTimer) {
      clearTimeout(saveConfigTimer);
    }

    saveConfigTimer = setTimeout(() => {
      saveConfigTimer = null;
      persistTaskOverviewConfig(config, serialized);
    }, 400);
  }

  function persistTaskOverviewConfig(config: TaskOverviewConfig, serialized = JSON.stringify(config)) {
    lastSavedConfigJson = serialized;
    void workspaceStore.saveTaskOverviewConfig(config).then((saved) => {
      if (saved) {
        lastSavedConfigJson = JSON.stringify(saved);
      }
    });
  }

  function flushTaskOverviewConfigSave() {
    if (saveConfigTimer) {
      clearTimeout(saveConfigTimer);
      saveConfigTimer = null;
    }

    if (!$workspaceStore.root || loadedRoot !== $workspaceStore.root) {
      return;
    }

    const config = currentTaskOverviewConfig();
    const serialized = JSON.stringify(config);
    if (serialized !== lastSavedConfigJson) {
      persistTaskOverviewConfig(config, serialized);
    }
  }

  function isTaskOverviewGroupMode(value: string): value is TaskOverviewGroupMode {
    return ["status", "priority", "source", "folder", "linked-page"].includes(value);
  }

  onDestroy(() => {
    flushTaskOverviewConfigSave();
  });
</script>

<svelte:window
  on:click={closeTaskContextMenu}
  on:keydown={handleWindowKeydown}
/>

<section class="task-overview" aria-label="Task overview">
  <header class="task-overview-header">
    <div>
      <h2>Tasks</h2>
      <small>{filteredTasks.length} of {$taskStore.tasks.length}</small>
    </div>
    <button type="button" on:click={refreshTasks} disabled={$taskStore.loading}>
      {$taskStore.loading ? "Refreshing" : "Refresh"}
    </button>
  </header>

  <div class="task-overview-toolbar">
    <select bind:value={statusFilter} aria-label="Filter tasks by status">
      <option value="OPEN">Open</option>
      {#each $workspaceStore.taskStates as state}
        <option value={state}>{state}</option>
      {/each}
      <option value="ALL">All</option>
    </select>
    <input
      type="search"
      bind:value={textFilter}
      placeholder="Search tasks"
      aria-label="Search tasks"
    />
    <select bind:value={priorityFilter} aria-label="Filter tasks by priority">
      <option value="ALL">All priorities</option>
      {#each availablePriorities as priority}
        <option value={priority}>#{priority}</option>
      {/each}
      <option value="NONE">No priority</option>
    </select>
    <select bind:value={groupMode} aria-label="Group tasks">
      <option value="status">Group by status</option>
      <option value="priority">Group by priority</option>
      <option value="source">Group by page</option>
      <option value="folder">Group by folder</option>
      <option value="linked-page">Group by linked page</option>
    </select>
  </div>

  <ErrorDialog
    title="Task Error"
    message={localError ?? $taskStore.error}
    onClose={closeErrorDialog}
  />

  {#if !$taskStore.loading && filteredTasks.length === 0}
    <div class="empty-state">No tasks match the current filter.</div>
  {:else}
    <div class="task-overview-list">
      {#each groupedTasks as group}
        <section class="task-overview-group">
          <header>
            <strong>{group.label}</strong>
            <small>{group.items.length}</small>
          </header>
          {#each group.items as task}
            <article
              class:updating={updatingTaskKey === taskKey(task)}
              class="task-overview-row"
              on:contextmenu={(event) => openTaskContextMenu(task, event)}
            >
              {#if task.sourceHeadings.length > 0 || task.parentBlocks.length > 0}
                <small class="task-overview-context">
                  {#if task.sourceHeadings.length > 0}
                    <span>{taskHeadingContext(task)}</span>
                  {/if}
                  {#if task.parentBlocks.length > 0}
                    <span>{taskParentContext(task)}</span>
                  {/if}
                </small>
              {/if}
              <div class="task-overview-line">
                <div
                  class="task-overview-main"
                  role="button"
                  tabindex="0"
                  title="Open task page in the right pane"
                  on:click={(event) => handleTaskMainClick(task, event)}
                  on:keydown={(event) => handleTaskMainKeydown(task, event)}
                  on:contextmenu={(event) => openTaskContextMenu(task, event)}
                >
                  <span
                    class={`task-overview-status task-keyword task-${task.status.toLowerCase()}`}
                    style={taskColorStyle(task.status, $workspaceStore.taskStateColors)}
                    title="Change task"
                    role="button"
                    tabindex="0"
                    on:click|stopPropagation={(event) => openTaskContextMenu(task, event)}
                    on:keydown={(event) => handleTaskChipKeydown(task, event)}
                    on:contextmenu={(event) => openTaskContextMenu(task, event)}
                  >
                    {task.status}
                  </span>
                  {#if task.priority}
                    <span
                      class="task-overview-priority task-priority"
                      title={`Priority #${task.priority}`}
                      role="button"
                      tabindex="0"
                      on:click|stopPropagation={(event) => openTaskContextMenu(task, event)}
                      on:keydown={(event) => handleTaskChipKeydown(task, event)}
                      on:contextmenu={(event) => openTaskContextMenu(task, event)}
                    >
                      #{task.priority}
                    </span>
                  {/if}
                  {@html renderTaskText(task)}
                </div>
              </div>
              <button
                type="button"
                class="task-open-button"
                on:click={(event) => editTaskFromButton(task, event)}
              >
                Edit
              </button>
            </article>
          {/each}
        </section>
      {/each}
    </div>
  {/if}
</section>

{#if taskContextMenu}
  {@const menu = taskContextMenu}
  <div
    class="editor-link-menu"
    use:keepContextMenuInViewport={{ x: menu.x, y: menu.y }}
    style:left={`${menu.x}px`}
    style:top={`${menu.y}px`}
    role="menu"
    tabindex="-1"
    bind:this={menuElement}
  >
    <details class="editor-submenu" open>
      <summary>Task</summary>
      <div class="editor-menu-flyout" role="menuitem" tabindex="0">
        <button type="button" class="editor-menu-flyout-trigger" data-menu-key="s">
          <span><span class="menu-mnemonic">S</span>tatus</span>
          <span aria-hidden="true">›</span>
        </button>
        <div class="editor-menu-flyout-panel" role="menu">
          {#each $workspaceStore.taskStates as state, index}
            <button
              type="button"
              role="menuitem"
              data-menu-key={String(index + 1)}
              disabled={state === menu.task.status}
              on:click={() => changeTaskStatus(menu.task, state)}
            >
              <span class="menu-mnemonic">{index + 1}</span> {state}
            </button>
          {/each}
        </div>
      </div>
      <div class="editor-menu-flyout" role="menuitem" tabindex="0">
        <button type="button" class="editor-menu-flyout-trigger" data-menu-key="p">
          <span><span class="menu-mnemonic">P</span>riority</span>
          <span aria-hidden="true">›</span>
        </button>
        <div class="editor-menu-flyout-panel" role="menu">
          <button
            type="button"
            role="menuitem"
            data-menu-key="0"
            disabled={menu.task.priority === null}
            on:click={() => changeTaskPriority(menu.task, null)}
          >
            <span class="menu-mnemonic">0</span> No priority
          </button>
          {#each editablePriorityOptions as priority}
            <button
              type="button"
              role="menuitem"
              data-menu-key={priority}
              disabled={menu.task.priority === priority}
              on:click={() => changeTaskPriority(menu.task, priority)}
            >
              #<span class="menu-mnemonic">{priority}</span>
            </button>
          {/each}
        </div>
      </div>
    </details>
  </div>
{/if}
