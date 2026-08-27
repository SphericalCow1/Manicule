<script lang="ts">
  export let loading = false;
  export let taskCount = 0;
  export let openTaskOverview: () => void;
</script>

<section class="task-list-panel" aria-label="Tasks">
  <div class="navigator-section-heading">
    <span>Tasks</span>
    <small>{loading ? "..." : taskCount}</small>
  </div>
  <button type="button" class="task-overview-link" on:click={openTaskOverview}>
    Show Task Overview
  </button>
</section>
