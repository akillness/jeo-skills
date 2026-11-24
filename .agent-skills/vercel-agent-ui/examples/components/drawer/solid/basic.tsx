import {
  Drawer,
  DrawerBackdrop,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from "@ui-sdk/solid/drawer"
import { createSignal } from "solid-js"
const goal = { initial: 350, min: 200, max: 400, step: 10 }

function Example() {
  const [calories, setCalories] = createSignal(goal.initial)
  return (
    <Drawer>
      <DrawerTrigger>Open Drawer</DrawerTrigger>
      <DrawerBackdrop />
      <DrawerContent>
        <div data-slot="grip" aria-hidden="true" />

        <div data-slot="stack">
          <DrawerTitle>Move goal</DrawerTitle>
          <DrawerDescription>Set your daily activity goal.</DrawerDescription>
        </div>

        <div data-slot="row">
          <button
            type="button"
            aria-label="Decrease"
            disabled={calories() <= goal.min}
            onClick={() => setCalories(calories() - goal.step)}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h14" />
            </svg>
          </button>
          <div data-slot="stack">
            <div aria-live="polite">{calories()}</div>
            <div data-slot="hint">Calories/day</div>
          </div>
          <button
            type="button"
            aria-label="Increase"
            disabled={calories() >= goal.max}
            onClick={() => setCalories(calories() + goal.step)}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h14" />
              <path d="M12 5v14" />
            </svg>
          </button>
        </div>

        <div data-slot="stack">
          <DrawerClose data-variant="solid" value="submit">
            Submit
          </DrawerClose>
          <DrawerClose>Cancel</DrawerClose>
        </div>
      </DrawerContent>
    </Drawer>
  )
}

export { Example }
