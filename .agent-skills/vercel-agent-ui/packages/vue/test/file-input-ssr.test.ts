// @vitest-environment node
import { renderToString } from "@vue/server-renderer"
import { describe, expect, test } from "vitest"
import { createSSRApp, h } from "vue"
import {
  FileInput,
  FileInputDropzone,
  FileInputItem,
  FileInputItemRemove,
  FileInputList,
  FileInputTrigger,
} from "../src"

const render = (node: () => unknown) =>
  renderToString(createSSRApp(() => node()))

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering a file input", () => {
  test("a named file input renders a file input with its rules, which submits before hydration", async () => {
    const html = await render(() =>
      h(
        FileInput,
        { name: "files", accept: "image/*", multiple: true, required: true },
        () =>
          h(FileInputDropzone, null, () =>
            h(FileInputTrigger, null, () => "Browse files")
          )
      )
    )
    expect(typeof window).toBe("undefined")
    expect(html).toContain('data-slot="file-input-dropzone"')
    expect(html).toMatch(
      /<input[^>]*type="file"[^>]*accept="image\/\*"[^>]*multiple[^>]*name="files"[^>]*required/
    )
  })

  test("a disabled file input disables its trigger", async () => {
    const html = await render(() =>
      h(FileInput, { disabled: true }, () =>
        h(FileInputTrigger, null, () => "Browse")
      )
    )
    expect(html).toMatch(/<button[^>]*disabled/)
  })

  test("the list renders an item per file, with one tab stop", async () => {
    const files = [new File(["x"], "a.png"), new File(["x"], "b.pdf")]
    const html = await render(() =>
      h(FileInput, { multiple: true, defaultValue: files }, () =>
        h(FileInputList, null, () =>
          h(FileInputItem, null, {
            default: ({ state }: { state: { file: File } }) => [
              state.file.name,
              h(FileInputItemRemove, null, () => "×"),
            ],
          })
        )
      )
    )
    expect(html.match(/role="listitem"/g)).toHaveLength(2)
    expect(html.match(/tabindex="0"/g)).toHaveLength(1)
    expect(html).toContain('aria-label="Remove b.pdf"')
  })

  test("a root rendered through #render still renders its hidden file input", async () => {
    const html = await render(() =>
      h(
        FileInput,
        { name: "files" },
        {
          render: ({ props }: { props: Record<string, unknown> }) =>
            h("section", props, [h(FileInputTrigger, null, () => "Browse")]),
        }
      )
    )
    expect(html).toContain("<section")
    expect(html).toMatch(/<input[^>]*type="file"[^>]*name="files"/)
  })

  test("a remove button given a file removes that file outside an item", async () => {
    const file = new File(["x"], "a.png", { type: "image/png" })
    const html = await render(() =>
      h(FileInput, { defaultValue: [file] }, () =>
        h(FileInputItemRemove, { file }, () => "×")
      )
    )
    expect(html).toContain('aria-label="Remove a.png"')
  })
})
