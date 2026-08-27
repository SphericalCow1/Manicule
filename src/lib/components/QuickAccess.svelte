<script lang="ts">
  import { keepContextMenuInViewport } from "../contextMenuPosition";
  import { clickMenuMnemonic } from "../menuMnemonics";

  type FavoriteItem = {
    kind: "page" | "folder";
    path: string;
  };

  type QuickContextMenuState = {
    x: number;
    y: number;
    source: "favorite" | "recent";
    favorite?: FavoriteItem;
    path: string;
  };

  export let favorites: FavoriteItem[] = [];
  export let recentPages: string[] = [];
  export let favoriteExists: (favorite: FavoriteItem) => boolean;
  export let favoriteLabel: (favorite: FavoriteItem) => string;
  export let displayNameFromPath: (path: string) => string;
  export let openFavorite: (favorite: FavoriteItem) => void;
  export let openPageInEditor: (path: string) => void;
  export let openPageInRightPane: (path: string) => void;
  export let toggleFavorite: (kind: FavoriteItem["kind"], path: string) => void;
  export let removeRecentPage: (path: string) => void;
  export let folderGlyphStyle: (path: string) => string = () => "";

  let contextMenu: QuickContextMenuState | null = null;
  let menuElement: HTMLElement | null = null;

  function openFavoriteContextMenu(favorite: FavoriteItem, event: MouseEvent) {
    event.preventDefault();
    contextMenu = {
      x: event.clientX,
      y: event.clientY,
      source: "favorite",
      favorite,
      path: favorite.path,
    };
  }

  function openRecentContextMenu(path: string, event: MouseEvent) {
    event.preventDefault();
    contextMenu = {
      x: event.clientX,
      y: event.clientY,
      source: "recent",
      path,
    };
  }

  function openContextItemInEditor() {
    if (!contextMenu) {
      return;
    }

    openPageInEditor(contextMenu.path);
    contextMenu = null;
  }

  function openContextItemInRightPane() {
    if (!contextMenu) {
      return;
    }

    openPageInRightPane(contextMenu.path);
    contextMenu = null;
  }

  function removeContextItem() {
    if (!contextMenu) {
      return;
    }

    if (contextMenu.source === "favorite" && contextMenu.favorite) {
      toggleFavorite(contextMenu.favorite.kind, contextMenu.favorite.path);
    } else {
      removeRecentPage(contextMenu.path);
    }

    contextMenu = null;
  }

  function closeContextMenu() {
    contextMenu = null;
  }

  function handleWindowKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      closeContextMenu();
      return;
    }

    if (contextMenu) {
      clickMenuMnemonic(event, menuElement);
    }
  }
</script>

<svelte:window on:click={closeContextMenu} on:keydown={handleWindowKeydown} />

<section class="quick-access" aria-label="Quick access">
  <div class="quick-section">
    <h2>Favorites</h2>
    {#if favorites.length === 0}
      <p>No favorites</p>
    {:else}
      {#each favorites as favorite}
        <div
          class:missing-favorite={!favoriteExists(favorite)}
          class="quick-row"
          role="listitem"
          on:contextmenu={(event) => openFavoriteContextMenu(favorite, event)}
        >
          <button
            type="button"
            class="quick-item"
            class:folder-quick-item={favorite.kind === "folder"}
            title={favorite.path}
            on:click={() => openFavorite(favorite)}
          >
            {#if favorite.kind === "folder"}
              <span class="quick-icon folder-glyph" style={folderGlyphStyle(favorite.path)}></span>
            {/if}
            <span>{favoriteLabel(favorite)}</span>
          </button>
          {#if favorite.kind === "page"}
            <button
              type="button"
              class="icon-button"
              title="Open in right pane"
              aria-label="Open in right pane"
              disabled={!favoriteExists(favorite)}
              on:click={() => openPageInRightPane(favorite.path)}
            >
              R
            </button>
          {/if}
        </div>
      {/each}
    {/if}
  </div>

  <div class="quick-section">
    <h2>Recent</h2>
    {#if recentPages.length === 0}
      <p>No recent pages</p>
    {:else}
      {#each recentPages as path}
        <div
          class="quick-row"
          role="listitem"
          on:contextmenu={(event) => openRecentContextMenu(path, event)}
        >
          <button type="button" class="quick-item" title={path} on:click={() => openPageInEditor(path)}>
            <span>{displayNameFromPath(path)}</span>
          </button>
          <button
            type="button"
            class="icon-button"
            title="Open in right pane"
            aria-label="Open in right pane"
            on:click={() => openPageInRightPane(path)}
          >
            R
          </button>
        </div>
      {/each}
    {/if}
  </div>
</section>

{#if contextMenu}
  <div
    class="context-menu"
    use:keepContextMenuInViewport={{ x: contextMenu.x, y: contextMenu.y }}
    style:left={`${contextMenu.x}px`}
    style:top={`${contextMenu.y}px`}
    role="menu"
    tabindex="-1"
    bind:this={menuElement}
  >
    <button type="button" role="menuitem" data-menu-key="e" on:click={openContextItemInEditor}>
      Open in <span class="menu-mnemonic">e</span>ditor
    </button>
    <button type="button" role="menuitem" data-menu-key="r" on:click={openContextItemInRightPane}>
      Open in <span class="menu-mnemonic">r</span>ight pane
    </button>
    <div class="context-menu-separator"></div>
    <button type="button" role="menuitem" data-menu-key="f" on:click={removeContextItem}>
      Remove <span class="menu-mnemonic">f</span>rom {contextMenu.source === "favorite" ? "Favorites" : "Recents"}
    </button>
  </div>
{/if}
