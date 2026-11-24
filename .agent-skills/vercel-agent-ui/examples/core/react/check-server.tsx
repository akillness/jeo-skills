import * as React from "react"
import { definePrimitive } from "@ui-sdk/core"
import { checkServer } from "@ui-sdk/core/testing"
import { readMore } from "./read-more"

const clock = definePrimitive({
  name: "clock",
  state: () => ({}),
  api: () => ({}),
  slots: (slot) => ({
    root: slot({ attrs: () => ({ "data-rendered": String(Date.now()) }) }),
  }),
})

function run(broken: boolean) {
  try {
    const html = broken
      ? checkServer(clock, {}, `<root>Now</root>`)
      : checkServer(
          readMore,
          {},
          `<root><trigger>Read more</trigger><panel>More</panel></root>`
        )
    return { ok: true, text: html }
  } catch (error) {
    return { ok: false, text: (error as Error).message }
  }
}

function Example() {
  const [broken, setBroken] = React.useState(false)
  const [result, setResult] = React.useState<{
    ok: boolean
    text: string
  } | null>(null)
  return (
    <div data-slot="check">
      <div data-slot="row">
        <button
          type="button"
          data-variant="solid"
          onClick={() => setResult(run(broken))}
        >
          Check the Server HTML
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
          Read the clock in attrs
        </label>
      </div>
      {result && (
        <pre
          role="status"
          data-slot="check-result"
          data-status={result.ok ? "pass" : "fail"}
        >
          {result.text}
        </pre>
      )}
    </div>
  )
}

export { Example }
