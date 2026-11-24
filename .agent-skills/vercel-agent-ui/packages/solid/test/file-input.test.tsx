import { render } from "@solidjs/web"
import { createSignal, flush } from "solid-js"
import { expect, test, vi } from "vitest"
import {
  FileInput,
  FileInputItem,
  FileInputItemRemove,
  FileInputList,
} from "../src/file-input"

test("an item given spread props reads its file where Solid tracks it", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  const file = new File(["hi"], "a.txt", { type: "text/plain" })
  const Row = (props: { item: { class: string } }) => (
    <FileInputItem {...props.item}>
      <FileInputItemRemove />
    </FileInputItem>
  )
  const root = document.body.appendChild(document.createElement("div"))
  const dispose = render(
    () => (
      <FileInput multiple defaultValue={[file]}>
        <FileInputList aria-label="Files">
          <Row item={{ class: "row" }} />
        </FileInputList>
      </FileInput>
    ),
    root
  )
  flush()
  expect(root.querySelector(".row button")?.getAttribute("aria-label")).toBe(
    "Remove a.txt"
  )
  expect(warn).not.toHaveBeenCalled()
  dispose()
  root.remove()
  warn.mockRestore()
})

test("a remove button follows its item's file when it changes", () => {
  const first = new File(["hi"], "a.txt", { type: "text/plain" })
  const second = new File(["yo"], "b.txt", { type: "text/plain" })
  const [file, setFile] = createSignal(first)
  const root = document.body.appendChild(document.createElement("div"))
  const dispose = render(
    () => (
      <FileInput multiple defaultValue={[first, second]}>
        <FileInputItem file={file()}>
          <FileInputItemRemove />
        </FileInputItem>
      </FileInput>
    ),
    root
  )
  flush()
  const label = () => root.querySelector("button")?.getAttribute("aria-label")
  expect(label()).toBe("Remove a.txt")
  setFile(second)
  flush()
  expect(label()).toBe("Remove b.txt")
  dispose()
  root.remove()
})
