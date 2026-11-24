import { render } from "svelte/server"
import { expect, test } from "vitest"
import App from "./apps/field-error-id-app.svelte"

test.each([
  [[true]],
  [["valueMissing", true]],
  [[true, true]],
  [[undefined, true]],
] as const)(
  "errors shown on a server keep their own ids, and the first is described (%j)",
  (matches) => {
    const { body } = render(App, { props: { matches: [...matches] } })
    const ids = [...body.matchAll(/<[^>]*data-slot="field-error"[^>]*>/g)].map(
      ([tag]) => tag.match(/\sid="([^"]+)"/)![1]
    )
    const described = body
      .match(/<input[^>]*aria-describedby="([^"]+)"/)![1]
      .split(" ")
    expect(ids[0]).toMatch(/^ui-sdk-/)
    expect(new Set(ids).size).toBe(ids.length)
    expect(described).toContain(ids[0])
  }
)
