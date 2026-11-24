import * as React from "react"
import { bindPanel, definePrimitive } from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

type FaqState = {
  expanded: string[]
  exiting: string[]
}

const without = (list: string[], value: string) =>
  list.filter((other) => other !== value)

const faq = definePrimitive({
  name: "faq",
  state: (): FaqState => ({ expanded: [], exiting: [] }),
  api: (context) => {
    const { store } = context
    return {
      toggle(value: string) {
        const { expanded, exiting } = store.get()
        if (expanded.includes(value)) {
          store.set({
            expanded: without(expanded, value),
            exiting: [...exiting, value],
          })
        } else {
          store.set({
            expanded: [...expanded, value],
            exiting: without(exiting, value),
          })
        }
      },
    }
  },
  slots: (slot) => ({
    root: slot({}),
    trigger: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, { id, key }) => ({
        type: "button",
        "aria-expanded": String(state.expanded.includes(key)),
        "aria-controls": `${id}-${key}`,
      }),
      press: ({ api, key }) => api.toggle(key),
    }),
    panel: slot<{ value: string }>({
      props: { value: "string" },
      present: (state, { key }) =>
        state.expanded.includes(key) || state.exiting.includes(key),
      attrs: (_state, { id, key }) => ({ id: `${id}-${key}`, role: "region" }),
      bind: (el, { api, key, store }) =>
        bindPanel(el, {
          size: (el, height) => el.style.setProperty("--panel-height", height),
          isOpen: () => store.get().expanded.includes(key),
          isExiting: () => store.get().exiting.includes(key),
          isFindable: () => false,
          opening: () => "animate",
          reveal: () => api.toggle(key),
          trigger: () => el.previousElementSibling as HTMLElement | undefined,
          subscribe: store.subscribe,
          settled: () => {},
          exited: () =>
            store.set({ exiting: without(store.get().exiting, key) }),
        }),
    }),
  }),
})

const parts = createParts(faq, { root: "div", trigger: "button", panel: "div" })

const Faq = parts.Root

const FaqTrigger = parts.Trigger

const FaqPanel = parts.Panel

const questions = [
  {
    value: "refunds",
    question: "Can I get a refund?",
    answer: "Yes, within 30 days of buying, no questions asked.",
  },
  {
    value: "seats",
    question: "Can I add seats later?",
    answer: "Any time. You pay for the rest of the month only.",
  },
  {
    value: "export",
    question: "Can I export my data?",
    answer: "Everything exports to CSV or JSON from Settings.",
  },
]

function Example() {
  return (
    <div data-slot="panel-frame">
      <Faq>
        {questions.map((item) => (
          <div key={item.value}>
            <FaqTrigger value={item.value}>{item.question}</FaqTrigger>
            <FaqPanel value={item.value}>
              <p>{item.answer}</p>
            </FaqPanel>
          </div>
        ))}
      </Faq>
    </div>
  )
}

export { Example, faq, Faq, FaqPanel, FaqTrigger, type FaqState }
