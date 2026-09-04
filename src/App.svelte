<script lang="ts">
  import { getVersion } from "@tauri-apps/api/app";
  import { onDestroy, onMount } from "svelte";
  import welcomeIllustration from "../assets/branding/manicule-workflow-illustration.png";
  import EditorPane from "./lib/components/EditorPane.svelte";
  import ErrorDialog from "./lib/components/ErrorDialog.svelte";
  import FileTree from "./lib/components/FileTree.svelte";
  import RightPane from "./lib/components/RightPane.svelte";
  import TaskOverview from "./lib/components/TaskOverview.svelte";
  import { setWindowTitle } from "./lib/api";
  import { setupCoreEvents } from "./lib/coreEvents";
  import { trapDialogFocus } from "./lib/dialogFocus";
  import { journalPath } from "./lib/journals";
  import { keyboardShortcuts } from "./lib/keyboardShortcuts";
  import { appErrorStore, runUserAction } from "./lib/stores/appErrors";
  import { editorSessionStore } from "./lib/stores/editorSession";
  import { mainViewStore } from "./lib/stores/mainView";
  import { rightPaneStore } from "./lib/stores/rightPane";
  import { workspaceStore } from "./lib/stores/workspace";
  import { zoomStore } from "./lib/stores/zoom";

  const layoutStorageKey = "manicule:layout:columns";
  const defaultLeftWidth = 280;
  const defaultRightWidth = 440;
  const minLeftWidth = 220;
  const minEditorWidth = 360;
  const minRightWidth = 280;
  const repositoryUrl = "https://github.com/SphericalCow1/Manicule";
  const licenseUrl = `${repositoryUrl}/blob/main/LICENSE`;
  let leftWidth = defaultLeftWidth;
  let rightWidth = defaultRightWidth;
  let activeResize: "left" | "right" | null = null;
  let showAbout = false;
  let showKeyboardShortcuts = false;
  let appVersion = "0.1.0";
  let sessionRestoreRoot: string | null = null;
  let restoringWorkspaceSession = false;
  let lastSavedSessionKey = "";
  let lastWindowTitle = "";
  let sessionSaveTimer: ReturnType<typeof setTimeout> | null = null;
  let isStarting = true;

  onMount(() => {
    void initializeApp();
    loadLayout();
    window.addEventListener("manicule-reset-layout", resetLayout);
    window.addEventListener("manicule-show-about", openAboutDialog);
    window.addEventListener("manicule-show-keyboard-shortcuts", openKeyboardShortcutsDialog);
    window.addEventListener("wheel", handleWheel, { passive: false });
  });

  async function initializeApp() {
    await Promise.all([
      runUserAction("Could not initialize native application events", setupCoreEvents),
      workspaceStore.openLastWorkspace(),
      loadAppVersion(),
    ]);
    isStarting = false;
  }

  $: gridTemplateColumns = `${leftWidth}px 6px minmax(${minEditorWidth}px, 1fr) 6px ${rightWidth}px`;
  $: if ($workspaceStore.root !== sessionRestoreRoot) {
    sessionRestoreRoot = $workspaceStore.root;
    void restoreWorkspaceSession();
  }
  $: scheduleWorkspaceSessionSave(
    $workspaceStore.root,
    $editorSessionStore.path,
    $rightPaneStore.path,
  );
  $: updateWindowTitle($workspaceStore.root);

  function loadLayout() {
    try {
      const stored = localStorage.getItem(layoutStorageKey);
      const parsed = stored ? JSON.parse(stored) : null;

      if (typeof parsed?.leftWidth === "number") {
        leftWidth = parsed.leftWidth;
      }

      if (typeof parsed?.rightWidth === "number") {
        rightWidth = parsed.rightWidth;
      }

      clampLayout(window.innerWidth);
    } catch {
      clampLayout(window.innerWidth);
    }
  }

  async function loadAppVersion() {
    try {
      appVersion = await getVersion();
    } catch {
      appVersion = "0.1.0";
    }
  }

  function updateWindowTitle(root: string | null) {
    const title = root ? `Manicule: ${root}` : "Manicule";
    if (title === lastWindowTitle) {
      return;
    }

    lastWindowTitle = title;
    void runUserAction("Could not update the application window title", () =>
      setWindowTitle(title),
    );
  }

  function openAboutDialog() {
    showAbout = true;
  }

  function closeAboutDialog() {
    showAbout = false;
  }

  function openKeyboardShortcutsDialog() {
    showKeyboardShortcuts = true;
  }

  function closeKeyboardShortcutsDialog() {
    showKeyboardShortcuts = false;
  }

  function persistLayout() {
    localStorage.setItem(layoutStorageKey, JSON.stringify({ leftWidth, rightWidth }));
  }

  function resetLayout() {
    leftWidth = defaultLeftWidth;
    rightWidth = defaultRightWidth;
    clampLayout(window.innerWidth);
    persistLayout();
  }

  function clampLayout(totalWidth: number) {
    const available = Math.max(totalWidth - 12, minLeftWidth + minEditorWidth + minRightWidth);
    leftWidth = Math.max(minLeftWidth, Math.min(leftWidth, available - minEditorWidth - minRightWidth));
    rightWidth = Math.max(
      minRightWidth,
      Math.min(rightWidth, available - minEditorWidth - leftWidth),
    );
  }

  function startResize(target: "left" | "right", event: PointerEvent) {
    activeResize = target;
    event.preventDefault();
    window.addEventListener("pointermove", resizeColumns);
    window.addEventListener("pointerup", stopResize, { once: true });
  }

  function resizeColumns(event: PointerEvent) {
    if (!activeResize) {
      return;
    }

    const available = window.innerWidth - 12;

    if (activeResize === "left") {
      leftWidth = event.clientX;
    } else {
      rightWidth = window.innerWidth - event.clientX;
    }

    clampLayout(available + 12);
  }

  function stopResize() {
    activeResize = null;
    window.removeEventListener("pointermove", resizeColumns);
    persistLayout();
  }

  async function restoreWorkspaceSession() {
    clearWorkspaceSessionSaveTimer();
    restoringWorkspaceSession = true;

    try {
      if (!$workspaceStore.root) {
        lastSavedSessionKey = "";
        return;
      }

      const editorPath = await ensureTodayJournalPage();
      const rightPanePath = $workspaceStore.lastRightPanePath;
      lastSavedSessionKey = workspaceSessionKey($workspaceStore.root, editorPath, rightPanePath);

      mainViewStore.set("editor");
      await editorSessionStore.open(editorPath, { recordHistory: false });

      if (rightPanePath) {
        await rightPaneStore.open(rightPanePath, { recordHistory: false });
      }
    } finally {
      restoringWorkspaceSession = false;
    }
  }

  async function ensureTodayJournalPage() {
    const path = journalPath();
    const existingPage = $workspaceStore.pages.find(
      (page) => page.path.toLocaleLowerCase() === path.toLocaleLowerCase(),
    );

    if (existingPage) {
      return existingPage.path;
    }

    const page = await workspaceStore.createPage(path);
    return page?.path ?? path;
  }

  function scheduleWorkspaceSessionSave(
    root: string | null,
    editorPath: string | null,
    rightPanePath: string | null,
  ) {
    if (!root || restoringWorkspaceSession) {
      return;
    }

    const sessionKey = workspaceSessionKey(root, editorPath, rightPanePath);
    if (sessionKey === lastSavedSessionKey) {
      return;
    }

    clearWorkspaceSessionSaveTimer();
    sessionSaveTimer = setTimeout(() => {
      sessionSaveTimer = null;
      lastSavedSessionKey = sessionKey;
      void workspaceStore.saveWorkspaceSession(editorPath, rightPanePath);
    }, 300);
  }

  function clearWorkspaceSessionSaveTimer() {
    if (sessionSaveTimer) {
      clearTimeout(sessionSaveTimer);
      sessionSaveTimer = null;
    }
  }

  function workspaceSessionKey(
    root: string | null,
    editorPath: string | null,
    rightPanePath: string | null,
  ) {
    return JSON.stringify({ root, editorPath, rightPanePath });
  }

  function handleWheel(event: WheelEvent) {
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }

    event.preventDefault();

    if (event.deltaY < 0) {
      zoomStore.zoomIn();
    } else if (event.deltaY > 0) {
      zoomStore.zoomOut();
    }
  }

  onDestroy(() => {
    clearWorkspaceSessionSaveTimer();
    window.removeEventListener("pointermove", resizeColumns);
    window.removeEventListener("manicule-reset-layout", resetLayout);
    window.removeEventListener("manicule-show-about", openAboutDialog);
    window.removeEventListener("manicule-show-keyboard-shortcuts", openKeyboardShortcutsDialog);
    window.removeEventListener("wheel", handleWheel);
  });
</script>

<svelte:window on:resize={() => clampLayout(window.innerWidth)} />

{#if isStarting || restoringWorkspaceSession}
  <main class="welcome-screen" aria-label="Loading Manicule">
    <div class="welcome-copy">
      <p class="welcome-kicker">Manicule</p>
      <h1>Your Markdown workspace</h1>
      <p>Opening your workspace…</p>
    </div>
    <img
      class="welcome-illustration"
      src={welcomeIllustration}
      alt="A friendly octopus connecting notes and tasks"
    />
  </main>
{:else}
  <main
    class:resizing={activeResize !== null}
    class="app-shell"
    style:grid-template-columns={gridTemplateColumns}
    style:--app-font-size={`${14 * $zoomStore}px`}
  >
    <FileTree />
    <button
      type="button"
      class="column-resizer"
      aria-label="Resize file tree"
      title="Drag to resize. Double-click to reset columns."
      on:pointerdown={(event) => startResize("left", event)}
      on:dblclick={resetLayout}
    ></button>
    {#if $mainViewStore === "tasks"}
      <TaskOverview />
    {:else}
      <EditorPane />
    {/if}
    <button
      type="button"
      class="column-resizer"
      aria-label="Resize right pane"
      title="Drag to resize. Double-click to reset columns."
      on:pointerdown={(event) => startResize("right", event)}
      on:dblclick={resetLayout}
    ></button>
    <RightPane />
  </main>
{/if}

<ErrorDialog
  title="Manicule Error"
  message={$appErrorStore.message}
  detail={$appErrorStore.detail}
  onClose={() => appErrorStore.clear()}
/>

{#if showAbout}
  <div
    class="dialog-backdrop"
    role="presentation"
    on:mousedown={(event) => {
      if (event.currentTarget === event.target) {
        closeAboutDialog();
      }
    }}
  >
    <div
      class="about-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-dialog-title"
      tabindex="-1"
      use:trapDialogFocus={{ onClose: closeAboutDialog }}
    >
      <header>
        <h2 id="about-dialog-title">Manicule</h2>
        <p>Version {appVersion}</p>
      </header>

      <div class="about-dialog-body">
        <p>A local Markdown-based knowledge workspace for notes and tasks using backlinks as semantic tags.</p>
        <dl>
          <div>
            <dt>Repository</dt>
            <dd>
              <a href={repositoryUrl} target="_blank" rel="noreferrer">
                SphericalCow1/Manicule
              </a>
            </dd>
          </div>
          <div>
            <dt>License</dt>
            <dd>
              <a href={licenseUrl} target="_blank" rel="noreferrer">
                GNU Affero General Public License v3.0 (AGPL-3.0)
              </a>
            </dd>
          </div>
        </dl>
        <p class="about-disclaimer">
          Manicule is provided as is, without warranty of any kind. To the extent permitted by law,
          the authors are not liable for damages arising from use of the software.
        </p>
      </div>

      <footer>
        <button type="button" class="primary-action" on:click={closeAboutDialog}>Close</button>
      </footer>
    </div>
  </div>
{/if}

{#if showKeyboardShortcuts}
  <div
    class="dialog-backdrop"
    role="presentation"
    on:mousedown={(event) => {
      if (event.currentTarget === event.target) {
        closeKeyboardShortcutsDialog();
      }
    }}
  >
    <div
      class="about-dialog shortcuts-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-dialog-title"
      tabindex="-1"
      use:trapDialogFocus={{ onClose: closeKeyboardShortcutsDialog }}
    >
      <header>
        <h2 id="shortcuts-dialog-title">Keyboard Shortcuts</h2>
        <p>Core editor and workspace shortcuts.</p>
      </header>

      <div class="about-dialog-body">
        <dl class="shortcut-list">
          {#each keyboardShortcuts as shortcut}
            <div>
              <dt><kbd>{shortcut.keys}</kbd></dt>
              <dd>{shortcut.description}</dd>
            </div>
          {/each}
        </dl>
      </div>

      <footer>
        <button type="button" class="primary-action" on:click={closeKeyboardShortcutsDialog}>
          Close
        </button>
      </footer>
    </div>
  </div>
{/if}
