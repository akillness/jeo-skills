// @vitest-environment jsdom
// Every component, after every option and prop it takes has changed, and
// again unmounted while open, leaves the page as it found it.
import { describe, expect, test } from "vitest"
import { schemaOf } from "../src/foundation/kernel/primitive"
import type { Primitive } from "../src/foundation/kernel/primitive-types"
import { rerenderOf } from "../src/testing/mount"
import { cases, type Case } from "./after-mount.cases"
import {
  afterTimers,
  exercise,
  framesDuring,
  idle,
  running,
  timerMark,
} from "./lifecycle"

async function cycle(entry: Case) {
  const view = await exercise(entry)
  if ("open" in (schemaOf(entry.primitive as Primitive).options ?? {})) {
    rerenderOf(view).setOptions({ open: true })
    await view.settle()
  }
  view.unmount()
  await idle()
}

for (const entry of cases) {
  describe(entry.name, () => {
    test("leaves nothing running after it unmounts", async () => {
      await cycle(entry)
      const before = running()
      const mark = timerMark()
      await cycle(entry)
      expect(await afterTimers(mark)).toEqual({ changed: [], warned: [] })
      expect(running(mark)).toEqual({ ...before, timers: [] })
      expect(await framesDuring(idle)).toBe(6)
    })
  })
}
