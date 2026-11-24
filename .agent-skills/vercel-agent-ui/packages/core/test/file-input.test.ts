import { describe, expect, test, vi } from "vitest"
import {
  describeChange,
  fileKey,
} from "../src/components/file-input/file-input-api"
import { fileInput } from "../src/components/file-input/file-input"
import { dragStatus } from "../src/foundation/forms/files"
import { attrs, partState } from "../src/foundation/kernel/part"

const png = new File(["x"], "a.png", { type: "image/png" })
const pdf = new File(["x"], "b.pdf", { type: "application/pdf" })
const txt = new File(["x"], "c.txt", { type: "text/plain" })
const quiet = { announcement: () => null }

describe("value", () => {
  test("starts empty, with no drag state", () => {
    const input = fileInput({ id: "f" })
    expect(input.api.getValue()).toEqual([])
    expect(attrs(input.part("root"))).toEqual({
      "data-slot": "file-input",
    })
    expect(partState(input.part("dropzone", { id: "z" }))).toEqual({
      dragging: false,
      dragAccept: false,
      dragReject: false,
      disabled: false,
    })
  })

  test("addFiles checks files and reports what it added and rejected", () => {
    const onValueChange = vi.fn()
    const input = fileInput({
      id: "f",
      accept: "image/*,.pdf",
      multiple: true,
      onValueChange,
      ...quiet,
    })
    expect(input.api.addFiles([png, txt])).toBe(true)
    const [value, details] = onValueChange.mock.calls[0]
    expect(value).toEqual([png])
    expect(details).toMatchObject({
      reason: "imperative",
      added: [png],
      removed: [],
    })
    expect(details.rejected).toEqual([{ file: txt, reasons: ["file-type"] }])
  })

  test("with multiple, new files join the value", () => {
    const input = fileInput({ id: "f", multiple: true, ...quiet })
    input.api.addFiles([png])
    input.api.addFiles([pdf])
    expect(input.api.getValue()).toEqual([png, pdf])
  })

  test("without multiple, a new file replaces the value", () => {
    const onValueChange = vi.fn()
    const input = fileInput({ id: "f", onValueChange, ...quiet })
    input.api.addFiles([png])
    input.api.addFiles([pdf, txt])
    expect(input.api.getValue()).toEqual([pdf])
    expect(onValueChange.mock.calls[1][1]).toMatchObject({
      added: [pdf],
      removed: [png],
    })
    expect(onValueChange.mock.calls[1][1].rejected).toEqual([
      { file: txt, reasons: ["too-many-files"] },
    ])
  })

  test("maxFiles counts the files it already holds", () => {
    const input = fileInput({ id: "f", multiple: true, maxFiles: 2, ...quiet })
    input.api.addFiles([png])
    const onReject = vi.fn()
    input.setOptions({
      id: "f",
      multiple: true,
      maxFiles: 2,
      onReject,
      ...quiet,
    })
    input.api.addFiles([pdf, txt])
    expect(input.api.getValue()).toEqual([png, pdf])
    expect(onReject.mock.calls[0][0]).toEqual([
      { file: txt, reasons: ["too-many-files"] },
    ])
  })

  test("without multiple, a rejected file keeps the one it has", () => {
    const onValueChange = vi.fn()
    const onReject = vi.fn()
    const input = fileInput({
      id: "f",
      accept: ".pdf",
      onValueChange,
      onReject,
      ...quiet,
    })
    input.api.addFiles([pdf])
    expect(input.api.addFiles([png])).toBe(false)
    expect(input.api.getValue()).toEqual([pdf])
    expect(onValueChange).toHaveBeenCalledTimes(1)
    expect(onReject.mock.calls[0][0]).toEqual([
      { file: png, reasons: ["file-type"] },
    ])
  })

  test("a full list's rules leave no room, so its drags are rejected", () => {
    const input = fileInput({ id: "f", multiple: true, maxFiles: 2, ...quiet })
    expect(dragStatus(["image/png"], input.api.internal.rules())).toBe("accept")
    input.api.addFiles([png, pdf])
    expect(input.api.internal.rules().maxFiles).toBe(0)
    expect(dragStatus(["image/png"], input.api.internal.rules())).toBe("reject")
  })

  test("a batch that's all rejected reaches onReject and changes nothing", () => {
    const onValueChange = vi.fn()
    const onReject = vi.fn()
    const input = fileInput({
      id: "f",
      accept: "image/*",
      onValueChange,
      onReject,
      ...quiet,
    })
    expect(input.api.addFiles([txt])).toBe(false)
    expect(onValueChange).not.toHaveBeenCalled()
    expect(onReject.mock.calls[0][1]).toMatchObject({ reason: "imperative" })
  })

  test("a canceled change keeps the value", () => {
    const input = fileInput({
      id: "f",
      onValueChange: (_, details) => details.cancel(),
      ...quiet,
    })
    expect(input.api.addFiles([png])).toBe(false)
    expect(input.api.getValue()).toEqual([])
  })

  test("a controlled value follows its prop", () => {
    const onValueChange = vi.fn()
    const input = fileInput({ id: "f", value: [png], onValueChange, ...quiet })
    expect(input.api.removeFile(png)).toBe(true)
    expect(onValueChange.mock.calls[0][0]).toEqual([])
    expect(input.api.getValue()).toEqual([png])
    input.setOptions({ id: "f", value: [], onValueChange, ...quiet })
    expect(input.api.getValue()).toEqual([])
  })

  test("removeFile, clear and reset", () => {
    const onValueChange = vi.fn()
    const input = fileInput({
      id: "f",
      multiple: true,
      defaultValue: [png],
      onValueChange,
      ...quiet,
    })
    input.api.addFiles([pdf])
    expect(input.api.removeFile(png, { reason: "remove-press" })).toBe(true)
    expect(onValueChange.mock.calls[1][1]).toMatchObject({
      reason: "remove-press",
      removed: [png],
      added: [],
    })
    expect(input.api.removeFile(png)).toBe(false)
    input.api.internal.reset()
    expect(input.api.getValue()).toEqual([png])
    expect(onValueChange.mock.calls[2][1]).toMatchObject({
      reason: "reset",
      added: [png],
      removed: [pdf],
    })
    input.api.clear()
    expect(input.api.getValue()).toEqual([])
  })

  test("a disabled file input takes nothing and can't open", () => {
    const input = fileInput({ id: "f", disabled: true })
    expect(input.api.addFiles([png])).toBe(false)
    expect(input.api.open()).toBe(false)
    expect(attrs(input.part("trigger"))).toMatchObject({
      disabled: "",
      "data-disabled": "",
    })
  })
})

describe("parts", () => {
  test("the input carries the rules, and a folder picker allows several files", () => {
    const input = fileInput({
      id: "f",
      name: "files",
      accept: ["image/*", ".pdf"],
      capture: "environment",
    })
    expect(attrs(input.part("input"))).toMatchObject({
      type: "file",
      accept: "image/*,.pdf",
      name: "files",
      capture: "environment",
      "aria-hidden": "true",
      tabindex: "-1",
    })
    expect(attrs(input.part("input")).multiple).toBeUndefined()
    expect(
      attrs(fileInput({ id: "f", directory: true }).part("input"))
    ).toMatchObject({
      webkitdirectory: "",
      multiple: "",
    })
  })

  test("one item takes Tab into the list: the first, until another is focused", () => {
    const input = fileInput({
      id: "f",
      multiple: true,
      defaultValue: [png, pdf],
    })
    const props = (file: File) => ({ file, value: fileKey(file) })
    expect(attrs(input.part("item", props(png))).tabindex).toBe("0")
    expect(attrs(input.part("item", props(pdf))).tabindex).toBe("-1")
    input.api.internal.setActiveItem(fileKey(pdf))
    expect(attrs(input.part("item", props(png))).tabindex).toBe("-1")
    expect(attrs(input.part("item", props(pdf))).tabindex).toBe("0")
    expect(partState(input.part("item", props(pdf)))).toEqual({
      file: pdf,
      index: 1,
      disabled: false,
    })
  })

  test("a remove button is named after its file", () => {
    const input = fileInput({ id: "f", defaultValue: [png] })
    expect(
      attrs(input.part("item-remove", { file: png, value: fileKey(png) }))[
        "aria-label"
      ]
    ).toBe("Remove a.png")
  })

  test("file keys stay the same for a file and differ between files", () => {
    expect(fileKey(png)).toBe(fileKey(png))
    expect(fileKey(png)).not.toBe(fileKey(pdf))
  })
})

test("describes what changed", () => {
  const change = {
    reason: "drop",
    added: [png, pdf],
    removed: [],
    rejected: [{ file: txt, reasons: ["file-type"] }],
  }
  expect(describeChange(change)).toBe("2 files accepted. 1 file rejected.")
  expect(describeChange({ ...change, added: [png], rejected: [] })).toBe(
    "1 file accepted."
  )
  expect(describeChange({ ...change, added: [], rejected: [] })).toBe(null)
  expect(
    describeChange({ ...change, added: [], removed: [png], rejected: [] })
  ).toBe("a.png removed.")
  expect(
    describeChange({ ...change, added: [], removed: [png, pdf], rejected: [] })
  ).toBe("2 files removed.")
  expect(describeChange({ ...change, reason: "reset" })).toBe(null)
})

describe("trigger", () => {
  test("a disabled fieldset disables the trigger, wherever the trigger sits", () => {
    const input = fileInput({ id: "f" })
    input.api.internal.setFormDisabled(true)
    expect(attrs(input.part("trigger"))).toMatchObject({
      disabled: "",
      "data-disabled": "",
    })
    input.api.internal.setFormDisabled(false)
    expect(attrs(input.part("trigger")).disabled).toBeUndefined()
  })
})
