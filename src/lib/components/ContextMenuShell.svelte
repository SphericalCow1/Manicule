<script lang="ts">
  import { onMount } from "svelte";
  import { keepContextMenuInViewport } from "../contextMenuPosition";
  import {
    focusFirstMenuItem,
    handleContextMenuNavigation,
  } from "../contextMenuKeyboard";
  import { clickMenuMnemonic } from "../menuMnemonics";

  export let x: number;
  export let y: number;
  export let className = "context-menu";
  export let onClose: () => void;

  let menuElement: HTMLElement | null = null;

  function handleWindowKeydown(event: KeyboardEvent) {
    if (handleContextMenuNavigation(event, menuElement, onClose)) {
      return;
    }

    clickMenuMnemonic(event, menuElement);
  }

  onMount(() => {
    const frame = window.requestAnimationFrame(() => focusFirstMenuItem(menuElement));
    return () => window.cancelAnimationFrame(frame);
  });
</script>

<div
  class={className}
  use:keepContextMenuInViewport={{ x, y }}
  style:left={`${x}px`}
  style:top={`${y}px`}
  role="menu"
  tabindex="-1"
  bind:this={menuElement}
  on:keydown={handleWindowKeydown}
>
  <slot />
</div>
