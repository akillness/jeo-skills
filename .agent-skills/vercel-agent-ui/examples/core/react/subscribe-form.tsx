import * as React from "react"
import { announce, definePrimitive, prepareAnnouncements } from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

type SubscribeState = { error: string | null; done: boolean }

const subscribe = definePrimitive({
  name: "subscribe",
  state: (): SubscribeState => ({ error: null, done: false }),
  api: (context) => ({
    submit(event: SubmitEvent, form: HTMLFormElement) {
      event.preventDefault()
      const email = new FormData(form).get("email")?.toString() ?? ""
      if (!email.includes("@")) {
        context.store.set({
          error: "Enter an email address, like ada@example.com.",
        })
        announce("Enter an email address", { priority: "assertive" })
      } else {
        context.store.set({ error: null, done: true })
        announce(`Subscribed ${email}`)
      }
    },
  }),
  slots: (slot) => ({
    root: slot({
      bind: () => prepareAnnouncements(document),
      on: {
        submit: (event, { el, api }) =>
          api.submit(event, el as HTMLFormElement),
      },
    }),
    input: slot({
      attrs: (state) => ({
        name: "email",
        "aria-invalid": state.error ? "true" : undefined,
      }),
    }),
    error: slot<{}, { error: string | null }>({
      present: (state) => state.error !== null,
      state: (state) => ({ error: state.error }),
    }),
    done: slot({ present: (state) => state.done }),
  }),
})

const parts = createParts(subscribe, {
  root: "form",
  input: "input",
  error: "p",
  done: "p",
})

function Example() {
  return (
    <parts.Root noValidate>
      <div data-slot="row">
        <parts.Input aria-label="Email" placeholder="Email" />
        <button type="submit" data-variant="solid">
          Subscribe
        </button>
      </div>
      <parts.Error>{({ error }) => error}</parts.Error>
      <parts.Done>You're on the list.</parts.Done>
    </parts.Root>
  )
}

export { Example, subscribe, type SubscribeState }
