import { definePrimitive } from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

type CopyButtonOptions = {
  text?: string
  timeout?: number
  onCopy?: (text: string) => void
}

type CopyButtonState = { copied: boolean }

const copyButton = definePrimitive({
  name: "copy-button",
  options: { text: "string", timeout: "number", onCopy: "callback" },
  state: (options: CopyButtonOptions): CopyButtonState => ({ copied: false }),
  api: (context) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let text = context.options().text
    context.onOptions((options) => {
      if (options.text === text) {
        return
      }
      text = options.text
      clearTimeout(timer)
      context.store.set({ copied: false })
    })
    context.onDestroy(() => clearTimeout(timer))
    return {
      async copy() {
        const { text = "", timeout = 1500, onCopy } = context.options()
        await navigator.clipboard?.writeText(text).catch(() => {})
        context.store.set({ copied: true })
        onCopy?.(text)
        clearTimeout(timer)
        timer = setTimeout(() => context.store.set({ copied: false }), timeout)
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

const parts = createParts(copyButton, { root: "button" })

const CopyButton = parts.Root

function Example() {
  return (
    <div data-slot="row">
      <code data-slot="copy-command">npm install @ui-sdk/core</code>
      <CopyButton text="npm install @ui-sdk/core">
        {({ copied }) => (copied ? "Copied" : "Copy")}
      </CopyButton>
    </div>
  )
}

export {
  copyButton,
  CopyButton,
  type CopyButtonOptions,
  type CopyButtonState,
  Example,
}
