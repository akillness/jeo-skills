"use client"

import * as React from "react"
import {
  Drawer,
  DrawerBackdrop,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from "@ui-sdk/react/drawer"
import { MinusIcon, PlusIcon } from "lucide-react"
const goal = { initial: 350, min: 200, max: 400, step: 10 }

function Example() {
  const [calories, setCalories] = React.useState(goal.initial)
  return (
    <Drawer>
      <DrawerTrigger>Open Drawer</DrawerTrigger>
      <DrawerBackdrop />
      <DrawerContent>
        <div data-slot="grip" aria-hidden />

        <div data-slot="stack">
          <DrawerTitle>Move goal</DrawerTitle>
          <DrawerDescription>Set your daily activity goal.</DrawerDescription>
        </div>

        <div data-slot="row">
          <button
            type="button"
            aria-label="Decrease"
            disabled={calories <= goal.min}
            onClick={() => setCalories(calories - goal.step)}
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
            onClick={() => setCalories(calories + goal.step)}
          >
            <PlusIcon aria-hidden="true" />
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
