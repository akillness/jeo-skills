import * as React from "react"
import { StarIcon } from "lucide-react"
import { createChange, definePrimitive } from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"
import { createAgent } from "@ui-sdk/react/agent"

const rating = definePrimitive({
  name: "rating",
  options: { defaultValue: "number" },
  state: (options: { defaultValue?: number }) => ({
    value: options.defaultValue ?? 0,
  }),
  api: (context) => {
    const change = createChange(context)
    return {
      rate: (value: number, event?: Event) =>
        change("value", value, { reason: "item-press", event }),
    }
  },
  slots: (slot) => ({
    root: slot({ attrs: () => ({ role: "group" }) }),
    star: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, part) => ({
        type: "button",
        "aria-pressed": String(Number(part.key) <= state.value),
        "data-filled": Number(part.key) <= state.value ? "" : undefined,
      }),
      press: ({ api, key }, event) => api.rate(Number(key), event),
    }),
  }),
  agent: { actions: ["rate"] },
})

const parts = createParts(rating, { root: "div", star: "button" })
const Rating = parts.Root
const RatingStar = parts.Star

const agent = createAgent()

function Example() {
  const [output, setOutput] = React.useState("")
  const show = (value: unknown) => setOutput(JSON.stringify(value, null, 2))

  return (
    <div data-slot="stack">
      <Rating aria-label="Your rating">
        {Array.from({ length: 5 }, (_, index) => (
          <RatingStar
            key={index}
            value={String(index + 1)}
            aria-label={`${index + 1} ${index === 0 ? "star" : "stars"}`}
          >
            <StarIcon aria-hidden="true" />
          </RatingStar>
        ))}
      </Rating>
      <div data-slot="row">
        <button
          type="button"
          onClick={() =>
            show(
              agent.snapshot().filter((entry) => entry.component === "rating")
            )
          }
        >
          Read the page
        </button>
        <button
          type="button"
          data-variant="solid"
          onClick={async () =>
            show(
              await agent.act({
                steps: [{ ref: "Your rating", action: "rate", args: [4] }],
              })
            )
          }
        >
          Ask for 4 stars
        </button>
      </div>
      {output && (
        <pre role="status" data-slot="log">
          {output}
        </pre>
      )}
    </div>
  )
}

export { Example }
