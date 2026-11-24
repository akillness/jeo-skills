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

const attachments = async (mark = "") => {
  document.body.innerHTML = `
    <ui-file-input id="files" multiple aria-label="Attachments">
      <ui-file-input-trigger><button>Browse Files</button></ui-file-input-trigger>
      <ui-file-input-list aria-label="Attachments">
        <template>
          <ui-file-input-item>
            <span data-file="name"></span>
            <ui-file-input-item-remove ${mark}><button type="button">Remove</button></ui-file-input-item-remove>
          </ui-file-input-item>
        </template>
      </ui-file-input-list>
    </ui-file-input>`
  const input = document.getElementById("files") as HTMLElement & {
    value: File[]
  }
  input.value = [new File(["a"], "a.pdf"), new File(["b"], "b.pdf")]
  await wait()
  return input
}

test("an agent removes one file by its name", async () => {
  const input = await attachments()
  const agent = createAgent()
  const result = await agent.act({
    steps: [{ ref: "Attachments", action: "removeFile", args: ["a.pdf"] }],
  })
  expect(result).toMatchObject({ ok: true })
  expect(input.value.map((file) => file.name)).toEqual(["b.pdf"])
})

test("a remove button that needs a person needs one for removeFile too", async () => {
  const input = await attachments('data-agent-confirm="Removes the file."')
  const agent = createAgent()
  const result = await agent.act({
    steps: [{ ref: "Attachments", action: "removeFile", args: ["a.pdf"] }],
  })
  expect(result).toMatchObject({ ok: false })
  expect(input.value.map((file) => file.name)).toEqual(["a.pdf", "b.pdf"])
})

test("a secret file input's files can't be found or listed by name", async () => {
  const input = await attachments()
  input.parentElement!.setAttribute("data-agent-secret", "")
  const agent = createAgent()
  const result = await agent.act({
    steps: [{ ref: "Attachments", action: "removeFile", args: ["a.pdf"] }],
  })
  expect(result).toMatchObject({ ok: false })
  expect(result.error?.message).toMatch(
    /Its files: \[redacted\], \[redacted\]\.$/
  )
  expect(JSON.stringify(result)).not.toContain("b.pdf")
  expect(input.value.map((file) => file.name)).toEqual(["a.pdf", "b.pdf"])
})
