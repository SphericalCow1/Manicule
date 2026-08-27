<script lang="ts">
  import { keepContextMenuInViewport } from "../contextMenuPosition";
  import { clickMenuMnemonic } from "../menuMnemonics";

  export let x: number;
  export let y: number;
  export let className = "context-menu";
  export let onClose: () => void;

  let menuElement: HTMLElement | null = null;

  function handleWindowKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    clickMenuMnemonic(event, menuElement);
  }
</script>

<svelte:window on:keydown={handleWindowKeydown} />

<div
  class={className}
  use:keepContextMenuInViewport={{ x, y }}
  style:left={`${x}px`}
  style:top={`${y}px`}
  role="menu"
  tabindex="-1"
  bind:this={menuElement}
>
  <slot />
</div>
