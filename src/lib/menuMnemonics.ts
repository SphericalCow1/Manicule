export function clickMenuMnemonic(event: KeyboardEvent, root: HTMLElement | null) {
  if (!root || event.altKey || event.ctrlKey || event.metaKey || event.key.length !== 1) {
    return false;
  }

  const key = event.key.toLocaleLowerCase();
  const openFlyoutPanel = root.querySelector<HTMLElement>(
    ".editor-menu-flyout-open .editor-menu-flyout-panel, .context-menu-flyout-open .context-menu-flyout-panel",
  );
  const candidateRoot = openFlyoutPanel ?? root;
  const candidates = Array.from(candidateRoot.querySelectorAll<HTMLButtonElement>("button[data-menu-key]"));
  const match = candidates.find(
    (button) =>
      !button.disabled &&
      (button.dataset.menuKey ?? "")
        .split(/\s+/)
        .some((candidate) => candidate.toLocaleLowerCase() === key),
  );

  if (!match) {
    return false;
  }

  event.preventDefault();
  event.stopPropagation();

  const flyoutClass = match.classList.contains("editor-menu-flyout-trigger")
    ? "editor-menu-flyout"
    : match.classList.contains("context-menu-flyout-trigger")
      ? "context-menu-flyout"
      : null;

  if (flyoutClass) {
    const openClass = `${flyoutClass}-open`;
    const panelClass = `${flyoutClass}-panel`;
    const flyout = match.closest<HTMLElement>(`.${flyoutClass}`);
    root
      .querySelectorAll<HTMLElement>(`.${openClass}`)
      .forEach((openFlyout) => {
        if (openFlyout !== flyout) {
          openFlyout.classList.remove(openClass);
        }
      });

    flyout?.classList.add(openClass);
    const firstSubmenuItem = flyout?.querySelector<HTMLButtonElement>(
      `.${panelClass} button[data-menu-key]:not(:disabled)`,
    );

    (firstSubmenuItem ?? match).focus({ preventScroll: true });
    return true;
  }

  match.focus({ preventScroll: true });
  match.click();
  return true;
}
