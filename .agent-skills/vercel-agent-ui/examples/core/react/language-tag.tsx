import * as React from "react"
import { definePrimitive, toLocale } from "@ui-sdk/core"
import { Field, FieldControl, FieldLabel } from "@ui-sdk/react/field"
import { createParts } from "@ui-sdk/react/primitive"

type LanguageTagState = { tag: string }

const languageTag = definePrimitive({
  name: "language-tag",
  state: (): LanguageTagState => ({ tag: "en_US" }),
  api: (context) => ({
    change: (tag: string) => context.store.set({ tag }),
  }),
  slots: (slot) => ({
    root: slot<{}, { locale: string | undefined }>({
      state: (state) => ({ locale: toLocale(state.tag) }),
    }),
    input: slot({
      attrs: (state) => ({ value: state.tag, spellcheck: "false" }),
      on: {
        input: (event, { api }) =>
          api.change((event.target as HTMLInputElement).value),
      },
    }),
  }),
})

const parts = createParts(languageTag, { root: "div", input: "input" })

const LanguageTag = parts.Root

const LanguageTagInput = parts.Input

const date = new Date(Date.UTC(2026, 9, 21))

function Example() {
  return (
    <LanguageTag>
      {({ locale }) => (
        <>
          <Field>
            <FieldLabel>Language tag</FieldLabel>
            <FieldControl render={<LanguageTagInput />} />
          </Field>
          <p data-locale>
            {locale ? `Intl reads ${locale}` : "Not a language tag"}
          </p>
          <p data-date data-slot="hint">
            {new Intl.DateTimeFormat(locale, {
              dateStyle: "long",
              timeZone: "UTC",
            }).format(date)}
          </p>
        </>
      )}
    </LanguageTag>
  )
}

export {
  Example,
  languageTag,
  LanguageTag,
  LanguageTagInput,
  type LanguageTagState,
}
