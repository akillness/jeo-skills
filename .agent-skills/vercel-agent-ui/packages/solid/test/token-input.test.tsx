import { createSignal, flush } from "solid-js"
import { render } from "@solidjs/web"
import { afterEach, expect, test } from "vitest"
import {
  fromText,
  type Token,
  TokenInput,
  TokenInputEditor,
  TokenInputToken,
} from "../src/token-input"

let dispose: (() => void) | undefined
afterEach(() => {
  dispose?.()
  document.body.replaceChildren()
})

test("a token input named after mount renders the textarea its form submits", async () => {
  const [name, setName] = createSignal<string>()
  dispose = render(
    () => (
      <form>
        <TokenInput defaultValue={["Hello"]} name={name()}>
          <TokenInputEditor aria-label="Prompt" />
        </TokenInput>
      </form>
    ),
    document.body
  )
  flush()
  await new Promise((resolve) => setTimeout(resolve))
  setName("prompt")
  flush()
  await new Promise((resolve) => setTimeout(resolve))
  expect(new FormData(document.querySelector("form")!).get("prompt")).toBe(
    "Hello"
  )
})

// What each token's host shows: its content, then its kind.
const hosts = () =>
  [...document.querySelectorAll("[data-slot='token-input-host']")].map(
    (host) => host.textContent
  )

test("tokens a token input starts with show only what renderToken renders, or their label without it", async () => {
  const [custom, setCustom] = createSignal(true)
  const renderToken = (token: Token) => (
    <TokenInputToken>{token.label}</TokenInputToken>
  )
  dispose = render(
    () => (
      <TokenInput
        defaultValue={fromText("Open [@routes.ts](file:routes.ts)")}
        renderToken={custom() ? renderToken : undefined}
      >
        <TokenInputEditor aria-label="Prompt" />
      </TokenInput>
    ),
    document.body
  )
  flush()
  await new Promise((resolve) => setTimeout(resolve))
  expect(hosts()).toEqual(["routes.ts file"])
  expect(
    document.querySelectorAll("[data-slot='token-input-token']")
  ).toHaveLength(1)
  setCustom(false)
  flush()
  expect(hosts()).toEqual(["routes.ts file"])
  expect(document.querySelector("[data-slot='token-input-token']")).toBeNull()
  setCustom(true)
  flush()
  await new Promise((resolve) => setTimeout(resolve))
  expect(hosts()).toEqual(["routes.ts file"])
  expect(
    document.querySelectorAll("[data-slot='token-input-token']")
  ).toHaveLength(1)
})
