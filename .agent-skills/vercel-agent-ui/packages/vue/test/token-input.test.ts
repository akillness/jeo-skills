// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest"
import { createApp, h, nextTick, ref, type App } from "vue"
import {
  fromText,
  TokenInput,
  TokenInputEditor,
  TokenInputToken,
} from "../src/token-input"

let app: App | undefined
afterEach(() => {
  app?.unmount()
  app = undefined
  document.body.replaceChildren()
})

// What each token's host shows: its content, then its kind.
const hosts = () =>
  [...document.querySelectorAll("[data-slot='token-input-host']")].map(
    (host) => host.textContent
  )

test("tokens a token input starts with show only the token slot, or their label without it", async () => {
  const custom = ref(true)
  const defaultValue = fromText("Open [@routes.ts](file:routes.ts)")
  app = createApp(() =>
    h(
      TokenInput,
      { defaultValue },
      {
        default: () => h(TokenInputEditor, { "aria-label": "Prompt" }),
        ...(custom.value && {
          token: ({ token }: { token: { label: string } }) =>
            h(TokenInputToken, () => token.label),
        }),
      }
    )
  )
  app.mount(document.body.appendChild(document.createElement("div")))
  await nextTick()
  expect(hosts()).toEqual(["routes.ts file"])
  expect(
    document.querySelectorAll("[data-slot='token-input-token']")
  ).toHaveLength(1)
  custom.value = false
  await nextTick()
  expect(hosts()).toEqual(["routes.ts file"])
  expect(document.querySelector("[data-slot='token-input-token']")).toBeNull()
  custom.value = true
  await nextTick()
  expect(hosts()).toEqual(["routes.ts file"])
  expect(
    document.querySelectorAll("[data-slot='token-input-token']")
  ).toHaveLength(1)
})
