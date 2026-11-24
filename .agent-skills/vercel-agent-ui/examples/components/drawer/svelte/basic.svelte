<script lang="ts">
  import { MinusIcon, PlusIcon } from "@lucide/svelte"
  import {
    Drawer,
    DrawerBackdrop,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerTitle,
    DrawerTrigger,
  } from "@ui-sdk/svelte/drawer"
  const goal = { initial: 350, min: 200, max: 400, step: 10 }

  let calories = $state(goal.initial)
</script>

<Drawer>
  <DrawerTrigger>Open Drawer</DrawerTrigger>
  <DrawerBackdrop />
  <DrawerContent>
    <div data-slot="grip" aria-hidden="true"></div>

    <div data-slot="stack">
      <DrawerTitle>Move goal</DrawerTitle>
      <DrawerDescription>Set your daily activity goal.</DrawerDescription>
    </div>

    <div data-slot="row">
      <button
        type="button"
        aria-label="Decrease"
        disabled={calories <= goal.min}
        onclick={() => (calories -= goal.step)}
      >
        <MinusIcon aria-hidden="true" />
      </button>
      <div data-slot="stack">
        <div aria-live="polite">{calories}</div>
        <div data-slot="hint">Calories/day</div>
      </div>
      <button
        type="button"
        aria-label="Increase"
        disabled={calories >= goal.max}
        onclick={() => (calories += goal.step)}
      >
        <PlusIcon aria-hidden="true" />
      </button>
    </div>

    <div data-slot="stack">
      <DrawerClose data-variant="solid" value="submit">Submit</DrawerClose>
      <DrawerClose>Cancel</DrawerClose>
    </div>
  </DrawerContent>
</Drawer>
