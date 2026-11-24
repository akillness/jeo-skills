import * as React from "react"
import { definePrimitive } from "@ui-sdk/core"
import { checkDirection } from "@ui-sdk/core/testing"
import { pager } from "./page-stepper"

const fixedPager = definePrimitive({
  name: "pager",
  state: () => ({ page: 1 }),
  api: (context) => ({
    keydown(event: KeyboardEvent) {
      const by = { ArrowRight: 1, ArrowLeft: -1 }[event.key]
      if (by) {
        context.store.set({
          page: Math.min(5, Math.max(1, context.store.get().page + by)),
        })
      }
    },
  }),
  slots: (slot) => ({
    root: slot({
      attrs: () => ({ role: "spinbutton", tabindex: "0" }),
      on: { keydown: (event, { api }) => api.keydown(event) },
    }),
  }),
})

function Example() {
  const [broken, setBroken] = React.useState(false)
  const [result, setResult] = React.useState<{
    ok: boolean
    text: string
  } | null>(null)
  async function check() {
    try {
      await checkDirection(broken ? fixedPager : pager, {}, `<root>Page</root>`)
      setResult({
        ok: true,
        text: "Passes: the arrows swap in right-to-left text.",
      })
    } catch (error) {
      setResult({ ok: false, text: (error as Error).message })
    }
  }
  return (
    <div data-slot="check">
      <div data-slot="row">
        <button type="button" data-variant="solid" onClick={check}>
          Check Both Directions
        </button>
        <label data-slot="label">
          <input
            type="checkbox"
            checked={broken}
            onChange={(event) => {
              setBroken(event.target.checked)
              setResult(null)
            }}
          />
          Ignore the direction
        </label>
      </div>
      {result && (
        <p
          role="status"
          data-slot="check-result"
          data-status={result.ok ? "pass" : "fail"}
        >
          {result.text}
        </p>
      )}
    </div>
  )
}

export { Example }
