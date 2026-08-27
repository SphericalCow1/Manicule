<script lang="ts">
  import type { NavigationNode, VisibleNavigationRow } from "../navigationTree";

  export let rows: VisibleNavigationRow[] = [];
  export let searchActive = false;
  export let expandedFolders = new Set<string>();
  export let draggedPagePath: string | null = null;
  export let dragOverFolderPath: string | null = null;
  export let focusedTreePath: string | null = null;
  export let selectedPaths = new Set<string>();
  export let isActivePage: (path: string) => boolean;
  export let isEditorPage: (path: string) => boolean;
  export let isRightPanePage: (path: string) => boolean;
  export let isFavorite: (kind: "page" | "folder", path: string) => boolean;
  export let folderGlyphStyle: (path: string) => string = () => "";
  export let rowPadding: (depth: number) => string;
  export let toggleFavorite: (kind: "page" | "folder", path: string) => void;
  export let openPageInRightPane: (path: string) => void;
  export let handleNodeClick: (node: NavigationNode, event: MouseEvent) => void;
  export let handleDragStart: (path: string, event: DragEvent) => void;
  export let handleDragEnd: () => void;
  export let handleFolderDragOver: (path: string, event: DragEvent) => void;
  export let handleFolderDragLeave: () => void;
  export let handleFolderDrop: (path: string, event: DragEvent) => void;
  export let focusTreeNode: (path: string) => void;
  export let handleTreeKeydown: (node: NavigationNode, event: KeyboardEvent) => void;
  export let openContextMenu: (node: NavigationNode, event: MouseEvent) => void;

  const rootNode: NavigationNode = {
    kind: "folder",
    name: "",
    path: "",
    children: [],
  };
</script>

<nav class="page-list" aria-label="Markdown files">
  <div class="navigator-section-heading">
    <span>{searchActive ? "Search Results" : "Pages"}</span>
    <small>{rows.length}</small>
  </div>
  {#if !searchActive}
    <div
      class:drop-target={dragOverFolderPath === ""}
      class="root-drop-row"
      title="Drop a page here to move it to the workspace root"
      role="treeitem"
      aria-selected="false"
      tabindex="-1"
      on:dragover={(event) => handleFolderDragOver("", event)}
      on:dragleave={handleFolderDragLeave}
      on:drop={(event) => handleFolderDrop("", event)}
      on:contextmenu={(event) => openContextMenu(rootNode, event)}
    >
      <span class="folder-glyph"></span>
      <span>Workspace root</span>
    </div>
  {/if}
  {#each rows as row}
    {@const node = row.node}
    <div
      class:active-row={node.kind === "page" && isActivePage(node.path)}
      class:editor-row={node.kind === "page" && isEditorPage(node.path)}
      class:right-pane-row={node.kind === "page" && isRightPanePage(node.path)}
      class:dragging-row={node.kind === "page" && draggedPagePath === node.path}
      class:drop-target={node.kind === "folder" && dragOverFolderPath === node.path}
      class:focused-row={focusedTreePath === node.path}
      class:selected-row={selectedPaths.has(node.path)}
      class="page-row"
      role="treeitem"
      aria-selected={selectedPaths.has(node.path)}
      data-tree-path={node.path}
      tabindex={focusedTreePath === node.path ? 0 : -1}
      on:focus={() => focusTreeNode(node.path)}
      on:keydown={(event) => handleTreeKeydown(node, event)}
      on:contextmenu={(event) => openContextMenu(node, event)}
    >
      {#if node.kind === "folder"}
        <button
          type="button"
          class="tree-item folder-item"
          title={node.path}
          style:padding-left={rowPadding(row.depth)}
          on:click={(event) => handleNodeClick(node, event)}
          on:dragover={(event) => handleFolderDragOver(node.path, event)}
          on:dragleave={handleFolderDragLeave}
          on:drop={(event) => handleFolderDrop(node.path, event)}
        >
          <span class="tree-caret">{expandedFolders.has(node.path) ? "▾" : "▸"}</span>
          <span class="folder-glyph" style={folderGlyphStyle(node.path)}></span>
          <span>{node.name}</span>
        </button>
      {:else}
        <button
          type="button"
          class="tree-item page-item"
          title={node.path}
          style:padding-left={rowPadding(row.depth)}
          draggable={!searchActive}
          on:click={(event) => handleNodeClick(node, event)}
          on:dragstart={(event) => handleDragStart(node.path, event)}
          on:dragend={handleDragEnd}
        >
          <span>{node.name}</span>
        </button>
        <div class="page-actions">
          <button
            type="button"
            class:active-favorite={isFavorite("page", node.path)}
            class="icon-button row-action"
            title={isFavorite("page", node.path) ? "Remove favorite" : "Add page favorite"}
            aria-label={isFavorite("page", node.path) ? "Remove favorite" : "Add page favorite"}
            on:click={() => toggleFavorite("page", node.path)}
          >
            ★
          </button>
          <button
            type="button"
            class="icon-button row-action"
            title="Open in right pane"
            aria-label="Open in right pane"
            on:click={() => openPageInRightPane(node.path)}
          >
            R
          </button>
        </div>
      {/if}
    </div>
  {/each}
</nav>
