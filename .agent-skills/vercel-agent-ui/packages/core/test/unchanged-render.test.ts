// @vitest-environment jsdom
// A render that changes nothing, after every option and prop change, tells no
// subscriber, so no framework renders again, and writes nothing to the page.
import { describe, expect, test } from "vitest"
import { rerenderOf } from "../src/testing/mount"
import { schemaOf } from "../src/foundation/kernel/primitive"
import type { Primitive } from "../src/foundation/kernel/primitive-types"
import { kindOf } from "../src/testing/schema"
import { cases, type Case } from "./after-mount.cases"
import { exercise, framesDuring, idle } from "./lifecycle"

// Callbacks written inline are new functions on every render.
function callbacks(entry: Case) {
  const options = schemaOf(entry.primitive as Primitive).options ?? {}
  return Object.fromEntries(
    Object.keys(options)
      .filter(
        (key) =>
          kindOf(options[key]) === "callback" && !(key in (entry.options ?? {}))
      )
      .map((key) => [key, () => {}])
  )
}

for (const entry of cases) {
  describe(entry.name, () => {
    test("does nothing when rendered again unchanged", async () => {
      const work: string[] = []
      const inline = callbacks(entry)
      const view = await exercise(
        entry,
        async ({ view, instance }, step) => {
          let told = 0
          const stop = instance.subscribe(() => told++)
          const records: MutationRecord[] = []
          const observer = new MutationObserver((list) => records.push(...list))
          observer.observe(document, {
            subtree: true,
            childList: true,
            attributes: true,
            characterData: true,
          })
          const frames = await framesDuring(async () => {
            rerenderOf(view).setOptions(
              Object.fromEntries(
                Object.keys(inline).map((key) => [key, () => {}])
              )
            )
            await idle()
          })
          records.push(...observer.takeRecords())
          observer.disconnect()
          stop()
          if (told) {
            work.push(`after ${step.key}: told subscribers ${told} times`)
          }
          for (const record of records) {
            work.push(
              `after ${step.key}: ${record.type}${record.attributeName ? ` ${record.attributeName}` : ""} on ${
                (record.target as Element).getAttribute?.("data-slot") ??
                record.target.nodeName
              }`
            )
          }
          if (frames > 6) {
            work.push(`after ${step.key}: ${frames - 6} frames`)
          }
        },
        inline
      )
      view.unmount()
      expect([...new Set(work)]).toEqual([])
    })
  })
}
