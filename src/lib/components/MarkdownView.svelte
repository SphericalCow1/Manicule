<script lang="ts">
  import { onMount, tick } from "svelte";
  import MarkdownIt from "markdown-it";
  import ContextMenuShell from "./ContextMenuShell.svelte";
  import { renderCheckboxItems } from "../markdownRendering";
  import { taskColorStyle } from "../taskColors";
  import {
    DEFAULT_TASK_STATES,
    priorityCookieMatch,
    taskKeywordMatch,
  } from "../taskKeywords";
  import { applyWikiLinkColorStyles, renderWikiLinks } from "../wikiLinks";
  import type { FolderColors, PageSummary, TaskStateColors } from "../types";

  export let content = "";
  export let pages: PageSummary[] = [];
  export let taskStates: string[] = DEFAULT_TASK_STATES;
  export let taskStateColors: TaskStateColors = {};
  export let folderColors: FolderColors = {};
  export let sourceLineNumbers: number[] = [];
  export let highlightedLine: number | null = null;
  export let highlightToken = 0;
  export let onWikiLink: (target: string) => void = () => {};
  export let onMissingWikiLink: (target: string) => void = () => {};
  export let onCheckboxToggle: (line: number, checked: boolean) => void = () => {};
  export let onOpenWikiLinkInEditor: (target: string) => void = () => {};
  export let onOpenWikiLinkInRightPane: (target: string) => void = () => {};
  export let onTaskStatusChange: (
    line: number,
    currentStatus: string,
    nextStatus: string,
  ) => void = () => {};
  export let onTaskPriorityChange: (
    line: number,
    currentPriority: string | null,
    nextPriority: string | null,
  ) => void = () => {};
  export let enableTaskContextMenu = false;

  let linkContextMenu: {
    x: number;
    y: number;
    label: string;
    target: string;
    exists: boolean;
  } | null = null;
  let taskContextMenu: {
    x: number;
    y: number;
    line: number;
    localLine: number;
    status: string;
  } | null = null;
  let markdownElement: HTMLElement | null = null;
  let lastHighlightKey = "";
  let lastObservedWidth: number | null = null;
  const taskPriorityOptions = ["A", "B", "C"];

  const markdown = new MarkdownIt({
    breaks: false,
    html: false,
    linkify: true,
  });

  $: taskRender = markTaskKeywordsForRendering(content, taskStates, sourceLineNumbers);
  $: rendered = renderTaskPriorityMarkers(
    renderTaskKeywordMarkers(
      renderCheckboxItems(
        applyWikiLinkColorStyles(
          markdown.render(renderWikiLinks(taskRender.markdown, pages)),
          pages,
          folderColors,
        ),
        content,
        sourceLineNumbers,
      ),
      taskRender.taskTokens,
    ),
    taskRender.priorityTokens,
  );
  $: highlightKey = highlightedLine ? `${highlightToken}:${highlightedLine}:${rendered}` : "";
  $: if (markdownElement && highlightKey !== lastHighlightKey) {
    lastHighlightKey = highlightKey;
    if (highlightedLine) {
      void scrollHighlightedLineIntoView();
    } else {
      clearHighlightedLineOverlay();
    }
  }

  onMount(() => {
    if (!markdownElement || typeof ResizeObserver === "undefined") {
      return;
    }

    const resizeObserver = new ResizeObserver(([entry]) => {
      if (!entry) {
        return;
      }

      const nextWidth = entry.contentRect.width;
      if (lastObservedWidth === null) {
        lastObservedWidth = nextWidth;
        return;
      }

      if (Math.abs(nextWidth - lastObservedWidth) > 0.5) {
        lastObservedWidth = nextWidth;
        clearHighlightedLineOverlay();
      }
    });

    resizeObserver.observe(markdownElement);

    return () => resizeObserver.disconnect();
  });

  function renderTaskKeywordMarkers(html: string, tokens: TaskKeywordToken[]) {
    let renderedHtml = html;

    for (const token of tokens) {
      renderedHtml = renderedHtml.replaceAll(
        token.marker,
        `<strong class="task-keyword task-${safeTaskClass(token.status)}" style="${taskColorStyle(token.status, taskStateColors)}" data-task-line="${token.line}" data-task-local-line="${token.localLine}" data-task-status="${token.status}">${token.status}</strong>`,
      );
    }

    return renderedHtml;
  }

  function renderTaskPriorityMarkers(html: string, tokens: TaskPriorityToken[]) {
    let renderedHtml = html;

    for (const token of tokens) {
      renderedHtml = renderedHtml.replaceAll(
        token.marker,
        `<span class="task-priority" data-task-line="${token.line}" data-task-local-line="${token.localLine}" data-task-status="${token.status}">#${token.priority}</span>`,
      );
    }

    return renderedHtml;
  }

  function renderTaskMarkers(
    line: string,
    index: number,
    states: string[],
    lineNumbers: number[],
    taskTokens: TaskKeywordToken[],
    priorityTokens: TaskPriorityToken[],
  ) {
    const taskMatch = taskKeywordMatch(line, 0, states);
    if (!taskMatch) {
      return line;
    }

    const replacements = [];
    const localLine = index + 1;
    const sourceLine = lineNumbers[index] ?? localLine;
    const taskMarker = `SEMTAGS_TASK_${taskTokens.length}_TOKEN`;
    taskTokens.push({
      line: sourceLine,
      localLine,
      status: taskMatch.status,
      marker: taskMarker,
    });
    replacements.push({ from: taskMatch.from, to: taskMatch.to, marker: taskMarker });

    const priorityMatch = priorityCookieMatch(line, 0, states);
    if (priorityMatch) {
      const priorityMarker = `SEMTAGS_PRIORITY_${priorityTokens.length}_TOKEN`;
      priorityTokens.push({
        line: sourceLine,
        localLine,
        status: taskMatch.status,
        priority: priorityMatch.priority,
        marker: priorityMarker,
      });
      replacements.push({
        from: priorityMatch.from,
        to: priorityMatch.to,
        marker: priorityMarker,
      });
    }

    return replacements
      .sort((left, right) => right.from - left.from)
      .reduce(
        (markedLine, replacement) =>
          `${markedLine.slice(0, replacement.from)}${replacement.marker}${markedLine.slice(
            replacement.to,
          )}`,
        line,
      );
  }

  function handleClick(event: MouseEvent) {
    linkContextMenu = null;
    taskContextMenu = null;

    const checkbox = (event.target as HTMLElement).closest<HTMLInputElement>(
      "input.task-list-checkbox",
    );
    if (checkbox) {
      event.preventDefault();
      const line = Number(checkbox.dataset.line);
      if (Number.isInteger(line) && line > 0) {
        onCheckboxToggle(line, !checkbox.checked);
      }
      return;
    }

    const link = (event.target as HTMLElement).closest("a");
    const href = link?.getAttribute("href");

    if (href?.startsWith("semtags-missing:")) {
      event.preventDefault();
      onMissingWikiLink(decodeURIComponent(href.slice("semtags-missing:".length)));
      return;
    }

    if (!href?.startsWith("semtags:")) {
      return;
    }

    event.preventDefault();
    onWikiLink(decodeURIComponent(href.slice("semtags:".length)));
  }

  function handleContextMenu(event: MouseEvent) {
    if (enableTaskContextMenu) {
      const taskKeyword = (event.target as HTMLElement).closest<HTMLElement>(
        ".task-keyword, .task-priority",
      );
      const line = Number(taskKeyword?.dataset.taskLine);
      const status = taskKeyword?.dataset.taskStatus;

      if (taskKeyword && Number.isInteger(line) && line > 0 && status) {
        event.preventDefault();
        event.stopPropagation();
        linkContextMenu = null;
        taskContextMenu = {
          x: event.clientX,
          y: event.clientY,
          line,
          localLine: Number(taskKeyword.dataset.taskLocalLine) || line,
          status,
        };
        return;
      }
    }

    const link = (event.target as HTMLElement).closest("a");
    const href = link?.getAttribute("href");

    if (!href?.startsWith("semtags:") && !href?.startsWith("semtags-missing:")) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    taskContextMenu = null;
    const missing = href.startsWith("semtags-missing:");
    const prefix = missing ? "semtags-missing:" : "semtags:";
    linkContextMenu = {
      x: event.clientX,
      y: event.clientY,
      label: link?.textContent?.trim() || decodeURIComponent(href.slice(prefix.length)),
      target: decodeURIComponent(href.slice(prefix.length)),
      exists: !missing,
    };
  }

  function openContextLink(targetPane: "editor" | "right") {
    if (!linkContextMenu?.exists) {
      return;
    }

    const target = linkContextMenu.target;
    linkContextMenu = null;

    if (targetPane === "editor") {
      onOpenWikiLinkInEditor(target);
    } else {
      onOpenWikiLinkInRightPane(target);
    }
  }

  function createContextLinkPage() {
    if (!linkContextMenu || linkContextMenu.exists) {
      return;
    }

    const target = linkContextMenu.target;
    linkContextMenu = null;
    onMissingWikiLink(target);
  }

  function closeContextMenu() {
    linkContextMenu = null;
    taskContextMenu = null;
  }

  function handleWindowKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      closeContextMenu();
    }
  }

  function setTaskStatus(nextStatus: string) {
    if (!taskContextMenu) {
      return;
    }

    const { line, status } = taskContextMenu;
    taskContextMenu = null;
    onTaskStatusChange(line, status, nextStatus);
  }

  function setTaskPriority(priority: string | null) {
    if (!taskContextMenu) {
      return;
    }

    const { line } = taskContextMenu;
    const previousPriority = currentTaskPriority();
    taskContextMenu = null;
    onTaskPriorityChange(line, previousPriority, priority);
  }

  function currentTaskPriority() {
    if (!taskContextMenu) {
      return null;
    }

    const lineText = content.split("\n")[taskContextMenu.localLine - 1] ?? "";
    return priorityCookieMatch(lineText, 0, taskStates)?.priority ?? null;
  }

  function safeTaskClass(status: string) {
    return status.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  }

  async function scrollHighlightedLineIntoView() {
    await tick();
    if (!markdownElement || !highlightedLine) {
      return;
    }

    clearHighlightedLineOverlay();

    const marker = markdownElement.querySelector<HTMLElement>(
      `[data-task-line="${highlightedLine}"]`,
    );
    if (!marker) {
      return;
    }

    marker.scrollIntoView({ block: "center", behavior: "smooth" });
    await nextAnimationFrame();

    const markdownRect = markdownElement.getBoundingClientRect();
    const markerRect = marker.getClientRects()[0] ?? marker.getBoundingClientRect();
    const taskLineRect = getTaskLineRect(marker);
    const highlightOffset = 2;
    const highlightTop = markerRect.top - highlightOffset;
    const highlightBottom = Math.max(taskLineRect.bottom, markerRect.bottom);
    const overlay = document.createElement("div");
    overlay.className = "markdown-line-highlight-overlay";
    overlay.style.top = `${highlightTop - markdownRect.top + markdownElement.scrollTop}px`;
    overlay.style.height = `${highlightBottom - highlightTop + highlightOffset}px`;
    markdownElement.append(overlay);
  }

  function nextAnimationFrame() {
    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }

  function getTaskLineRect(marker: HTMLElement) {
    const paragraph = marker.closest<HTMLElement>("p");
    if (paragraph && markdownElement?.contains(paragraph)) {
      return paragraph.getBoundingClientRect();
    }

    const listItem = marker.closest<HTMLElement>("li");
    if (listItem && markdownElement?.contains(listItem)) {
      const nestedList = Array.from(listItem.children).find(
        (child) => child.tagName === "UL" || child.tagName === "OL",
      );
      const range = document.createRange();
      range.selectNodeContents(listItem);
      if (nestedList) {
        range.setEndBefore(nestedList);
      }
      const rect = range.getBoundingClientRect();
      range.detach();
      if (rect.height > 0) {
        return rect;
      }
    }

    return marker.getBoundingClientRect();
  }

  function clearHighlightedLineOverlay() {
    markdownElement
      ?.querySelectorAll(".markdown-line-highlight-overlay")
      .forEach((element) => element.remove());
  }

  function markTaskKeywordsForRendering(
    markdownContent: string,
    states: string[],
    lineNumbers: number[],
  ) {
    const taskTokens: TaskKeywordToken[] = [];
    const priorityTokens: TaskPriorityToken[] = [];
    const markedMarkdown = markdownContent
      .split("\n")
      .map((line, index) =>
        renderTaskMarkers(line, index, states, lineNumbers, taskTokens, priorityTokens),
      )
      .join("\n");

    return {
      markdown: markedMarkdown,
      taskTokens,
      priorityTokens,
    };
  }

  type TaskKeywordToken = {
    line: number;
    localLine: number;
    status: string;
    marker: string;
  };

  type TaskPriorityToken = TaskKeywordToken & {
    priority: string;
  };
</script>

<svelte:window on:click={closeContextMenu} on:keydown={handleWindowKeydown} />

<div
  bind:this={markdownElement}
  class="markdown-view"
  role="presentation"
  on:click={handleClick}
  on:contextmenu={handleContextMenu}
  on:keydown={() => {}}
>
  {@html rendered}
</div>

{#if linkContextMenu}
  <ContextMenuShell
    className="editor-link-menu"
    x={linkContextMenu.x}
    y={linkContextMenu.y}
    onClose={closeContextMenu}
  >
    <div class="editor-link-menu-title" title={linkContextMenu.target}>
      {linkContextMenu.label}
    </div>
    <button
      type="button"
      role="menuitem"
      data-menu-key="e"
      disabled={!linkContextMenu.exists}
      on:click={() => openContextLink("editor")}
    >
      Open in <span class="menu-mnemonic">e</span>ditor
    </button>
    <button
      type="button"
      role="menuitem"
      data-menu-key="r"
      disabled={!linkContextMenu.exists}
      on:click={() => openContextLink("right")}
    >
      Open in <span class="menu-mnemonic">r</span>ight pane
    </button>
    {#if !linkContextMenu.exists}
      <button type="button" role="menuitem" data-menu-key="c" on:click={createContextLinkPage}>
        <span class="menu-mnemonic">C</span>reate page
      </button>
    {/if}
  </ContextMenuShell>
{/if}

{#if taskContextMenu}
  {@const currentPriority = currentTaskPriority()}
  <ContextMenuShell
    className="editor-link-menu"
    x={taskContextMenu.x}
    y={taskContextMenu.y}
    onClose={closeContextMenu}
  >
    <details class="editor-submenu" open>
      <summary>Task</summary>
      <div class="editor-menu-flyout" role="menuitem" tabindex="0">
        <button type="button" class="editor-menu-flyout-trigger" data-menu-key="s">
          <span><span class="menu-mnemonic">S</span>tatus</span>
          <span aria-hidden="true">›</span>
        </button>
        <div class="editor-menu-flyout-panel" role="menu">
          {#each taskStates as state, index}
            <button
              type="button"
              role="menuitem"
              data-menu-key={String(index + 1)}
              disabled={state === taskContextMenu.status}
              on:click={() => setTaskStatus(state)}
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
            disabled={currentPriority === null}
            on:click={() => setTaskPriority(null)}
          >
            <span class="menu-mnemonic">0</span> No priority
          </button>
          {#each taskPriorityOptions as priority}
            <button
              type="button"
              role="menuitem"
              data-menu-key={priority}
              disabled={currentPriority === priority}
              on:click={() => setTaskPriority(priority)}
            >
              #<span class="menu-mnemonic">{priority}</span>
            </button>
          {/each}
        </div>
      </div>
    </details>
  </ContextMenuShell>
{/if}
