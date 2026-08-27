<script lang="ts">
  import { trapDialogFocus } from "../dialogFocus";

  export let title = "Error";
  export let message: string | null = null;
  export let onClose: () => void;
  export let primaryActionLabel: string | null = null;
  export let onPrimaryAction: (() => void) | null = null;
  export let secondaryActionLabel: string | null = null;
  export let onSecondaryAction: (() => void) | null = null;
</script>

{#if message}
  <div
    class="dialog-backdrop"
    role="presentation"
    on:mousedown={(event) => {
      if (event.currentTarget === event.target) {
        onClose();
      }
    }}
  >
    <div
      class="rename-dialog error-dialog"
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
      tabindex="-1"
      use:trapDialogFocus={{ onClose }}
    >
      <header>
        <h2>{title}</h2>
        <p>{message}</p>
      </header>
      <div class="dialog-actions">
        {#if secondaryActionLabel && onSecondaryAction}
          <button type="button" on:click={onSecondaryAction}>{secondaryActionLabel}</button>
        {/if}
        {#if primaryActionLabel && onPrimaryAction}
          <button type="button" class="primary-action" on:click={onPrimaryAction}>
            {primaryActionLabel}
          </button>
        {/if}
        <button type="button" on:click={onClose}>Close</button>
      </div>
    </div>
  </div>
{/if}
