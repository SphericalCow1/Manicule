<script lang="ts">
  import type { Diagnostic } from "../types";
  import type { JournalDay } from "../journals";
  import TaskListPanel from "./TaskListPanel.svelte";

  export let root: string | null = null;
  export let loading = false;
  export let diagnostics: Diagnostic[] = [];
  export let workspacePath = "";
  export let openWorkspace: () => void;
  export let chooseWorkspaceFolder: () => void;
  export let openJournal: (day: JournalDay) => void;
  export let openJournalDate: (date: string) => void | Promise<void>;
  export let taskLoading = false;
  export let taskCount = 0;
  export let openTaskOverview: () => void;

  let datePickerOpen = false;
  let pickerMonth = startOfMonth(new Date());

  $: pickerDays = calendarDays(pickerMonth);
  $: pickerMonthLabel = pickerMonth.toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });

  function toggleDatePicker(event: MouseEvent) {
    event.stopPropagation();
    datePickerOpen = !datePickerOpen;
  }

  function movePickerMonth(delta: number) {
    pickerMonth = new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() + delta, 1);
  }

  async function pickJournalDate(dateInput: string) {
    await openJournalDate(dateInput);
    datePickerOpen = false;
  }

  function startOfMonth(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function calendarDays(month: Date) {
    const firstDay = startOfMonth(month);
    const leadingDays = (firstDay.getDay() + 6) % 7;
    const firstVisibleDay = new Date(firstDay);
    firstVisibleDay.setDate(firstDay.getDate() - leadingDays);

    return Array.from({ length: 42 }, (_value, index) => {
      const date = new Date(firstVisibleDay);
      date.setDate(firstVisibleDay.getDate() + index);
      return {
        date,
        dateInput: formatDateInput(date),
        day: date.getDate(),
        currentMonth: date.getMonth() === month.getMonth(),
        today: formatDateInput(date) === formatDateInput(new Date()),
      };
    });
  }

  function formatDateInput(date: Date) {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
</script>

<svelte:window on:click={() => (datePickerOpen = false)} />

<div class="workspace-header">
  <div class="workspace-title">
    <p title={root ?? ""}>{root ?? "Open a folder to begin"}</p>
  </div>
  {#if root}
    <TaskListPanel loading={taskLoading} {taskCount} {openTaskOverview} />
  {/if}
</div>

{#if !root}
  <form class="workspace-form" on:submit|preventDefault={openWorkspace}>
    <div class="workspace-row">
      <input
        id="workspace-path"
        bind:value={workspacePath}
        placeholder="/Users/jens/Documents/Notes"
        autocomplete="off"
      />
      <div class="workspace-actions">
        <button type="submit" disabled={loading}>
          {loading ? "Opening" : "Open"}
        </button>
        <button type="button" disabled={loading} on:click={chooseWorkspaceFolder}>
          Browse
        </button>
      </div>
    </div>
  </form>
{/if}

{#if root}
  <div class="journal-actions" aria-label="Journal shortcuts">
    <button type="button" title="Yesterday" on:click={() => openJournal("yesterday")}>-1d</button>
    <button type="button" title="Today" on:click={() => openJournal("today")}>Today</button>
    <button type="button" title="Tomorrow" on:click={() => openJournal("tomorrow")}>+1d</button>
    <div class="journal-date-picker">
      <button type="button" title="Pick journal date" on:click={toggleDatePicker}>Pick</button>
      {#if datePickerOpen}
        <div class="journal-date-popover" role="dialog" aria-label="Pick journal date">
          <div class="journal-date-popover-header">
            <button
              type="button"
              title="Previous month"
              on:click|stopPropagation={() => movePickerMonth(-1)}
            >
              &lt;
            </button>
            <span>{pickerMonthLabel}</span>
            <button
              type="button"
              title="Next month"
              on:click|stopPropagation={() => movePickerMonth(1)}
            >
              &gt;
            </button>
          </div>
          <div class="journal-date-weekdays" aria-hidden="true">
            <span>Mo</span>
            <span>Tu</span>
            <span>We</span>
            <span>Th</span>
            <span>Fr</span>
            <span>Sa</span>
            <span>Su</span>
          </div>
          <div class="journal-date-grid">
            {#each pickerDays as day}
              <button
                type="button"
                class:outside-month={!day.currentMonth}
                class:today={day.today}
                title={day.dateInput}
                on:click|stopPropagation={() => pickJournalDate(day.dateInput)}
              >
                {day.day}
              </button>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

{#if diagnostics.length > 0}
  <div class="diagnostics">
    {#each diagnostics as diagnostic}
      <div class="message warning">{diagnostic.message}</div>
    {/each}
  </div>
{/if}
