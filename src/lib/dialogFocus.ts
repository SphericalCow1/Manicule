type DialogFocusOptions = {
  onClose?: () => void;
  returnFocus?: HTMLElement | null | (() => HTMLElement | null);
};

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function trapDialogFocus(node: HTMLElement, options: DialogFocusOptions = {}) {
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  function focusFirstElement() {
    const first = focusableElements()[0];
    (first ?? node).focus({ preventScroll: true });
  }

  function focusableElements() {
    return Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (element) => element.offsetParent !== null || element === document.activeElement,
    );
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      options.onClose?.();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusable = focusableElements();
    if (focusable.length === 0) {
      event.preventDefault();
      node.focus({ preventScroll: true });
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  }

  const frame = window.requestAnimationFrame(focusFirstElement);
  node.addEventListener("keydown", handleKeydown);

  return {
    update(nextOptions: DialogFocusOptions = {}) {
      options = nextOptions;
    },
    destroy() {
      window.cancelAnimationFrame(frame);
      node.removeEventListener("keydown", handleKeydown);
      const explicitReturnFocus =
        typeof options.returnFocus === "function" ? options.returnFocus() : options.returnFocus;
      resolveDialogReturnFocus(explicitReturnFocus ?? null, previousFocus)?.focus({
        preventScroll: true,
      });
    },
  };
}

export function resolveDialogReturnFocus(
  explicitTarget: HTMLElement | null,
  previousTarget: HTMLElement | null,
) {
  if (explicitTarget?.isConnected) {
    return explicitTarget;
  }

  if (previousTarget?.isConnected) {
    return previousTarget;
  }

  return null;
}
