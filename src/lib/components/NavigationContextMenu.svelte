<script lang="ts">
  import ContextMenuShell from "./ContextMenuShell.svelte";
  import type { NavigationNode } from "../navigationTree";
  import { FOLDER_COLOR_OPTIONS } from "../folderColors";
  import type { FolderColors, PageSortMode, TaskColorName } from "../types";

  type NavigationContextMenuState = {
    x: number;
    y: number;
    node: NavigationNode;
  };

  export let contextMenu: NavigationContextMenuState | null = null;
  export let selectedCount = 0;
  export let isFavorite: (kind: "page" | "folder", path: string) => boolean;
  export let handleContextMenuAction: (action: string) => void | Promise<void>;
  export let onClose: () => void;
  export let folderSortFor: (path: string) => PageSortMode = () => "name-desc";
  export let folderColors: FolderColors = {};

</script>

{#if contextMenu}
  <ContextMenuShell x={contextMenu.x} y={contextMenu.y} {onClose}>
    {#if selectedCount > 1}
      <button type="button" role="menuitem" data-menu-key="m" on:click={() => handleContextMenuAction("batch-move")}>
        <span class="menu-mnemonic">M</span>ove selection to folder...
      </button>
      <button type="button" class="danger-action" role="menuitem" data-menu-key="d" on:click={() => handleContextMenuAction("batch-delete")}>
        <span class="menu-mnemonic">D</span>elete selection
      </button>
    {:else if contextMenu.node.kind === "folder"}
      {#if contextMenu.node.path}
        <button type="button" role="menuitem" data-menu-key="r" on:click={() => handleContextMenuAction("rename")}>
          <span class="menu-mnemonic">R</span>ename
        </button>
      {/if}
      <button type="button" role="menuitem" data-menu-key="p" on:click={() => handleContextMenuAction("new-page")}>
        New <span class="menu-mnemonic">p</span>age{contextMenu.node.path ? " here..." : "..."}
      </button>
      <button type="button" role="menuitem" data-menu-key="n" on:click={() => handleContextMenuAction("new-folder")}>
        <span class="menu-mnemonic">N</span>ew folder{contextMenu.node.path ? " here..." : "..."}
      </button>
      {#if !contextMenu.node.path}
        <div class="context-menu-separator"></div>
        <button type="button" role="menuitem" data-menu-key="f" on:click={() => handleContextMenuAction("refresh-pages")}>
          Re<span class="menu-mnemonic">f</span>resh pages
        </button>
        <button type="button" role="menuitem" data-menu-key="c" on:click={() => handleContextMenuAction("collapse-all")}>
          <span class="menu-mnemonic">C</span>ollapse all
        </button>
        <button type="button" role="menuitem" data-menu-key="x" on:click={() => handleContextMenuAction("expand-all")}>
          E<span class="menu-mnemonic">x</span>pand all
        </button>
      {/if}
      {#if contextMenu.node.path}
        <div class="context-menu-separator"></div>
        <button type="button" role="menuitem" data-menu-key="w" on:click={() => handleContextMenuAction("move-root")}>
          Move to <span class="menu-mnemonic">w</span>orkspace root
        </button>
        <button type="button" role="menuitem" data-menu-key="f" on:click={() => handleContextMenuAction("move-folder")}>
          Move to <span class="menu-mnemonic">f</span>older...
        </button>
        <div class="context-menu-separator"></div>
        <button type="button" role="menuitem" data-menu-key="u" on:click={() => handleContextMenuAction("move-up")}>
          Move <span class="menu-mnemonic">u</span>p
        </button>
        <button type="button" role="menuitem" data-menu-key="d" on:click={() => handleContextMenuAction("move-down")}>
          Move <span class="menu-mnemonic">d</span>own
        </button>
        <div class="context-menu-flyout" role="menuitem" tabindex="0">
          <button type="button" class="context-menu-flyout-trigger" data-menu-key="s">
            <span><span class="menu-mnemonic">S</span>ort files by</span>
            <span aria-hidden="true">›</span>
          </button>
          <div class="context-menu-flyout-panel" role="menu">
            <button
              type="button"
              role="menuitem"
              data-menu-key="a"
              class:active-menu-item={folderSortFor(contextMenu.node.path) === "name-asc"}
              on:click={() => handleContextMenuAction("sort:name-asc")}
            >
              Name <span class="menu-mnemonic">a</span>scending
            </button>
            <button
              type="button"
              role="menuitem"
              data-menu-key="d"
              class:active-menu-item={folderSortFor(contextMenu.node.path) === "name-desc"}
              on:click={() => handleContextMenuAction("sort:name-desc")}
            >
              Name <span class="menu-mnemonic">d</span>escending
            </button>
          </div>
        </div>
        <div class="context-menu-flyout" role="menuitem" tabindex="0">
          <button type="button" class="context-menu-flyout-trigger" data-menu-key="c">
            <span><span class="menu-mnemonic">C</span>hoose color</span>
            <span aria-hidden="true">›</span>
          </button>
          <div class="context-menu-flyout-panel" role="menu">
            <button
              type="button"
              role="menuitem"
              data-menu-key="0"
              class:active-menu-item={!folderColors[contextMenu.node.path]}
              on:click={() => handleContextMenuAction("color:none")}
            >
              <span class="menu-mnemonic">0</span> No color
            </button>
            {#each FOLDER_COLOR_OPTIONS as color, index}
              <button
                type="button"
                role="menuitem"
                data-menu-key={String(index + 1)}
                class:active-menu-item={folderColors[contextMenu.node.path] === color}
                on:click={() => handleContextMenuAction(`color:${color}`)}
              >
                <span class="menu-mnemonic">{index + 1}</span>
                <span class={`color-swatch color-swatch-${color}`}></span>
                {color}
              </button>
            {/each}
          </div>
        </div>
        <div class="context-menu-separator"></div>
        <button type="button" class="danger-action" role="menuitem" data-menu-key="l" on:click={() => handleContextMenuAction("delete")}>
          De<span class="menu-mnemonic">l</span>ete folder...
        </button>
      {/if}
    {:else}
      <button type="button" role="menuitem" data-menu-key="e" on:click={() => handleContextMenuAction("open-editor")}>
        Open in <span class="menu-mnemonic">e</span>ditor
      </button>
      <button type="button" role="menuitem" data-menu-key="r" on:click={() => handleContextMenuAction("open-right")}>
        Open in <span class="menu-mnemonic">r</span>ight pane
      </button>
      <button type="button" role="menuitem" data-menu-key="w" on:click={() => handleContextMenuAction("move-root")}>
        Move to <span class="menu-mnemonic">w</span>orkspace root
      </button>
      <button type="button" role="menuitem" data-menu-key="f" on:click={() => handleContextMenuAction("move-folder")}>
        Move to <span class="menu-mnemonic">f</span>older...
      </button>
      <button type="button" role="menuitem" data-menu-key="n" on:click={() => handleContextMenuAction("rename")}>
        Re<span class="menu-mnemonic">n</span>ame
      </button>
      <button type="button" role="menuitem" data-menu-key="u" on:click={() => handleContextMenuAction("move-up")}>
        Move <span class="menu-mnemonic">u</span>p
      </button>
      <button type="button" role="menuitem" data-menu-key="d" on:click={() => handleContextMenuAction("move-down")}>
        Move <span class="menu-mnemonic">d</span>own
      </button>
      <button type="button" role="menuitem" data-menu-key="a" on:click={() => handleContextMenuAction("toggle-favorite")}>
        {#if isFavorite("page", contextMenu.node.path)}
          Remove f<span class="menu-mnemonic">a</span>vorite
        {:else}
          <span class="menu-mnemonic">A</span>dd favorite
        {/if}
      </button>
      <button type="button" class="danger-action" role="menuitem" data-menu-key="l" on:click={() => handleContextMenuAction("delete")}>
        De<span class="menu-mnemonic">l</span>ete
      </button>
    {/if}
  </ContextMenuShell>
{/if}
