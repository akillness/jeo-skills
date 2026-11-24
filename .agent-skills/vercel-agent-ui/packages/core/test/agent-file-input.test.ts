// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest"
import { fileInput } from "../src/components/file-input/file-input"
import { fileKey } from "../src/components/file-input/file-input-api"
import { createAgent } from "../src/page/agent/agent"
import { mount } from "../src/testing"

afterEach(() => document.body.replaceChildren())

const a = new File(["a"], "a.pdf")
const b = new File(["b"], "b.pdf")

const attachments = () =>
  mount(
    fileInput,
    { multiple: true, defaultValue: [a, b], announcement: () => null },
    `<root aria-label="Attachments"><trigger>Browse Files</trigger></root>`
  )

test("an agent removes one file by its name or its item's value", async () => {
  const view = attachments()
  const agent = createAgent()
  const [entry] = agent.snapshot()
  await expect(
    agent.act({
      steps: [{ ref: entry.ref, action: "removeFile", args: ["a.pdf"] }],
    })
  ).resolves.toMatchObject({ ok: true })
  expect(view.api.getValue()).toEqual([b])
  await agent.act({
    steps: [{ ref: entry.ref, action: "removeFile", args: [fileKey(b)] }],
  })
  expect(view.api.getValue()).toEqual([])
  view.unmount()
})

test("naming no file fails the step and lists the files", async () => {
  const view = attachments()
  const agent = createAgent()
  const [entry] = agent.snapshot()
  const result = await agent.act({
    steps: [{ ref: entry.ref, action: "removeFile", args: ["c.pdf"] }],
  })
  expect(result).toMatchObject({ ok: false })
  expect(JSON.stringify(result)).toContain("a.pdf, b.pdf")
  expect(view.api.getValue()).toEqual([a, b])
  view.unmount()
})

test("a step's text isn't a file, so setValue and addFiles refuse it", async () => {
  const view = attachments()
  const agent = createAgent()
  const [entry] = agent.snapshot()
  for (const action of ["setValue", "addFiles"]) {
    const result = await agent.act({
      steps: [{ ref: entry.ref, action, args: ["report.pdf"] }],
    })
    expect(result).toMatchObject({ ok: false })
    expect(result.error?.message).toContain("takes files")
  }
  expect(view.api.getValue()).toEqual([a, b])
  expect(agent.snapshot()[0].items).toHaveLength(2)
  view.unmount()
})
