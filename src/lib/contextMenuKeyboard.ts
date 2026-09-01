const FLYOUT_CONFIGS = [
  {
    triggerClass: "editor-menu-flyout-trigger",
    flyoutClass: "editor-menu-flyout",
    openClass: "editor-menu-flyout-open",
    panelClass: "editor-menu-flyout-panel",
  },
  {
    triggerClass: "context-menu-flyout-trigger",
    flyoutClass: "context-menu-flyout",
    openClass: "context-menu-flyout-open",
    panelClass: "context-menu-flyout-panel",
  },
] as const;

type NavigationDirection = "ArrowDown" | "ArrowUp" | "Home" | "End";

export function nextEnabledMenuIndex(
  enabledItems: readonly boolean[],
  currentIndex: number,
  direction: NavigationDirection,
) {
  if (enabledItems.length === 0 || !enabledItems.some(Boolean)) {
    return -1;
  }

  if (direction === "Home") {
    return enabledItems.findIndex(Boolean);
  }

  if (direction === "End") {
    for (let index = enabledItems.length - 1; index >= 0; index -= 1) {
      if (enabledItems[index]) {
        return index;
      }
    }
    return -1;
  }

  const step = direction === "ArrowDown" ? 1 : -1;
  let index = currentIndex >= 0 ? currentIndex : step > 0 ? -1 : 0;

  for (let attempts = 0; attempts < enabledItems.length; attempts += 1) {
    index = (index + step + enabledItems.length) % enabledItems.length;
    if (enabledItems[index]) {
      return index;
    }
  }

  return -1;
}

export function focusFirstMenuItem(root: HTMLElement | null) {
  if (!root) {
    return false;
  }

  const first = menuButtons(root).find((button) => !button.disabled);
  (first ?? root).focus({ preventScroll: true });
  return Boolean(first);
}

export function handleContextMenuNavigation(
  event: KeyboardEvent,
  root: HTMLElement | null,
  onClose: () => void,
) {
  if (!root) {
    return false;
  }

  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const activeMenu = activeElement?.closest<HTMLElement>("[role='menu']");
  const menu = activeMenu && root.contains(activeMenu) ? activeMenu : root;
  const buttons = menuButtons(menu);
  const currentIndex = activeElement
    ? buttons.findIndex((button) => button === activeElement || button.contains(activeElement))
    : -1;

  if (isNavigationDirection(event.key)) {
    const targetIndex = nextEnabledMenuIndex(
      buttons.map((button) => !button.disabled),
      currentIndex,
      event.key,
    );
    if (targetIndex < 0) {
      return false;
    }

    consume(event);
    focusMenuButton(root, buttons[targetIndex]);
    return true;
  }

  if (event.key === "ArrowRight") {
    const current = buttons[currentIndex];
    if (!current || !openMenuFlyout(root, current)) {
      return false;
    }

    consume(event);
    return true;
  }

  if (event.key === "ArrowLeft") {
    const parentFlyout = menu.closest<HTMLElement>(
      ".editor-menu-flyout, .context-menu-flyout",
    );
    if (!parentFlyout || !root.contains(parentFlyout)) {
      return false;
    }

    consume(event);
    closeMenuFlyout(parentFlyout);
    flyoutTrigger(parentFlyout)?.focus({ preventScroll: true });
    return true;
  }

  if (event.key === "Escape") {
    consume(event);
    const parentFlyout = menu.closest<HTMLElement>(
      ".editor-menu-flyout, .context-menu-flyout",
    );
    if (parentFlyout && root.contains(parentFlyout)) {
      closeMenuFlyout(parentFlyout);
      flyoutTrigger(parentFlyout)?.focus({ preventScroll: true });
    } else {
      onClose();
    }
    return true;
  }

  if (event.key === "Enter" || event.key === " ") {
    const current = buttons[currentIndex];
    if (!current || current.disabled) {
      return false;
    }

    consume(event);
    if (!openMenuFlyout(root, current)) {
      current.click();
    }
    return true;
  }

  return false;
}

export function openMenuFlyout(root: HTMLElement, trigger: HTMLButtonElement) {
  const config = FLYOUT_CONFIGS.find(({ triggerClass }) =>
    trigger.classList.contains(triggerClass),
  );
  if (!config) {
    return false;
  }

  const flyout = trigger.closest<HTMLElement>(`.${config.flyoutClass}`);
  if (!flyout) {
    return false;
  }

  root.querySelectorAll<HTMLElement>(`.${config.openClass}`).forEach((openFlyout) => {
    if (openFlyout !== flyout && !openFlyout.contains(flyout)) {
      openFlyout.classList.remove(config.openClass);
    }
  });
  flyout.classList.add(config.openClass);

  const panel = flyout.querySelector<HTMLElement>(`.${config.panelClass}`);
  focusFirstMenuItem(panel);
  return true;
}

function menuButtons(menu: HTMLElement) {
  return Array.from(menu.querySelectorAll<HTMLElement>("[role='menuitem']"))
    .filter((item) => item.closest<HTMLElement>("[role='menu']") === menu)
    .map(menuItemButton)
    .filter((button): button is HTMLButtonElement => Boolean(button));
}

function menuItemButton(item: HTMLElement) {
  if (item instanceof HTMLButtonElement) {
    return item;
  }

  return Array.from(item.children).find(
    (child): child is HTMLButtonElement => child instanceof HTMLButtonElement,
  );
}

function focusMenuButton(root: HTMLElement, button: HTMLButtonElement) {
  if (!button.closest(".editor-menu-flyout-panel, .context-menu-flyout-panel")) {
    closeOpenFlyouts(root);
  }
  button.focus({ preventScroll: true });
}

function closeOpenFlyouts(root: HTMLElement) {
  for (const { openClass } of FLYOUT_CONFIGS) {
    root
      .querySelectorAll<HTMLElement>(`.${openClass}`)
      .forEach((flyout) => flyout.classList.remove(openClass));
  }
}

function closeMenuFlyout(flyout: HTMLElement) {
  for (const { openClass } of FLYOUT_CONFIGS) {
    flyout.classList.remove(openClass);
  }
}

function flyoutTrigger(flyout: HTMLElement) {
  return Array.from(flyout.children).find(
    (child): child is HTMLButtonElement =>
      child instanceof HTMLButtonElement &&
      FLYOUT_CONFIGS.some(({ triggerClass }) => child.classList.contains(triggerClass)),
  );
}

function isNavigationDirection(key: string): key is NavigationDirection {
  return key === "ArrowDown" || key === "ArrowUp" || key === "Home" || key === "End";
}

function consume(event: KeyboardEvent) {
  event.preventDefault();
  event.stopPropagation();
}
