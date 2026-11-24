// @vitest-environment node
import { renderToString } from "react-dom/server"
import { describe, expect, test } from "vitest"
import { Field, FieldLabel } from "../src/field"
import {
  FileInput,
  FileInputDropzone,
  FileInputItem,
  FileInputItemRemove,
  FileInputList,
  FileInputTrigger,
} from "../src/file-input"

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering a file input", () => {
  test("a named file input renders a file input with its rules, which submits before hydration", () => {
    const html = renderToString(
      <FileInput name="files" accept={["image/*", ".pdf"]} multiple required>
        <FileInputDropzone>
          <FileInputTrigger>Browse files</FileInputTrigger>
        </FileInputDropzone>
      </FileInput>
    )
    expect(typeof window).toBe("undefined")
    expect(html).toContain('data-slot="file-input-dropzone"')
    const [button] = html.match(/<button[^>]*>Browse files<\/button>/) ?? []
    for (const attribute of [
      'type="button"',
      'data-slot="file-input-trigger"',
    ]) {
      expect(button).toContain(attribute)
    }
    const [input] = html.match(/<input[^>]*>/g) ?? []
    for (const attribute of [
      'type="file"',
      'accept="image/*,.pdf"',
      'multiple=""',
      'name="files"',
      'required=""',
      'aria-hidden="true"',
      'tabindex="-1"',
    ]) {
      expect(input).toContain(attribute)
    }
  })

  test("capture and directory reach the input", () => {
    const html = renderToString(
      <>
        <FileInput capture="environment">
          <FileInputTrigger>Photo</FileInputTrigger>
        </FileInput>
        <FileInput directory>
          <FileInputTrigger>Folder</FileInputTrigger>
        </FileInput>
      </>
    )
    expect(html).toContain('capture="environment"')
    expect(html).toMatch(/webkitdirectory=""/)
  })

  test("a disabled file input disables its trigger", () => {
    const html = renderToString(
      <FileInput disabled>
        <FileInputTrigger>Browse</FileInputTrigger>
      </FileInput>
    )
    expect(html).toContain("data-disabled")
    expect(html).toMatch(/<button[^>]*disabled=""/)
  })

  test("a trigger in a field is the field's control", () => {
    const html = renderToString(
      <Field>
        <FieldLabel>Avatar</FieldLabel>
        <FileInput>
          <FileInputTrigger>Upload</FileInputTrigger>
        </FileInput>
      </Field>
    )
    // Before hydration, a native label names it. After, the label and its own text do.
    const id = html.match(/<button[^>]*id="([^"]+)"/)?.[1]
    expect(html).toContain(`for="${id}"`)
  })

  test("the list renders an item per file, with one tab stop", () => {
    const files = [new File(["x"], "a.png"), new File(["x"], "b.pdf")]
    const html = renderToString(
      <FileInput multiple defaultValue={files}>
        <FileInputList>
          <FileInputItem>
            {({ file }) => (
              <>
                {file.name}
                <FileInputItemRemove>×</FileInputItemRemove>
              </>
            )}
          </FileInputItem>
        </FileInputList>
      </FileInput>
    )
    expect(html).toContain('role="list"')
    expect(html.match(/role="listitem"/g)).toHaveLength(2)
    expect(html.match(/tabindex="0"/g)).toHaveLength(1)
    expect(html).toContain('aria-label="Remove b.pdf"')
  })
})
