import * as React from "react"
import { announce, definePrimitive } from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"
import { CheckIcon, CopyIcon } from "lucide-react"

type CopyOptions = {
  text: string
}

type CopyState = { text: string; copied: boolean }

const copy = definePrimitive({
  name: "copy",
  options: { text: "string" },
  state: (options: CopyOptions): CopyState => ({
    text: options.text,
    copied: false,
  }),
  sync: (options) => ({ text: options.text }),
  api: (context) => {
    const { store } = context
    let timer: ReturnType<typeof setTimeout> | undefined
    context.onDestroy(() => clearTimeout(timer))
    return {
      async copy() {
        await navigator.clipboard?.writeText(store.get().text).catch(() => {})
        announce("Copied")
        store.set({ copied: true })
        clearTimeout(timer)
        timer = setTimeout(() => store.set({ copied: false }), 1500)
      },
    }
  },
  slots: (slot) => ({
    root: slot<{}, { copied: boolean }>({
      state: (state) => ({ copied: state.copied }),
      attrs: (state) => ({
        type: "button",
        "data-copied": state.copied ? "" : undefined,
      }),
      press: ({ api }) => api.copy(),
    }),
  }),
})

const parts = createParts(copy, { root: "button" })

const CopyButton = parts.Root

function Example() {
  return (
    <div data-slot="announce-command">
      <span>npm add @ui-sdk/core</span>
      <CopyButton
        data-size="sm"
        text="npm add @ui-sdk/core"
        aria-label="Copy command"
      >
        {({ copied }) => (
          <>
            {copied ? (
              <CheckIcon aria-hidden="true" />
            ) : (
              <CopyIcon aria-hidden="true" />
            )}
            {copied ? "Copied" : "Copy"}
          </>
        )}
      </CopyButton>
    </div>
  )
}

export { copy, CopyButton, Example, type CopyOptions, type CopyState }
