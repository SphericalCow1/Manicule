type ContextMenuPosition = {
  x: number;
  y: number;
  margin?: number;
};

const DEFAULT_MARGIN = 8;

export function keepContextMenuInViewport(
  node: HTMLElement,
  position: ContextMenuPosition,
) {
  let frame = 0;
  let current = position;

  function clampMenu() {
    const margin = current.margin ?? DEFAULT_MARGIN;
    node.style.left = `${current.x}px`;
    node.style.top = `${current.y}px`;

    frame = window.requestAnimationFrame(() => {
      const rect = node.getBoundingClientRect();
      const left = clamp(current.x, margin, Math.max(margin, window.innerWidth - rect.width - margin));
      const top = clamp(current.y, margin, Math.max(margin, window.innerHeight - rect.height - margin));

      node.style.left = `${left}px`;
      node.style.top = `${top}px`;
      orientVisibleFlyouts();
    });
  }

  function orientVisibleFlyouts() {
    node.querySelectorAll<HTMLElement>(".editor-menu-flyout").forEach(orientFlyout);
    node.querySelectorAll<HTMLElement>(".context-menu-flyout").forEach(orientFlyout);
  }

  function orientFlyout(flyout: HTMLElement) {
    const isContextFlyout = flyout.classList.contains("context-menu-flyout");
    const panel = flyout.querySelector<HTMLElement>(
      isContextFlyout ? ".context-menu-flyout-panel" : ".editor-menu-flyout-panel",
    );
    if (!panel) {
      return;
    }

    const margin = current.margin ?? DEFAULT_MARGIN;
    flyout.classList.remove("editor-menu-flyout-left");
    flyout.classList.remove("context-menu-flyout-left");
    panel.style.removeProperty("--flyout-top");

    const triggerRect = flyout.getBoundingClientRect();
    const panelSize = measurePanel(panel);
    const panelWidth = panelSize.width || (isContextFlyout ? 180 : 140);
    const panelHeight = panelSize.height || 0;
    const canOpenRight = triggerRect.right + panelWidth <= window.innerWidth - margin;
    const canOpenLeft = triggerRect.left - panelWidth >= margin;

    if (!canOpenRight && canOpenLeft) {
      flyout.classList.add(isContextFlyout ? "context-menu-flyout-left" : "editor-menu-flyout-left");
    }

    if (panelHeight > 0) {
      const defaultPanelTop = triggerRect.top - 6;
      const minTop = margin;
      const maxTop = window.innerHeight - margin - panelHeight;
      const clampedTop = clamp(defaultPanelTop, minTop, Math.max(minTop, maxTop));
      panel.style.setProperty("--flyout-top", `${clampedTop - triggerRect.top}px`);
    }
  }

  function measurePanel(panel: HTMLElement) {
    const wasHidden = window.getComputedStyle(panel).display === "none";
    const previousDisplay = panel.style.display;
    const previousVisibility = panel.style.visibility;
    const previousPointerEvents = panel.style.pointerEvents;

    if (wasHidden) {
      panel.style.display = "grid";
      panel.style.visibility = "hidden";
      panel.style.pointerEvents = "none";
    }

    const size = {
      width: panel.offsetWidth,
      height: panel.offsetHeight,
    };

    if (wasHidden) {
      panel.style.display = previousDisplay;
      panel.style.visibility = previousVisibility;
      panel.style.pointerEvents = previousPointerEvents;
    }

    return size;
  }

  function handleFlyoutIntent(event: Event) {
    const flyout = (event.target as HTMLElement | null)?.closest<HTMLElement>(
      ".editor-menu-flyout, .context-menu-flyout",
    );

    if (flyout && node.contains(flyout)) {
      window.requestAnimationFrame(() => orientFlyout(flyout));
    }
  }

  clampMenu();
  node.addEventListener("pointerover", handleFlyoutIntent);
  node.addEventListener("focusin", handleFlyoutIntent);
  window.addEventListener("resize", clampMenu);

  return {
    update(nextPosition: ContextMenuPosition) {
      current = nextPosition;
      window.cancelAnimationFrame(frame);
      clampMenu();
    },
    destroy() {
      window.cancelAnimationFrame(frame);
      node.removeEventListener("pointerover", handleFlyoutIntent);
      node.removeEventListener("focusin", handleFlyoutIntent);
      window.removeEventListener("resize", clampMenu);
    },
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
