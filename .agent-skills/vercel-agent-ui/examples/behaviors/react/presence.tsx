import * as React from "react"
import { XIcon } from "lucide-react"
import { animateIn, animateOut, definePrimitive } from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

type ToastsState = {
  toasts: string[]
  leaving: string[]
}

const toasts = definePrimitive({
  name: "toasts",
  state: (): ToastsState => ({ toasts: [], leaving: [] }),
  api: (context) => {
    const { store } = context
    let count = 0
    return {
      add: () =>
        store.set({ toasts: [...store.get().toasts, `toast-${++count}`] }),
      dismiss(key: string) {
        if (!store.get().leaving.includes(key)) {
          store.set({ leaving: [...store.get().leaving, key] })
        }
      },
      remove(key: string) {
        const { toasts, leaving } = store.get()
        store.set({
          toasts: toasts.filter((k) => k !== key),
          leaving: leaving.filter((k) => k !== key),
        })
      },
    }
  },
  slots: (slot) => ({
    root: slot<{}, { toasts: string[] }>({
      state: (state) => ({ toasts: state.toasts }),
    }),
    add: slot({
      attrs: () => ({ type: "button" }),
      press: ({ api }) => api.add(),
    }),
    toast: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({ role: "status" }),
      bind: (el, { api, key, store }) => {
        let stop = animateIn(el)
        const unsubscribe = store.subscribe(() => {
          if (
            !store.get().leaving.includes(key) ||
            el.hasAttribute("data-ending-style")
          ) {
            return
          }
          stop()
          stop = animateOut(el, () => api.remove(key))
        })
        return () => {
          unsubscribe()
          stop()
        }
      },
    }),
    dismiss: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({ type: "button", "aria-label": "Dismiss" }),
      press: ({ api, key }) => api.dismiss(key),
    }),
  }),
})

const parts = createParts(toasts, {
  root: "div",
  add: "button",
  toast: "div",
  dismiss: "button",
})

const Toasts = parts.Root

const ToastsAdd = parts.Add

const Toast = parts.Toast

const ToastDismiss = parts.Dismiss

function Example() {
  return (
    <Toasts>
      {({ toasts }) => (
        <>
          <ToastsAdd data-size="sm">Save</ToastsAdd>
          <div data-slot="scroll">
            {toasts.map((key) => (
              <Toast key={key} value={key}>
                Saved
                <ToastDismiss value={key}>
                  <XIcon aria-hidden="true" />
                </ToastDismiss>
              </Toast>
            ))}
          </div>
        </>
      )}
    </Toasts>
  )
}

export {
  Example,
  Toast,
  ToastDismiss,
  toasts,
  Toasts,
  ToastsAdd,
  type ToastsState,
}
