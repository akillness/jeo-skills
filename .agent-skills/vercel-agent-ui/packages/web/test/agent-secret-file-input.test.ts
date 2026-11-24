// @vitest-environment jsdom
import { beforeAll, expect, test } from "vitest"
import { createAgent } from "../src/agent"
import { defineFileInputElements } from "../src/file-input"

const wait = () => new Promise((resolve) => setTimeout(resolve, 10))

beforeAll(() => {
  ;(
    Element.prototype as { getAnimations?: () => Animation[] }
  ).getAnimations ??= () => []
  ElementInternals.prototype.setFormValue ??= () => {}
  ElementInternals.prototype.setValidity ??= () => {}
  defineFileInputElements()
})

test("a secret file input lists its files without their names", async () => {
  document.body.innerHTML = `
    <div data-agent-secret>
      <ui-file-input id="files" multiple aria-label="Documents">
        <ui-file-input-trigger><button>Browse Files</button></ui-file-input-trigger>
        <ui-file-input-list aria-label="Documents">
          <template>
            <ui-file-input-item><span data-file="name"></span></ui-file-input-item>
          </template>
        </ui-file-input-list>
      </ui-file-input>
    </div>`
  const input = document.getElementById("files") as HTMLElement & {
    value: File[]
  }
  input.value = [new File(["a"], "passport.pdf"), new File(["b"], "tax.pdf")]
  await wait()
  const agent = createAgent()
  const [entry] = agent.snapshot()
  expect(entry.value).toBe("[redacted]")
  expect(entry.items?.map((item) => item.label)).toEqual([
    "[redacted]",
    "[redacted]",
  ])
  expect(JSON.stringify(agent.snapshot())).not.toContain("passport")
  expect(await agent.query({ text: "passport" })).toEqual([])
})
