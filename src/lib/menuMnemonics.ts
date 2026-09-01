import { openMenuFlyout } from "./contextMenuKeyboard.js";

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

  if (openMenuFlyout(root, match)) {
    return true;
  }

  match.focus({ preventScroll: true });
  match.click();
  return true;
}
