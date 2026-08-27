<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import { confirm as confirmDialog, open } from "@tauri-apps/plugin-dialog";
  import { journalPathForDateInput, journalPathForDay, type JournalDay } from "../journals";
  import { saveExpandedFolders, searchPages } from "../api";
  import { taskStore } from "../stores/tasks";
  import { workspaceStore } from "../stores/workspace";
  import { editorSessionStore } from "../stores/editorSession";
  import { mainViewStore } from "../stores/mainView";
  import { rightPaneStore } from "../stores/rightPane";
  import QuickAccess from "./QuickAccess.svelte";
  import ErrorDialog from "./ErrorDialog.svelte";
  import WorkspaceHeader from "./WorkspaceHeader.svelte";
  import NavigationTree from "./NavigationTree.svelte";
  import NavigationContextMenu from "./NavigationContextMenu.svelte";
  import ContextMenuShell from "./ContextMenuShell.svelte";
  import {
    ancestorFolderPaths,
    buildNavigationTree,
    collectFolderPaths,
    flattenVisibleTree,
    folderExists,
    pageNameFromPath,
    type NavigationNode,
  } from "../navigationTree";
  import {
    folderGlyphStyle as folderGlyphStyleForColor,
    inheritedFolderColor,
  } from "../folderColors";
  import type { PageSortMode, SearchResult, TaskColorName } from "../types";

  let workspacePath = "";
  let expandedFolders = new Set<string>();
  let lastRoot: string | null = null;
  let browseError: string | null = null;
  let popupError: string | null = null;
  let searchQuery = "";
  let contextMenu: ContextMenuState | null = null;
  let searchResultContextMenu: SearchResultContextMenuState | null = null;
  let folderPageDialog: FolderPageDialogState | null = null;
  let folderPageInput: HTMLInputElement | null = null;
  let folderPageError: string | null = null;
  let folderPageSubmitting = false;
  let folderDialog: FolderDialogState | null = null;
  let folderInput: HTMLInputElement | null = null;
  let folderError: string | null = null;
  let folderSubmitting = false;
  let renameDialog: RenameDialogState | null = null;
  let renameInput: HTMLInputElement | null = null;
  let renameError: string | null = null;
  let renameSubmitting = false;
  let moveDialog: MoveDialogState | null = null;
  let moveInput: HTMLInputElement | null = null;
  let moveError: string | null = null;
  let moveSubmitting = false;
  let batchMoveDialog: BatchMoveDialogState | null = null;
  let batchMoveInput: HTMLInputElement | null = null;
  let batchMoveError: string | null = null;
  let batchMoveSubmitting = false;
  let draggedPagePath: string | null = null;
  let dragOverFolderPath: string | null = null;
  let focusedTreePath: string | null = null;
  let selectedPaths = new Set<string>();
  let selectionAnchorPath: string | null = null;
  let searchResults: SearchResult[] = [];
  let searchLoading = false;
  let searchError: string | null = null;
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  let expandedFolderSaveTimer: ReturnType<typeof setTimeout> | null = null;
  let navigationLayoutSaveTimer: ReturnType<typeof setTimeout> | null = null;
  let searchSequence = 0;
  let fileTreeElement: HTMLElement | null = null;
  let quickAccessPanel: HTMLElement | null = null;
  let quickAccessHeight = 220;
  let resizingQuickAccess = false;
  let lastWorkspacePopupError: string | null = null;

  function showPopupError(message: string) {
    popupError = null;
    void tick().then(() => {
      popupError = message;
    });
  }

  function closePopupError() {
    popupError = null;
    lastWorkspacePopupError = null;
    if ($workspaceStore.error) {
      workspaceStore.clearError();
    }
  }

  type FavoriteItem = {
    kind: "page" | "folder";
    path: string;
  };

  type ContextMenuState = {
    x: number;
    y: number;
    node: NavigationNode;
  };

  type SearchResultContextMenuState = {
    x: number;
    y: number;
    result: SearchResult;
  };

  type FolderPageDialogState = {
    folderPath: string;
    value: string;
  };

  type FolderDialogState = {
    parentPath: string;
    value: string;
  };

  type RenameDialogState = {
    kind: "page" | "folder";
    path: string;
    currentName: string;
    value: string;
  };

  type MoveDialogState = {
    kind: "page" | "folder";
    path: string;
    itemName: string;
    currentFolder: string;
    targetFolder: string;
  };

  type BatchMoveDialogState = {
    paths: string[];
    targetFolder: string;
  };

  type FolderSuggestion = {
    path: string;
    label: string;
  };

  $: tree = buildNavigationTree(
    $workspaceStore.pages,
    $workspaceStore.folders,
    $workspaceStore.defaultPageSort,
    $workspaceStore.folderPageSort,
    $workspaceStore.manualPageOrder,
  );
  $: visibleRows = flattenVisibleTree(tree, expandedFolders);
  $: filteredRows = searchQuery.trim() ? filteredPageRows(searchQuery) : visibleRows;
  $: existingFolderPaths = collectFolderPaths(tree);
  $: moveFolderSuggestions = moveDialog
    ? folderSuggestions(moveDialog.targetFolder, existingFolderPaths, moveDialog.currentFolder)
    : [];
  $: batchMoveFolderSuggestions = batchMoveDialog
    ? folderSuggestions(batchMoveDialog.targetFolder, existingFolderPaths, "")
    : [];
  $: pagePaths = new Set($workspaceStore.pages.map((page) => page.path));
  $: favorites = $workspaceStore.pageFavorites
    .filter((path) => pagePaths.has(path))
    .map((path) => ({ kind: "page" as const, path }));
  $: recentExistingPages = $workspaceStore.recentPages.filter((path) => pagePaths.has(path));
  $: selectedNodes = selectedNavigationNodes(selectedPaths);
  $: contextSelectionCount = contextMenu ? selectedNodes.length : 0;

  $: if ($workspaceStore.root !== lastRoot) {
    if (expandedFolderSaveTimer) {
      clearTimeout(expandedFolderSaveTimer);
      expandedFolderSaveTimer = null;
    }
    lastRoot = $workspaceStore.root;
    searchQuery = "";
    searchResults = [];
    searchError = null;
    searchResultContextMenu = null;
    selectedPaths = new Set();
    selectionAnchorPath = null;
    if ($workspaceStore.root) {
      workspacePath = $workspaceStore.root;
      quickAccessHeight = normalizeQuickAccessHeight(
        $workspaceStore.navigationLayout.quickAccessHeight,
      );
      void taskStore.refresh();
    } else {
      workspacePath = "";
      taskStore.clear();
    }
    expandedFolders = initialExpandedFolders($workspaceStore.expandedFolders);
  }

  $: scheduleContentSearch(searchQuery, $workspaceStore.root);

  $: if ($workspaceStore.error && $workspaceStore.error !== lastWorkspacePopupError) {
    lastWorkspacePopupError = $workspaceStore.error;
    showPopupError($workspaceStore.error);
  }

  $: if (browseError) {
    showPopupError(browseError);
    browseError = null;
  }

  $: if (searchError) {
    showPopupError(searchError);
    searchError = null;
  }

  $: if (folderPageError) {
    showPopupError(folderPageError);
    folderPageError = null;
  }

  $: if (folderError) {
    showPopupError(folderError);
    folderError = null;
  }

  $: if (renameError) {
    showPopupError(renameError);
    renameError = null;
  }

  $: if (moveError) {
    showPopupError(moveError);
    moveError = null;
  }

  $: if (batchMoveError) {
    showPopupError(batchMoveError);
    batchMoveError = null;
  }

  $: if (contextMenu && !nodeExists(contextMenu.node)) {
    contextMenu = null;
  }

  $: if (
    searchResultContextMenu &&
    !searchResults.some(
      (result) =>
        result.path === searchResultContextMenu?.result.path &&
        result.line === searchResultContextMenu.result.line,
    )
  ) {
    searchResultContextMenu = null;
  }

  $: if (focusedTreePath && !filteredRows.some((row) => row.node.path === focusedTreePath)) {
    focusedTreePath = filteredRows[0]?.node.path ?? null;
  }

  $: pruneSelection();

  onMount(() => {
    window.addEventListener("semtags-new-page", handleNewPageEvent);
  });

  onDestroy(() => {
    if (navigationLayoutSaveTimer) {
      clearTimeout(navigationLayoutSaveTimer);
    }
    window.removeEventListener("semtags-new-page", handleNewPageEvent);
    window.removeEventListener("pointermove", resizeQuickAccess);
  });

  async function openWorkspace() {
    await workspaceStore.open(workspacePath);
  }

  async function chooseWorkspaceFolder() {
    browseError = null;

    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Open Semtags workspace",
      });

      if (typeof selected !== "string") {
        return;
      }

      workspacePath = selected;
      await workspaceStore.open(selected);
    } catch (error) {
      browseError = error instanceof Error ? error.message : String(error);
    }
  }

  function handleNewPageEvent(event: Event) {
    const detail = event instanceof CustomEvent ? event.detail : null;
    const folderPath = typeof detail?.folderPath === "string" ? detail.folderPath : "";
    void startCreatePageInFolder(folderPath);
  }

  async function confirmWarning(message: string) {
    try {
      return await confirmDialog(message, {
        title: "Semtags",
        kind: "warning",
      });
    } catch (error) {
      showPopupError(
        `Confirmation dialog could not be opened: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  async function deletePage(path: string, options: { confirmDelete?: boolean } = {}) {
    const shouldConfirm = options.confirmDelete ?? true;
    if (
      shouldConfirm &&
      !(await confirmWarning(`Delete ${path}? This removes the Markdown file from disk.`))
    ) {
      return false;
    }

    const wasEditorPage = $editorSessionStore.path === path;
    const wasRightPanePage = $rightPaneStore.path === path;
    browseError = null;
    editorSessionStore.clearIfPath(path);
    rightPaneStore.clearIfPath(path);

    const deletedPath = await workspaceStore.deletePage(path);
    if (!deletedPath) {
      if (wasEditorPage) {
        await editorSessionStore.open(path);
      }
      if (wasRightPanePage) {
        await rightPaneStore.open(path);
      }
      return false;
    }

    persistNavigation(
      $workspaceStore.pageFavorites.filter((favoritePath) => favoritePath !== deletedPath),
      $workspaceStore.recentPages.filter((recentPath) => recentPath !== deletedPath),
    );
    persistManualPageOrder(removePathFromManualOrder($workspaceStore.manualPageOrder, deletedPath));
    return true;
  }

  function toggleFolder(path: string) {
    const next = new Set(expandedFolders);

    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }

    setExpandedFolders(next);
  }

  function openFolder(path: string) {
    setExpandedFolders(new Set([...expandedFolders, ...ancestorFolderPaths(path), path]));
  }

  function closeFolder(path: string) {
    const next = new Set(expandedFolders);
    next.delete(path);
    setExpandedFolders(next);
  }

  function openFavorite(favorite: FavoriteItem) {
    if (favorite.kind === "page") {
      if (pagePaths.has(favorite.path)) {
        openPageInEditor(favorite.path);
      }
      return;
    }

    if (folderExists(tree, favorite.path)) {
      openFolder(favorite.path);
    }
  }

  function toggleFavorite(kind: FavoriteItem["kind"], path: string) {
    if (kind !== "page") {
      return;
    }

    const pageFavorites = isFavorite(kind, path)
      ? $workspaceStore.pageFavorites.filter((favoritePath) => favoritePath !== path)
      : [...$workspaceStore.pageFavorites, path];

    persistNavigation(pageFavorites, $workspaceStore.recentPages);
  }

  function moveFavorite(path: string, direction: "up" | "down") {
    const currentIndex = $workspaceStore.pageFavorites.indexOf(path);
    if (currentIndex < 0) {
      return;
    }

    const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (nextIndex < 0 || nextIndex >= $workspaceStore.pageFavorites.length) {
      return;
    }

    const pageFavorites = [...$workspaceStore.pageFavorites];
    [pageFavorites[currentIndex], pageFavorites[nextIndex]] = [
      pageFavorites[nextIndex],
      pageFavorites[currentIndex],
    ];
    persistNavigation(pageFavorites, $workspaceStore.recentPages);
  }

  function persistNavigation(pageFavorites: string[], recentPages: string[]) {
    void workspaceStore.saveNavigationConfig(pageFavorites, recentPages);
  }

  function isFavorite(kind: FavoriteItem["kind"], path: string) {
    if (kind !== "page") {
      return false;
    }

    return $workspaceStore.pageFavorites.some((favoritePath) => favoritePath === path);
  }

  function favoriteExists(favorite: FavoriteItem) {
    return favorite.kind === "page" ? pagePaths.has(favorite.path) : folderExists(tree, favorite.path);
  }

  function favoriteLabel(favorite: FavoriteItem) {
    return displayNameFromPath(favorite.path);
  }

  function nodeExists(node: NavigationNode) {
    return node.kind === "page" ? pagePaths.has(node.path) : node.path === "" || folderExists(tree, node.path);
  }

  function selectedNavigationNodes(paths: Set<string>) {
    return [...paths]
      .map((path) => findNavigationNode(tree, path))
      .filter((node): node is NavigationNode => Boolean(node));
  }

  function findNavigationNode(node: NavigationNode, path: string): NavigationNode | null {
    if (node.path === path) {
      return node;
    }

    if (node.kind === "folder") {
      for (const child of node.children) {
        const match = findNavigationNode(child, path);
        if (match) {
          return match;
        }
      }
    }

    return null;
  }

  function pruneSelection() {
    if (selectedPaths.size === 0) {
      return;
    }

    const next = new Set([...selectedPaths].filter((path) => Boolean(findNavigationNode(tree, path))));
    if (next.size !== selectedPaths.size) {
      selectedPaths = next;
    }
  }

  function handleNodeClick(node: NavigationNode, event: MouseEvent) {
    if (event.shiftKey) {
      event.preventDefault();
      selectRangeTo(node.path);
      return;
    }

    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      toggleNodeSelection(node.path);
      return;
    }

    selectedPaths = new Set([node.path]);
    selectionAnchorPath = node.path;

    if (node.kind === "folder") {
      toggleFolder(node.path);
    } else {
      openPageInEditor(node.path);
    }
  }

  function toggleNodeSelection(path: string) {
    const next = new Set(selectedPaths);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    selectedPaths = next;
    selectionAnchorPath = path;
  }

  function selectRangeTo(path: string) {
    const visiblePaths = filteredRows.map((row) => row.node.path);
    const targetIndex = visiblePaths.indexOf(path);
    const anchorIndex = selectionAnchorPath ? visiblePaths.indexOf(selectionAnchorPath) : -1;

    if (targetIndex < 0) {
      return;
    }

    if (anchorIndex < 0) {
      selectedPaths = new Set([path]);
      selectionAnchorPath = path;
      return;
    }

    const [start, end] =
      anchorIndex < targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
    selectedPaths = new Set(visiblePaths.slice(start, end + 1));
  }

  function rowPadding(depth: number) {
    return `${8 + depth * 22}px`;
  }

  function displayNameFromPath(path: string) {
    return pageNameFromPath(path);
  }

  function openPageInEditor(path: string) {
    mainViewStore.set("editor");
    rememberRecentPage(path);
    void editorSessionStore.open(path);
  }

  function openPageInRightPane(path: string) {
    void rightPaneStore.open(path);
  }

  function rememberRecentPage(path: string) {
    const recentPages = [
      path,
      ...$workspaceStore.recentPages.filter((candidate) => candidate !== path),
    ].slice(0, 10);
    persistNavigation($workspaceStore.pageFavorites, recentPages);
  }

  function removeRecentPage(path: string) {
    persistNavigation(
      $workspaceStore.pageFavorites,
      $workspaceStore.recentPages.filter((candidate) => candidate !== path),
    );
  }

  function collapseAll() {
    setExpandedFolders(new Set());
  }

  function expandAll() {
    setExpandedFolders(new Set(collectFolderPaths(tree)));
  }

  function refreshPages() {
    void workspaceStore.refreshPages();
  }

  function isActivePage(path: string) {
    return $editorSessionStore.path === path || $rightPaneStore.path === path;
  }

  function isEditorPage(path: string) {
    return $editorSessionStore.path === path;
  }

  function isRightPanePage(path: string) {
    return $rightPaneStore.path === path;
  }

  async function openJournal(day: JournalDay) {
    const path = journalPathForDay(day);
    await openJournalPath(path);
  }

  async function openJournalDate(date: string) {
    const path = journalPathForDateInput(date);
    if (!path) {
      return;
    }

    await openJournalPath(path);
  }

  async function openJournalPath(path: string) {
    if (pagePaths.has(path)) {
      openPageInEditor(path);
      return;
    }

    const page = await workspaceStore.createPage(path);

    if (page) {
      mainViewStore.set("editor");
      await editorSessionStore.open(page.path);
    }
  }

  async function startCreatePageInFolder(folderPath: string) {
    folderPageDialog = {
      folderPath,
      value: "",
    };
    folderPageError = null;
    contextMenu = null;
    await tick();
    folderPageInput?.focus();
  }

  function closeFolderPageDialog() {
    if (folderPageSubmitting) {
      return;
    }

    folderPageDialog = null;
    folderPageError = null;
  }

  async function submitFolderPage() {
    if (!folderPageDialog || folderPageSubmitting) {
      return;
    }

    const name = folderPageDialog.value.trim();
    const validationError = validateFolderPageName(name);
    if (validationError) {
      folderPageError = validationError;
      return;
    }

    const pagePath = joinFolderPath(folderPageDialog.folderPath, name);
    folderPageSubmitting = true;
    browseError = null;
    folderPageError = null;

    try {
      const page = await workspaceStore.createPage(pagePath);
      if (!page) {
        folderPageError = $workspaceStore.error || "Page could not be created.";
        return;
      }

      openFolder(folderPageDialog.folderPath);
      persistManualPageOrder(appendPathToManualOrder($workspaceStore.manualPageOrder, page.path));
      folderPageDialog = null;
      mainViewStore.set("editor");
      await editorSessionStore.open(page.path);
    } finally {
      folderPageSubmitting = false;
    }
  }

  async function startCreateFolder(parentPath: string) {
    folderDialog = {
      parentPath,
      value: "",
    };
    folderError = null;
    contextMenu = null;
    await tick();
    folderInput?.focus();
  }

  function closeFolderDialog() {
    if (folderSubmitting) {
      return;
    }

    folderDialog = null;
    folderError = null;
  }

  async function submitFolder() {
    if (!folderDialog || folderSubmitting) {
      return;
    }

    const name = folderDialog.value.trim();
    const validationError = validateFolderName(name);
    if (validationError) {
      folderError = validationError;
      return;
    }

    const path = joinFolderPath(folderDialog.parentPath, name);
    if (existingFolderPaths.some((folder) => folder.toLowerCase() === path.toLowerCase())) {
      folderError = "Folder already exists.";
      return;
    }

    folderSubmitting = true;
    browseError = null;
    folderError = null;

    try {
      const createdPath = await workspaceStore.createFolder(path);
      if (!createdPath) {
        folderError = $workspaceStore.error || "Folder could not be created.";
        return;
      }

      openFolder(folderDialog.parentPath);
      openFolder(createdPath);
      persistManualPageOrder(appendPathToManualOrder($workspaceStore.manualPageOrder, createdPath));
      folderDialog = null;
    } finally {
      folderSubmitting = false;
    }
  }

  function validateFolderName(name: string) {
    if (!name) {
      return "Enter a folder name.";
    }

    if (name.includes("/") || name.includes("\\")) {
      return "Use only the folder name here, without separators.";
    }

    if (name === "." || name === "..") {
      return "This name is reserved.";
    }

    return null;
  }

  function joinFolderPath(parentPath: string, name: string) {
    return parentPath ? `${parentPath}/${name}` : name;
  }

  function validateFolderPageName(name: string) {
    if (!name) {
      return "Enter a file name.";
    }

    if (name.includes("/") || name.includes("\\")) {
      return "Use only the file name here, without folder separators.";
    }

    if (name === "." || name === ".." || name === ".md") {
      return "This name is reserved.";
    }

    return null;
  }

  function scheduleContentSearch(query: string, root: string | null) {
    if (searchTimer) {
      clearTimeout(searchTimer);
      searchTimer = null;
    }

    if (!root || !query.trim()) {
      searchResults = [];
      searchLoading = false;
      searchError = null;
      searchResultContextMenu = null;
      return;
    }

    searchLoading = true;
    const requestId = ++searchSequence;

    searchTimer = setTimeout(() => {
      void runContentSearch(query, requestId);
    }, 250);
  }

  async function runContentSearch(query: string, requestId: number) {
    try {
      const results = await searchPages(query);

      if (requestId !== searchSequence) {
        return;
      }

      searchResults = results.slice(0, 30);
      searchError = null;
      searchResultContextMenu = null;
    } catch (error) {
      if (requestId !== searchSequence) {
        return;
      }

      searchResults = [];
      searchError = error instanceof Error ? error.message : String(error);
      searchResultContextMenu = null;
    } finally {
      if (requestId === searchSequence) {
        searchLoading = false;
      }
    }
  }

  function openSearchResult(result: SearchResult) {
    mainViewStore.set("editor");
    rememberRecentPage(result.path);
    void editorSessionStore.open(result.path, { line: result.line });
  }

  function openSearchResultInRightPane(result: SearchResult) {
    openPageInRightPane(result.path);
  }

  function openSearchResultContextMenu(result: SearchResult, event: MouseEvent) {
    event.preventDefault();
    searchResultContextMenu = {
      x: event.clientX,
      y: event.clientY,
      result,
    };
  }

  function openSearchResultKeyboardContextMenu(result: SearchResult, event: KeyboardEvent) {
    if (event.key !== "ContextMenu" && !(event.key === "F10" && event.shiftKey)) {
      return;
    }

    event.preventDefault();
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    searchResultContextMenu = {
      x: rect.left + 12,
      y: rect.top + 12,
      result,
    };
  }

  function closeSearchResultContextMenu() {
    searchResultContextMenu = null;
  }

  function handleSearchResultContextMenuAction(action: "open-editor" | "open-right") {
    if (!searchResultContextMenu) {
      return;
    }

    const { result } = searchResultContextMenu;
    searchResultContextMenu = null;

    if (action === "open-right") {
      openSearchResultInRightPane(result);
      return;
    }

    openSearchResult(result);
  }

  function openTaskOverview() {
    mainViewStore.set("tasks");
    void taskStore.refresh();
  }

  async function movePageToFolder(path: string, targetFolder: string) {
    const currentFolder = path.split("/").slice(0, -1).join("/");

    if (currentFolder === targetFolder) {
      return true;
    }

    if (
      $editorSessionStore.path === path &&
      ($editorSessionStore.dirty || $editorSessionStore.saving || $editorSessionStore.conflict)
    ) {
      browseError = "Save or resolve the current editor page before moving it.";
      moveError = browseError;
      return false;
    }

    const result = await workspaceStore.movePage(path, targetFolder);
    if (!result) {
      moveError = $workspaceStore.error || "Page could not be moved.";
      return false;
    }

    const movedPath = result.page.path;
    persistManualPageOrder(
      movePathBetweenManualOrderFolders($workspaceStore.manualPageOrder, result.oldPath, movedPath),
    );
    persistNavigation(
      $workspaceStore.pageFavorites.map((favoritePath) =>
        favoritePath === result.oldPath ? movedPath : favoritePath,
      ),
      $workspaceStore.recentPages.map((recentPath) =>
        recentPath === result.oldPath ? movedPath : recentPath,
      ),
    );

    if (targetFolder) {
      openFolder(targetFolder);
    }

    if ($editorSessionStore.path === result.oldPath) {
      await editorSessionStore.open(movedPath);
    }

    if ($rightPaneStore.path === result.oldPath) {
      await rightPaneStore.open(movedPath);
    }

    await rightPaneStore.refresh();
    void taskStore.refresh();
    return true;
  }

  async function moveFolderToFolder(path: string, targetFolder: string) {
    if (targetFolder === path || pathIsInsideFolder(targetFolder, path)) {
      moveError = "Cannot move a folder into itself.";
      return false;
    }

    if (
      $editorSessionStore.path &&
      pathIsInsideFolder($editorSessionStore.path, path) &&
      ($editorSessionStore.dirty || $editorSessionStore.saving || $editorSessionStore.conflict)
    ) {
      browseError = "Save or resolve the current editor page before moving its folder.";
      moveError = browseError;
      return false;
    }

    const result = await workspaceStore.moveFolder(path, targetFolder);
    if (!result) {
      moveError = $workspaceStore.error || "Folder could not be moved.";
      return false;
    }

    persistManualPageOrder(
      remapManualPageOrderFolder($workspaceStore.manualPageOrder, result.oldPath, result.newPath),
    );
    persistNavigation(
      $workspaceStore.pageFavorites.map((favoritePath) =>
        remapPathInsideFolder(favoritePath, result.oldPath, result.newPath),
      ),
      $workspaceStore.recentPages.map((recentPath) =>
        remapPathInsideFolder(recentPath, result.oldPath, result.newPath),
      ),
    );
    setExpandedFolders(
      new Set(
        [...expandedFolders].map((folderPath) =>
          remapFolderPath(folderPath, result.oldPath, result.newPath),
        ),
      ),
      false,
    );

    openFolder(result.newPath);

    if ($editorSessionStore.path && pathIsInsideFolder($editorSessionStore.path, result.oldPath)) {
      await editorSessionStore.open(
        remapPathInsideFolder($editorSessionStore.path, result.oldPath, result.newPath),
      );
    }

    if ($rightPaneStore.path && pathIsInsideFolder($rightPaneStore.path, result.oldPath)) {
      await rightPaneStore.open(
        remapPathInsideFolder($rightPaneStore.path, result.oldPath, result.newPath),
      );
    }

    await rightPaneStore.refresh();
    void taskStore.refresh();
    return true;
  }

  async function deleteFolder(path: string, options: { notifyError?: boolean } = {}) {
    const notifyError = options.notifyError ?? true;
    const editorPath = $editorSessionStore.path;
    const rightPanePath = $rightPaneStore.path;
    const editorWasInFolder = Boolean(editorPath && pathIsInsideFolder(editorPath, path));
    const rightPaneWasInFolder = Boolean(rightPanePath && pathIsInsideFolder(rightPanePath, path));

    if (editorPath && editorWasInFolder) {
      editorSessionStore.clearIfPath(editorPath);
    }
    if (rightPanePath && rightPaneWasInFolder) {
      rightPaneStore.clearIfPath(rightPanePath);
    }

    const result = await workspaceStore.deleteFolder(path);
    if (!result) {
      const message = $workspaceStore.error || "Folder could not be deleted.";
      workspaceStore.clearError();
      if (editorPath && editorWasInFolder) {
        await editorSessionStore.open(editorPath);
      }
      if (rightPanePath && rightPaneWasInFolder) {
        await rightPaneStore.open(rightPanePath);
      }
      if (notifyError) {
        showPopupError(message);
      }
      return false;
    }

    for (const deletedPath of result.deletedPagePaths) {
      editorSessionStore.clearIfPath(deletedPath);
      rightPaneStore.clearIfPath(deletedPath);
    }
    persistNavigation(
      $workspaceStore.pageFavorites.filter(
        (favoritePath) =>
          !result.deletedPagePaths.some((deletedPath) => deletedPath === favoritePath),
      ),
      $workspaceStore.recentPages.filter(
        (recentPath) =>
          !result.deletedPagePaths.some((deletedPath) => deletedPath === recentPath),
      ),
    );
    persistManualPageOrder(
      removePathFromManualOrder(
        removeFolderFromManualOrder($workspaceStore.manualPageOrder, result.deletedPath),
        result.deletedPath,
      ),
    );
    setExpandedFolders(
      new Set([...expandedFolders].filter((folderPath) => !pathIsInsideFolder(folderPath, result.deletedPath))),
      false,
    );
    await rightPaneStore.refresh();
    void taskStore.refresh();
    return true;
  }

  async function startMovePage(path: string) {
    const currentFolder = path.split("/").slice(0, -1).join("/");
    moveDialog = {
      kind: "page",
      path,
      itemName: path.split("/").at(-1) || path,
      currentFolder,
      targetFolder: currentFolder,
    };
    moveError = null;
    contextMenu = null;
    await tick();
    moveInput?.focus();
    moveInput?.select();
  }

  async function startMoveFolder(path: string) {
    const currentFolder = path.split("/").slice(0, -1).join("/");
    moveDialog = {
      kind: "folder",
      path,
      itemName: path.split("/").at(-1) || path,
      currentFolder,
      targetFolder: currentFolder,
    };
    moveError = null;
    contextMenu = null;
    await tick();
    moveInput?.focus();
    moveInput?.select();
  }

  function closeMoveDialog() {
    if (moveSubmitting) {
      return;
    }

    moveDialog = null;
    moveError = null;
  }

  async function submitMove() {
    if (!moveDialog || moveSubmitting) {
      return;
    }

    const targetFolder = moveDialog.targetFolder.trim().replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
    const validationError = validateFolderPath(targetFolder);
    if (validationError) {
      moveError = validationError;
      return;
    }

    moveSubmitting = true;
    moveError = null;
    browseError = null;

    try {
      const moved =
        moveDialog.kind === "folder"
          ? await moveFolderToFolder(moveDialog.path, targetFolder)
          : await movePageToFolder(moveDialog.path, targetFolder);
      if (moved) {
        moveDialog = null;
      }
    } finally {
      moveSubmitting = false;
    }
  }

  async function startBatchMove() {
    const paths = compactSelection(selectedNodes).map((node) => node.path);
    if (paths.length === 0) {
      return;
    }

    batchMoveDialog = {
      paths,
      targetFolder: "",
    };
    batchMoveError = null;
    contextMenu = null;
    await tick();
    batchMoveInput?.focus();
  }

  function closeBatchMoveDialog() {
    if (batchMoveSubmitting) {
      return;
    }

    batchMoveDialog = null;
    batchMoveError = null;
  }

  async function submitBatchMove() {
    if (!batchMoveDialog || batchMoveSubmitting) {
      return;
    }

    const targetFolder = batchMoveDialog.targetFolder.trim().replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
    const validationError = validateFolderPath(targetFolder);
    if (validationError) {
      batchMoveError = validationError;
      return;
    }

    const nodes = compactSelection(
      batchMoveDialog.paths
        .map((path) => findNavigationNode(tree, path))
        .filter((node): node is NavigationNode => Boolean(node)),
    );
    if (nodes.some((node) => node.kind === "folder" && (targetFolder === node.path || pathIsInsideFolder(targetFolder, node.path)))) {
      batchMoveError = "Cannot move a folder into itself.";
      return;
    }
    if (nodesAffectDirtyEditor(nodes)) {
      batchMoveError = "Save or resolve the current editor page before moving this selection.";
      return;
    }

    batchMoveSubmitting = true;
    batchMoveError = null;
    browseError = null;

    try {
      for (const node of nodes) {
        const moved = node.kind === "folder"
          ? await moveFolderToFolder(node.path, targetFolder)
          : await movePageToFolder(node.path, targetFolder);
        if (!moved) {
          batchMoveError = $workspaceStore.error || "Selection could not be moved.";
          return;
        }
      }

      if (targetFolder) {
        openFolder(targetFolder);
      }
      selectedPaths = new Set();
      selectionAnchorPath = null;
      batchMoveDialog = null;
    } finally {
      batchMoveSubmitting = false;
    }
  }

  function selectBatchMoveFolderSuggestion(path: string) {
    if (!batchMoveDialog || batchMoveSubmitting) {
      return;
    }

    batchMoveDialog = {
      ...batchMoveDialog,
      targetFolder: path,
    };
    batchMoveError = null;
    void tick().then(() => {
      batchMoveInput?.focus();
      batchMoveInput?.setSelectionRange(path.length, path.length);
    });
  }

  async function deleteSelection() {
    const nodes = compactSelection(selectedNodes);
    if (nodes.length === 0) {
      return;
    }

    const label = nodes.length === 1 ? nodes[0].path : `${nodes.length} items`;
    if (
      !(await confirmWarning(
        `Delete ${label}? Folders must be empty. Markdown files are removed from disk.`,
      ))
    ) {
      return;
    }

    for (const node of nodesForDelete(nodes)) {
      const deleted =
        node.kind === "folder"
          ? await deleteFolder(node.path, { notifyError: false })
          : await deletePage(node.path, { confirmDelete: false });
      if (!deleted) {
        const message = $workspaceStore.error || "Selection could not be deleted.";
        workspaceStore.clearError();
        showPopupError(message);
        return;
      }
    }

    selectedPaths = new Set();
    selectionAnchorPath = null;
  }

  function validateFolderPath(path: string) {
    if (!path) {
      return null;
    }

    if (path.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
      return "Use a workspace-relative folder path without empty, . or .. segments.";
    }

    return null;
  }

  function folderSuggestions(
    query: string,
    folders: string[],
    currentFolder: string,
  ): FolderSuggestion[] {
    const normalizedQuery = query.trim().replaceAll("\\", "/").toLowerCase();
    const suggestions: FolderSuggestion[] = [];

    if (
      currentFolder !== "" &&
      (!normalizedQuery ||
        "root".startsWith(normalizedQuery) ||
        "workspace root".startsWith(normalizedQuery))
    ) {
      suggestions.push({
        path: "",
        label: "Workspace root",
      });
    }

    suggestions.push(
      ...folders
        .filter((folder) => folder !== currentFolder)
        .filter((folder) => {
          if (!normalizedQuery) {
            return true;
          }

          const normalizedFolder = folder.toLowerCase();
          const folderName = normalizedFolder.split("/").at(-1) ?? normalizedFolder;
          return (
            normalizedFolder.startsWith(normalizedQuery) || folderName.startsWith(normalizedQuery)
          );
        })
        .map((folder) => ({
          path: folder,
          label: folder,
        })),
    );

    return suggestions.slice(0, 8);
  }

  function selectMoveFolderSuggestion(path: string) {
    if (!moveDialog || moveSubmitting) {
      return;
    }

    moveDialog = {
      ...moveDialog,
      targetFolder: path,
    };
    moveError = null;
    void tick().then(() => {
      moveInput?.focus();
      moveInput?.setSelectionRange(path.length, path.length);
    });
  }

  function startRenamePage(path: string) {
    if (
      $editorSessionStore.path === path &&
      ($editorSessionStore.dirty || $editorSessionStore.saving || $editorSessionStore.conflict)
    ) {
      browseError = "Save or resolve the current editor page before renaming it.";
      return;
    }

    const currentName = displayNameFromPath(path);
    openRenameDialog("page", path, currentName);
  }

  function startRenameFolder(path: string) {
    if (
      $editorSessionStore.path &&
      pathIsInsideFolder($editorSessionStore.path, path) &&
      ($editorSessionStore.dirty || $editorSessionStore.saving || $editorSessionStore.conflict)
    ) {
      browseError = "Save or resolve the current editor page before renaming its folder.";
      return;
    }

    const currentName = path.split("/").at(-1) || path;
    openRenameDialog("folder", path, currentName);
  }

  async function openRenameDialog(kind: RenameDialogState["kind"], path: string, currentName: string) {
    renameDialog = {
      kind,
      path,
      currentName,
      value: currentName,
    };
    renameError = null;
    contextMenu = null;
    await tick();
    renameInput?.focus();
    renameInput?.select();
  }

  function closeRenameDialog() {
    if (renameSubmitting) {
      return;
    }

    renameDialog = null;
    renameError = null;
  }

  async function submitRename() {
    if (!renameDialog || renameSubmitting) {
      return;
    }

    const newName = renameDialog.value.trim();
    const validationError = validateRenameName(newName);
    if (validationError) {
      renameError = validationError;
      return;
    }

    if (newName === renameDialog.currentName) {
      closeRenameDialog();
      return;
    }

    renameSubmitting = true;
    browseError = null;
    renameError = null;

    try {
      if (renameDialog.kind === "page") {
        await performPageRename(renameDialog.path, newName);
      } else {
        await performFolderRename(renameDialog.path, newName);
      }
    } finally {
      renameSubmitting = false;
    }
  }

  function validateRenameName(name: string) {
    if (!name) {
      return "Enter a name.";
    }

    if (name.includes("/") || name.includes("\\")) {
      return "Use only the leaf name here, without folder separators.";
    }

    if (name === "." || name === "..") {
      return "This name is reserved.";
    }

    return null;
  }

  async function performPageRename(path: string, newName: string) {
    const result = await workspaceStore.renamePage(path, newName);
    if (!result) {
      renameError = $workspaceStore.error || "Page could not be renamed.";
      return;
    }

    const renamedPath = result.page.path;
    persistManualPageOrder(
      remapManualPageOrderPath($workspaceStore.manualPageOrder, result.oldPath, renamedPath),
    );
    persistNavigation(
      $workspaceStore.pageFavorites.map((favoritePath) =>
        favoritePath === result.oldPath ? renamedPath : favoritePath,
      ),
      $workspaceStore.recentPages.map((recentPath) =>
        recentPath === result.oldPath ? renamedPath : recentPath,
      ),
    );

    const renamedFolder = renamedPath.split("/").slice(0, -1).join("/");
    if (renamedFolder) {
      openFolder(renamedFolder);
    }

    if ($editorSessionStore.path === result.oldPath) {
      await editorSessionStore.open(renamedPath);
    }

    if ($rightPaneStore.path === result.oldPath) {
      await rightPaneStore.open(renamedPath);
    }

    await rightPaneStore.refresh();
    void taskStore.refresh();
    renameDialog = null;
  }

  async function performFolderRename(path: string, newName: string) {
    const result = await workspaceStore.renameFolder(path, newName);
    if (!result) {
      renameError = $workspaceStore.error || "Folder could not be renamed.";
      return;
    }
    persistManualPageOrder(
      remapManualPageOrderFolder($workspaceStore.manualPageOrder, result.oldPath, result.newPath),
    );
    persistNavigation(
      $workspaceStore.pageFavorites.map((favoritePath) =>
        remapPathInsideFolder(favoritePath, result.oldPath, result.newPath),
      ),
      $workspaceStore.recentPages.map((recentPath) =>
        remapPathInsideFolder(recentPath, result.oldPath, result.newPath),
      ),
    );
    setExpandedFolders(
      new Set(
        [...expandedFolders].map((folderPath) =>
          remapFolderPath(folderPath, result.oldPath, result.newPath),
        ),
      ),
      false,
    );

    openFolder(result.newPath);

    if ($editorSessionStore.path && pathIsInsideFolder($editorSessionStore.path, result.oldPath)) {
      await editorSessionStore.open(
        remapPathInsideFolder($editorSessionStore.path, result.oldPath, result.newPath),
      );
    }

    if ($rightPaneStore.path && pathIsInsideFolder($rightPaneStore.path, result.oldPath)) {
      await rightPaneStore.open(
        remapPathInsideFolder($rightPaneStore.path, result.oldPath, result.newPath),
      );
    }

    await rightPaneStore.refresh();
    void taskStore.refresh();
    renameDialog = null;
  }

  function initialExpandedFolders(savedFolders: string[] | null) {
    if (!savedFolders) {
      return new Set(collectFolderPaths(tree));
    }

    return new Set(savedFolders.filter((path) => folderExists(tree, path)));
  }

  function setExpandedFolders(next: Set<string>, persist = true) {
    expandedFolders = next;

    if (persist) {
      scheduleExpandedFoldersSave();
    }
  }

  function scheduleExpandedFoldersSave() {
    if (!$workspaceStore.root) {
      return;
    }

    if (expandedFolderSaveTimer) {
      clearTimeout(expandedFolderSaveTimer);
    }

    expandedFolderSaveTimer = setTimeout(() => {
      expandedFolderSaveTimer = null;
      void persistExpandedFolders();
    }, 300);
  }

  async function persistExpandedFolders() {
    try {
      await saveExpandedFolders([...expandedFolders]);
    } catch (error) {
      browseError = error instanceof Error ? error.message : String(error);
    }
  }

  function pathIsInsideFolder(path: string, folderPath: string) {
    return path === folderPath || path.startsWith(`${folderPath}/`);
  }

  function remapPathInsideFolder(path: string, oldFolder: string, newFolder: string) {
    return pathIsInsideFolder(path, oldFolder) ? `${newFolder}${path.slice(oldFolder.length)}` : path;
  }

  function remapFolderPath(path: string, oldFolder: string, newFolder: string) {
    return pathIsInsideFolder(path, oldFolder) ? `${newFolder}${path.slice(oldFolder.length)}` : path;
  }

  function persistManualPageOrder(manualPageOrder: Record<string, string[]>) {
    void workspaceStore.saveManualPageOrderConfig(manualPageOrder);
  }

  function appendPathToManualOrder(manualPageOrder: Record<string, string[]>, path: string) {
    const parentPath = parentFolderPath(path);
    const existing = manualPageOrder[parentPath];
    if (!existing) {
      return manualPageOrder;
    }

    if (existing.some((candidate) => candidate.toLowerCase() === path.toLowerCase())) {
      return manualPageOrder;
    }

    return {
      ...manualPageOrder,
      [parentPath]: [...existing, path],
    };
  }

  function removePathFromManualOrder(manualPageOrder: Record<string, string[]>, path: string) {
    const next: Record<string, string[]> = {};

    for (const [folderPath, childPaths] of Object.entries(manualPageOrder)) {
      const remaining = childPaths.filter(
        (childPath) => childPath.toLowerCase() !== path.toLowerCase(),
      );
      if (remaining.length > 0) {
        next[folderPath] = remaining;
      }
    }

    return next;
  }

  function removeFolderFromManualOrder(manualPageOrder: Record<string, string[]>, folder: string) {
    const next: Record<string, string[]> = {};

    for (const [folderPath, childPaths] of Object.entries(manualPageOrder)) {
      if (pathIsInsideFolder(folderPath, folder)) {
        continue;
      }

      const remaining = childPaths.filter((childPath) => !pathIsInsideFolder(childPath, folder));
      if (remaining.length > 0) {
        next[folderPath] = remaining;
      }
    }

    return next;
  }

  function remapManualPageOrderPath(
    manualPageOrder: Record<string, string[]>,
    oldPath: string,
    newPath: string,
  ) {
    const next: Record<string, string[]> = {};

    for (const [folderPath, childPaths] of Object.entries(manualPageOrder)) {
      next[folderPath] = childPaths.map((childPath) =>
        childPath.toLowerCase() === oldPath.toLowerCase() ? newPath : childPath,
      );
    }

    return next;
  }

  function movePathBetweenManualOrderFolders(
    manualPageOrder: Record<string, string[]>,
    oldPath: string,
    newPath: string,
  ) {
    const next = removePathFromManualOrder(manualPageOrder, oldPath);
    const newParentPath = parentFolderPath(newPath);
    const targetOrder = next[newParentPath];

    if (!targetOrder) {
      return next;
    }

    return {
      ...next,
      [newParentPath]: [...targetOrder, newPath],
    };
  }

  function remapManualPageOrderFolder(
    manualPageOrder: Record<string, string[]>,
    oldFolder: string,
    newFolder: string,
  ) {
    const next: Record<string, string[]> = {};

    for (const [folderPath, childPaths] of Object.entries(manualPageOrder)) {
      const remappedFolderPath = remapFolderPath(folderPath, oldFolder, newFolder);
      const remappedChildPaths = childPaths.map((childPath) =>
        remapFolderPath(childPath, oldFolder, newFolder),
      );
      next[remappedFolderPath] = remappedChildPaths;
    }

    return next;
  }

  function parentFolderPath(path: string) {
    return path.split("/").slice(0, -1).join("/");
  }

  function childrenForFolder(path: string) {
    const folder = findFolderNode(tree, path);
    return folder?.children.map((child) => child.path) ?? [];
  }

  function findFolderNode(node: NavigationNode, path: string): Extract<NavigationNode, { kind: "folder" }> | null {
    if (node.kind !== "folder") {
      return null;
    }

    if (node.path === path) {
      return node;
    }

    for (const child of node.children) {
      const match = findFolderNode(child, path);
      if (match) {
        return match;
      }
    }

    return null;
  }

  async function moveNavigationNode(path: string, direction: "up" | "down") {
    const parentPath = parentFolderPath(path);
    const childPaths = childrenForFolder(parentPath);
    const index = childPaths.findIndex((childPath) => childPath === path);
    const targetIndex = direction === "up" ? index - 1 : index + 1;

    if (index < 0 || targetIndex < 0 || targetIndex >= childPaths.length) {
      return;
    }

    const nextOrder = [...childPaths];
    [nextOrder[index], nextOrder[targetIndex]] = [nextOrder[targetIndex], nextOrder[index]];

    const nextManualPageOrder = {
      ...$workspaceStore.manualPageOrder,
      [parentPath]: nextOrder,
    };
    await workspaceStore.saveManualPageOrderConfig(nextManualPageOrder);
    focusTreeNodeAfterUpdate(path);
  }

  function compactSelection(nodes: NavigationNode[]) {
    return nodes.filter((node) => {
      return !nodes.some(
        (candidate) =>
          candidate.kind === "folder" &&
          candidate.path !== node.path &&
          pathIsInsideFolder(node.path, candidate.path),
      );
    });
  }

  function nodesAffectDirtyEditor(nodes: NavigationNode[]) {
    if (
      !$editorSessionStore.path ||
      !($editorSessionStore.dirty || $editorSessionStore.saving || $editorSessionStore.conflict)
    ) {
      return false;
    }

    return nodes.some((node) =>
      node.kind === "folder"
        ? pathIsInsideFolder($editorSessionStore.path ?? "", node.path)
        : node.path === $editorSessionStore.path,
    );
  }

  function nodesForDelete(nodes: NavigationNode[]) {
    return [...nodes].sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === "folder" ? -1 : 1;
      }

      return right.path.length - left.path.length;
    });
  }

  function filteredPageRows(query: string) {
    const normalized = query.trim().toLowerCase();

    return $workspaceStore.pages
      .filter((page) => {
        const path = page.path.toLowerCase();
        const title = page.title.toLowerCase();
        return path.includes(normalized) || title.includes(normalized);
      })
      .map((page) => ({
        depth: 0,
        node: {
          kind: "page" as const,
          name: pageNameFromPath(page.path),
          path: page.path,
          page,
        },
      }));
  }

  function openBestSearchMatch() {
    const first = filteredRows.find((row) => row.node.kind === "page");
    if (first?.node.kind === "page") {
      openPageInEditor(first.node.path);
      return;
    }

    const firstResult = searchResults[0];
    if (firstResult) {
      openSearchResult(firstResult);
    }
  }

  function focusTreeNode(path: string) {
    focusedTreePath = path;
  }

  function focusTreeNodeAfterUpdate(path: string) {
    focusedTreePath = path;
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-tree-path="${CSS.escape(path)}"]`)?.focus();
    });
  }

  function handleTreeKeydown(node: NavigationNode, event: KeyboardEvent) {
    const currentIndex = filteredRows.findIndex((row) => row.node.path === node.path);

    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusTreeNodeAfterUpdate(
        filteredRows[Math.min(currentIndex + 1, filteredRows.length - 1)]?.node.path ?? node.path,
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusTreeNodeAfterUpdate(filteredRows[Math.max(currentIndex - 1, 0)]?.node.path ?? node.path);
      return;
    }

    if (event.key === "ArrowRight" && node.kind === "folder") {
      event.preventDefault();
      openFolder(node.path);
      return;
    }

    if (event.key === "ArrowLeft" && node.kind === "folder") {
      event.preventDefault();
      closeFolder(node.path);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (node.kind === "folder") {
        toggleFolder(node.path);
      } else {
        openPageInEditor(node.path);
      }
    }
  }

  function openContextMenu(node: NavigationNode, event: MouseEvent) {
    event.preventDefault();
    if (!selectedPaths.has(node.path)) {
      selectedPaths = new Set([node.path]);
      selectionAnchorPath = node.path;
    }
    contextMenu = {
      x: event.clientX,
      y: event.clientY,
      node,
    };
  }

  function closeContextMenu() {
    contextMenu = null;
  }

  async function handleContextMenuAction(action: string) {
    if (!contextMenu) {
      return;
    }

    const { node } = contextMenu;
    contextMenu = null;

    if (action === "batch-move") {
      void startBatchMove();
      return;
    }

    if (action === "batch-delete") {
      void deleteSelection();
      return;
    }

    if (node.kind === "folder") {
      if (action === "refresh-pages") {
        refreshPages();
        return;
      }

      if (action === "collapse-all") {
        collapseAll();
        return;
      }

      if (action === "expand-all") {
        expandAll();
        return;
      }

      if (action === "rename") {
        if (!node.path) {
          return;
        }
        startRenameFolder(node.path);
        return;
      }

      if (action === "new-page") {
        void startCreatePageInFolder(node.path);
        return;
      }

      if (action === "new-folder") {
        void startCreateFolder(node.path);
        return;
      }

      if (action === "move-folder") {
        if (!node.path) {
          return;
        }
        void startMoveFolder(node.path);
        return;
      }

      if (action === "move-root") {
        if (!node.path) {
          return;
        }
        void moveFolderToFolder(node.path, "");
        return;
      }

      if (action === "move-up" || action === "move-down") {
        if (!node.path) {
          return;
        }
        void moveNavigationNode(node.path, action === "move-up" ? "up" : "down");
        return;
      }

      if (action.startsWith("sort:")) {
        const sort = action.slice("sort:".length) as PageSortMode;
        void setFolderSort(node.path, sort);
      }
      if (action.startsWith("color:")) {
        const color = action.slice("color:".length);
        void setFolderColor(node.path, color === "none" ? null : (color as TaskColorName));
        return;
      }

      if (action === "delete") {
        if (!node.path) {
          return;
        }
        if (nodesAffectDirtyEditor([node])) {
          showPopupError("Save or resolve the current editor page before deleting this folder.");
          return;
        }
        if (
          await confirmWarning(`Delete empty folder ${node.path}? Non-empty folders are blocked.`)
        ) {
          void deleteFolder(node.path);
        }
      }
      return;
    }

    if (action === "open-editor") {
      openPageInEditor(node.path);
      return;
    }

    if (action === "open-right") {
      openPageInRightPane(node.path);
      return;
    }

    if (action === "move-root") {
      void movePageToFolder(node.path, "");
      return;
    }

    if (action === "move-folder") {
      void startMovePage(node.path);
      return;
    }

    if (action === "rename") {
      startRenamePage(node.path);
      return;
    }

    if (action === "move-up" || action === "move-down") {
      void moveNavigationNode(node.path, action === "move-up" ? "up" : "down");
      return;
    }

    if (action === "toggle-favorite") {
      toggleFavorite("page", node.path);
      return;
    }

    if (action === "delete") {
      void deletePage(node.path);
    }
  }

  async function setFolderSort(path: string, sort: PageSortMode) {
    const nextFolderSort = { ...$workspaceStore.folderPageSort };
    const nextManualPageOrder = { ...$workspaceStore.manualPageOrder };

    if (sort === $workspaceStore.defaultPageSort) {
      delete nextFolderSort[path];
    } else {
      nextFolderSort[path] = sort;
    }
    delete nextManualPageOrder[path];

    await workspaceStore.savePageSortConfig($workspaceStore.defaultPageSort, nextFolderSort);
    await workspaceStore.saveManualPageOrderConfig(nextManualPageOrder);
  }

  function folderSortFor(path: string) {
    return $workspaceStore.folderPageSort[path] ?? $workspaceStore.defaultPageSort;
  }

  async function setFolderColor(path: string, color: TaskColorName | null) {
    const nextFolderColors = { ...$workspaceStore.folderColors };

    if (color) {
      nextFolderColors[path] = color;
    } else {
      delete nextFolderColors[path];
    }

    await workspaceStore.saveFolderColorsConfig(nextFolderColors);
  }

  function folderColorFor(path: string) {
    return inheritedFolderColor(path, $workspaceStore.folderColors);
  }

  function folderGlyphStyle(path: string) {
    return folderGlyphStyleForColor(folderColorFor(path));
  }

  function handleDragStart(path: string, event: DragEvent) {
    draggedPagePath = path;
    event.dataTransfer?.setData("text/plain", path);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
    }
  }

  function handleDragEnd() {
    draggedPagePath = null;
    dragOverFolderPath = null;
  }

  function handleFolderDragOver(path: string, event: DragEvent) {
    if (!draggedPagePath) {
      return;
    }

    event.preventDefault();
    dragOverFolderPath = path;

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
  }

  function handleFolderDrop(path: string, event: DragEvent) {
    event.preventDefault();
    const pagePath = event.dataTransfer?.getData("text/plain") || draggedPagePath;
    draggedPagePath = null;
    dragOverFolderPath = null;

    if (pagePath) {
      void movePageToFolder(pagePath, path);
    }
  }

  function handleFolderDragLeave() {
    dragOverFolderPath = null;
  }

  function startQuickAccessResize(event: PointerEvent) {
    if (!quickAccessPanel) {
      return;
    }

    event.preventDefault();
    resizingQuickAccess = true;
    window.addEventListener("pointermove", resizeQuickAccess);
    window.addEventListener("pointerup", stopQuickAccessResize, { once: true });
  }

  function resizeQuickAccess(event: PointerEvent) {
    if (!quickAccessPanel || !fileTreeElement) {
      return;
    }

    const panelTop = quickAccessPanel.getBoundingClientRect().top;
    const fileTreeBottom = fileTreeElement.getBoundingClientRect().bottom;
    const maxHeight = Math.max(80, fileTreeBottom - panelTop - 160);
    quickAccessHeight = normalizeQuickAccessHeight(event.clientY - panelTop, maxHeight);
  }

  function stopQuickAccessResize() {
    window.removeEventListener("pointermove", resizeQuickAccess);
    resizingQuickAccess = false;
    persistNavigationLayout();
  }

  function normalizeQuickAccessHeight(value: number, maxHeight = 520) {
    return Math.round(Math.min(Math.max(value, 80), maxHeight));
  }

  function persistNavigationLayout() {
    if (navigationLayoutSaveTimer) {
      clearTimeout(navigationLayoutSaveTimer);
    }

    navigationLayoutSaveTimer = setTimeout(() => {
      navigationLayoutSaveTimer = null;
      void workspaceStore.saveNavigationLayoutConfig({
        quickAccessHeight,
      });
    }, 250);
  }

</script>

<svelte:window on:click={closeContextMenu} on:keydown={(event) => event.key === "Escape" && closeContextMenu()} />

<aside
  class:resizing-quick-access={resizingQuickAccess}
  class="file-tree"
  aria-label="Workspace navigator"
  bind:this={fileTreeElement}
>
  <WorkspaceHeader
    root={$workspaceStore.root}
    loading={$workspaceStore.loading}
    diagnostics={$workspaceStore.diagnostics}
    bind:workspacePath
    {openWorkspace}
    {chooseWorkspaceFolder}
    {openJournal}
    {openJournalDate}
    taskLoading={$taskStore.loading}
    taskCount={$taskStore.tasks.length}
    {openTaskOverview}
  />

  {#if $workspaceStore.pages.length === 0}
    <div class="empty-state">Open a workspace to show Markdown files.</div>
  {:else}
    <div
      class="quick-access-panel"
      style:height={`${quickAccessHeight}px`}
      bind:this={quickAccessPanel}
    >
      <QuickAccess
        {favorites}
        recentPages={recentExistingPages}
        {favoriteExists}
        {favoriteLabel}
        {displayNameFromPath}
        {folderGlyphStyle}
        {openFavorite}
        {openPageInEditor}
        {openPageInRightPane}
        {toggleFavorite}
        {moveFavorite}
        {removeRecentPage}
      />
    </div>

    <button
      type="button"
      class="quick-access-resizer"
      aria-label="Resize favorites and recent area"
      title="Resize favorites and recent area"
      on:pointerdown={startQuickAccessResize}
    ></button>

    <div class="navigator-search">
      <input
        type="search"
        bind:value={searchQuery}
        placeholder="Filter pages"
        aria-label="Filter pages"
        on:keydown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            openBestSearchMatch();
          }
        }}
      />
    </div>

    <NavigationTree
      rows={filteredRows}
      searchActive={Boolean(searchQuery.trim())}
      {expandedFolders}
      {draggedPagePath}
      {dragOverFolderPath}
      {focusedTreePath}
      {selectedPaths}
      {isActivePage}
      {isEditorPage}
      {isRightPanePage}
      {isFavorite}
      {rowPadding}
      {toggleFavorite}
      {openPageInRightPane}
      {handleNodeClick}
      {handleDragStart}
      {handleDragEnd}
      {handleFolderDragOver}
      {handleFolderDragLeave}
      {handleFolderDrop}
      {focusTreeNode}
      {handleTreeKeydown}
      {openContextMenu}
      {folderGlyphStyle}
    />

    {#if searchQuery.trim()}
      <section class="content-search-results" aria-label="Ranked search results">
        <div class="navigator-section-heading">
          <span>Ranked Matches</span>
          <small>{searchLoading ? "..." : searchResults.length}</small>
        </div>
        {#if !searchLoading && searchResults.length === 0}
          <p>No ranked matches</p>
        {:else}
          {#each searchResults as result}
            <button
              type="button"
              class="search-result"
              title={`${result.path}:${result.line}`}
              on:click={() => openSearchResult(result)}
              on:contextmenu={(event) => openSearchResultContextMenu(result, event)}
              on:keydown={(event) => openSearchResultKeyboardContextMenu(result, event)}
            >
              <span>{pageNameFromPath(result.path)}</span>
              <small>{result.path}:{result.line}</small>
              <em>{result.excerpt}</em>
            </button>
          {/each}
        {/if}
      </section>
    {/if}
  {/if}

  <NavigationContextMenu
    {contextMenu}
    selectedCount={contextSelectionCount}
    {isFavorite}
    {handleContextMenuAction}
    onClose={closeContextMenu}
    {folderSortFor}
    folderColors={$workspaceStore.folderColors}
  />

  {#if searchResultContextMenu}
    <ContextMenuShell
      x={searchResultContextMenu.x}
      y={searchResultContextMenu.y}
      onClose={closeSearchResultContextMenu}
    >
      <button
        type="button"
        role="menuitem"
        data-menu-key="e"
        on:click={() => handleSearchResultContextMenuAction("open-editor")}
      >
        Open in <span class="menu-mnemonic">e</span>ditor
      </button>
      <button
        type="button"
        role="menuitem"
        data-menu-key="r"
        on:click={() => handleSearchResultContextMenuAction("open-right")}
      >
        Open in <span class="menu-mnemonic">r</span>ight pane
      </button>
    </ContextMenuShell>
  {/if}

  {#if folderPageDialog}
    <div
      class="dialog-backdrop"
      role="presentation"
      on:mousedown={(event) => {
        if (event.currentTarget === event.target) {
          closeFolderPageDialog();
        }
      }}
    >
      <div
        class="rename-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="folder-page-dialog-title"
        tabindex="-1"
        on:keydown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            closeFolderPageDialog();
          }
        }}
      >
        <form on:submit|preventDefault={submitFolderPage}>
          <header>
            <h2 id="folder-page-dialog-title">New page</h2>
            <p>{folderPageDialog.folderPath}</p>
          </header>

          <label>
            <span>File name</span>
            <input
              bind:this={folderPageInput}
              bind:value={folderPageDialog.value}
              disabled={folderPageSubmitting}
              autocomplete="off"
              spellcheck="false"
              placeholder="Meeting notes"
            />
          </label>

          <small class="rename-hint">`.md` is optional. The page will be created in this folder.</small>

          <footer>
            <button type="button" on:click={closeFolderPageDialog} disabled={folderPageSubmitting}>
              Cancel
            </button>
            <button type="submit" class="primary-action" disabled={folderPageSubmitting}>
              {folderPageSubmitting ? "Creating..." : "Create"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  {/if}

  {#if folderDialog}
    <div
      class="dialog-backdrop"
      role="presentation"
      on:mousedown={(event) => {
        if (event.currentTarget === event.target) {
          closeFolderDialog();
        }
      }}
    >
      <div
        class="rename-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="folder-dialog-title"
        tabindex="-1"
        on:keydown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            closeFolderDialog();
          }
        }}
      >
        <form on:submit|preventDefault={submitFolder}>
          <header>
            <h2 id="folder-dialog-title">New folder</h2>
            <p>{folderDialog.parentPath || "Workspace root"}</p>
          </header>

          <label>
            <span>Folder name</span>
            <input
              bind:this={folderInput}
              bind:value={folderDialog.value}
              disabled={folderSubmitting}
              autocomplete="off"
              spellcheck="false"
              placeholder="Project alpha"
            />
          </label>

          <small class="rename-hint">The folder will be created in this location.</small>

          <footer>
            <button type="button" on:click={closeFolderDialog} disabled={folderSubmitting}>
              Cancel
            </button>
            <button type="submit" class="primary-action" disabled={folderSubmitting}>
              {folderSubmitting ? "Creating..." : "Create"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  {/if}

  {#if renameDialog}
    <div
      class="dialog-backdrop"
      role="presentation"
      on:mousedown={(event) => {
        if (event.currentTarget === event.target) {
          closeRenameDialog();
        }
      }}
    >
      <div
        class="rename-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-dialog-title"
        tabindex="-1"
        on:keydown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            closeRenameDialog();
          }
        }}
      >
        <form on:submit|preventDefault={submitRename}>
          <header>
            <h2 id="rename-dialog-title">
              Rename {renameDialog.kind === "page" ? "page" : "folder"}
            </h2>
            <p>{renameDialog.path}</p>
          </header>

          <label>
            <span>New name</span>
            <input
              bind:this={renameInput}
              bind:value={renameDialog.value}
              disabled={renameSubmitting}
              autocomplete="off"
              spellcheck="false"
            />
          </label>

          {#if renameDialog.kind === "page"}
            <small class="rename-hint">`.md` is optional. Existing wiki links will be updated.</small>
          {:else}
            <small class="rename-hint">Only the selected folder name changes. Existing wiki links will be updated.</small>
          {/if}

          <footer>
            <button type="button" on:click={closeRenameDialog} disabled={renameSubmitting}>
              Cancel
            </button>
            <button type="submit" class="primary-action" disabled={renameSubmitting}>
              {renameSubmitting ? "Renaming..." : "Rename"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  {/if}

  {#if moveDialog}
    <div
      class="dialog-backdrop"
      role="presentation"
      on:mousedown={(event) => {
        if (event.currentTarget === event.target) {
          closeMoveDialog();
        }
      }}
    >
      <div
        class="rename-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="move-dialog-title"
        tabindex="-1"
        on:keydown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            closeMoveDialog();
          }
        }}
      >
        <form on:submit|preventDefault={submitMove}>
          <header>
            <h2 id="move-dialog-title">
              {moveDialog.kind === "folder" ? "Move folder" : "Move page"}
            </h2>
            <p>{moveDialog.path}</p>
          </header>

          <label>
            <span>Target folder</span>
            <div class="move-folder-field">
              <input
                bind:this={moveInput}
                bind:value={moveDialog.targetFolder}
                disabled={moveSubmitting}
                autocomplete="off"
                spellcheck="false"
                placeholder="Leave empty for workspace root"
              />
              {#if moveFolderSuggestions.length > 0}
                <div class="move-folder-suggestions" role="listbox" aria-label="Existing folders">
                  {#each moveFolderSuggestions as folder}
                    <button
                      type="button"
                      role="option"
                      aria-selected={folder.path === moveDialog.targetFolder}
                      title={folder.label}
                      on:mousedown={(event) => event.preventDefault()}
                      on:click={() => selectMoveFolderSuggestion(folder.path)}
                    >
                      {folder.label}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          </label>

          <small class="rename-hint">
            `{moveDialog.itemName}` will be moved into this workspace-relative folder. Existing wiki links will be updated.
          </small>

          <footer>
            <button type="button" on:click={closeMoveDialog} disabled={moveSubmitting}>
              Cancel
            </button>
            <button type="submit" class="primary-action" disabled={moveSubmitting}>
              {moveSubmitting ? "Moving..." : "Move"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  {/if}

  {#if batchMoveDialog}
    <div
      class="dialog-backdrop"
      role="presentation"
      on:mousedown={(event) => {
        if (event.currentTarget === event.target) {
          closeBatchMoveDialog();
        }
      }}
    >
      <div
        class="rename-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="batch-move-dialog-title"
        tabindex="-1"
        on:keydown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            closeBatchMoveDialog();
          }
        }}
      >
        <form on:submit|preventDefault={submitBatchMove}>
          <header>
            <h2 id="batch-move-dialog-title">Move selection</h2>
            <p>{batchMoveDialog.paths.length} items selected</p>
          </header>

          <label>
            <span>Target folder</span>
            <div class="move-folder-field">
              <input
                bind:this={batchMoveInput}
                bind:value={batchMoveDialog.targetFolder}
                disabled={batchMoveSubmitting}
                autocomplete="off"
                spellcheck="false"
                placeholder="Leave empty for workspace root"
              />
              {#if batchMoveFolderSuggestions.length > 0}
                <div class="move-folder-suggestions" role="listbox" aria-label="Existing folders">
                  {#each batchMoveFolderSuggestions as folder}
                    <button
                      type="button"
                      role="option"
                      aria-selected={folder.path === batchMoveDialog.targetFolder}
                      title={folder.label}
                      on:mousedown={(event) => event.preventDefault()}
                      on:click={() => selectBatchMoveFolderSuggestion(folder.path)}
                    >
                      {folder.label}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          </label>

          <small class="rename-hint">
            Selected pages and folders will be moved into this workspace-relative folder. Existing wiki links will be updated.
          </small>

          <footer>
            <button type="button" on:click={closeBatchMoveDialog} disabled={batchMoveSubmitting}>
              Cancel
            </button>
            <button type="submit" class="primary-action" disabled={batchMoveSubmitting}>
              {batchMoveSubmitting ? "Moving..." : "Move"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  {/if}
</aside>

<ErrorDialog
  title="Semtags Error"
  message={popupError}
  onClose={closePopupError}
/>
