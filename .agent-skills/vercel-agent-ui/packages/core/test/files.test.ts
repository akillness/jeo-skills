import { describe, expect, test, vi } from "vitest"
import {
  readEntries,
  type DroppedEntry,
} from "../src/components/file-input/file-drop"
import {
  acceptsFile,
  acceptsType,
  dragStatus,
  formatFileSize,
  parseAccept,
  relativePath,
  validateFiles,
} from "../src/foundation/forms/files"

const file = (name: string, type = "", size = 10) => ({ name, type, size })

describe("accept", () => {
  test("parses a comma-separated string or a list, trimmed and lowercased", () => {
    expect(parseAccept(" image/*, .PDF ,,")).toEqual(["image/*", ".pdf"])
    expect(parseAccept(["Image/PNG", " "])).toEqual(["image/png"])
    expect(parseAccept(undefined)).toEqual([])
  })

  test("matches MIME types, wildcards and extensions", () => {
    const tokens = parseAccept("image/*,application/pdf,.csv")
    expect(acceptsFile(file("a.png", "image/png"), tokens)).toBe(true)
    expect(acceptsFile(file("a.pdf", "application/pdf"), tokens)).toBe(true)
    expect(acceptsFile(file("a.txt", "text/plain"), tokens)).toBe(false)
    expect(acceptsFile(file("a.txt", "text/plain"), parseAccept("*/*"))).toBe(
      true
    )
    expect(acceptsFile(file("a.txt", "text/plain"), [])).toBe(true)
  })

  test("extensions match the name, whatever MIME type the platform reports", () => {
    const tokens = parseAccept(".csv")
    // Windows reports CSV files as Excel files.
    expect(
      acceptsFile(file("data.CSV", "application/vnd.ms-excel"), tokens)
    ).toBe(true)
    // Some platforms know no type at all.
    expect(acceptsFile(file("photo.heic", ""), parseAccept(".heic"))).toBe(true)
    expect(acceptsFile(file("photo.heic", ""), parseAccept("image/*"))).toBe(
      false
    )
  })

  test("ignores MIME parameters and case", () => {
    expect(
      acceptsFile(
        file("a.csv", "Text/CSV; charset=utf-8"),
        parseAccept("text/csv")
      )
    ).toBe(true)
  })

  test("during a drag, extensions match the types they usually arrive with, and anything else is undecided", () => {
    expect(acceptsType("image/png", parseAccept("image/*"))).toBe(true)
    expect(acceptsType("application/pdf", parseAccept("image/*"))).toBe(false)
    expect(acceptsType("", parseAccept("image/*"))).toBe(undefined)
    expect(acceptsType("application/pdf", parseAccept("image/*,.pdf"))).toBe(
      true
    )
    expect(acceptsType("text/plain", parseAccept("image/*,.pdf"))).toBe(false)
    expect(acceptsType("application/vnd.ms-excel", parseAccept(".csv"))).toBe(
      true
    )
    expect(acceptsType("application/x-sketch", parseAccept(".sketch"))).toBe(
      undefined
    )
  })
})

describe("validateFiles", () => {
  test("rejects with every reason, in order", () => {
    const { accepted, rejected } = validateFiles(
      [
        file("a.png", "image/png", 5),
        file("b.txt", "text/plain", 500),
        file("c.png", "image/png", 1),
      ],
      { accept: "image/*", maxSize: 100, minSize: 2 }
    )
    expect(accepted.map((f) => f.name)).toEqual(["a.png"])
    expect(rejected.map((r) => [r.file.name, r.reasons])).toEqual([
      ["b.txt", ["file-type", "file-too-large"]],
      ["c.png", ["file-too-small"]],
    ])
  })

  test("accepts the first files up to maxFiles and rejects the rest", () => {
    const files = ["a", "b", "c", "d"].map((name) =>
      file(`${name}.png`, "image/png")
    )
    const { accepted, rejected } = validateFiles(files, { maxFiles: 2 })
    expect(accepted.map((f) => f.name)).toEqual(["a.png", "b.png"])
    expect(rejected.map((r) => r.reasons)).toEqual([
      ["too-many-files"],
      ["too-many-files"],
    ])
  })

  test("files rejected for other reasons don't use up maxFiles", () => {
    const files = [
      file("a.txt", "text/plain"),
      file("b.png", "image/png"),
      file("c.png", "image/png"),
    ]
    const { accepted } = validateFiles(files, {
      accept: "image/*",
      maxFiles: 2,
    })
    expect(accepted.map((f) => f.name)).toEqual(["b.png", "c.png"])
  })

  test("without multiple, only the first file is accepted", () => {
    const { accepted, rejected } = validateFiles([file("a"), file("b")], {
      multiple: false,
    })
    expect(accepted.map((f) => f.name)).toEqual(["a"])
    expect(rejected[0].reasons).toEqual(["too-many-files"])
  })

  test("validate sees the files of the same batch accepted before, so it catches a duplicate", () => {
    const { accepted, rejected } = validateFiles(
      [file("a.txt"), file("a.txt"), file("b.txt")],
      {
        validate: (candidate, { accepted }) =>
          accepted.some((other) => other.name === candidate.name)
            ? "duplicate"
            : null,
      }
    )
    expect(accepted.map((f) => f.name)).toEqual(["a.txt", "b.txt"])
    expect(rejected.map(({ reasons }) => reasons)).toEqual([["duplicate"]])
  })

  test("runs validate only on files that passed, and its reason rejects them", () => {
    const validate = vi.fn((f: { name: string }) =>
      f.name === "dup.png" ? "duplicate" : null
    )
    const { accepted, rejected } = validateFiles(
      [
        file("dup.png", "image/png"),
        file("new.png", "image/png"),
        file("x.txt", "text/plain"),
      ],
      { accept: "image/*", validate }
    )
    expect(validate).toHaveBeenCalledTimes(2)
    expect(accepted.map((f) => f.name)).toEqual(["new.png"])
    expect(rejected.map((r) => r.reasons)).toEqual([
      ["duplicate"],
      ["file-type"],
    ])
  })

  test("maxFiles of 0 rejects every file, for a list that's full", () => {
    expect(
      validateFiles([file("a")], { maxFiles: 0 }).rejected[0].reasons
    ).toEqual(["too-many-files"])
  })

  test("maxFiles of 0 rejects every file without multiple too", () => {
    const { accepted, rejected } = validateFiles([file("a")], {
      multiple: false,
      maxFiles: 0,
    })
    expect(accepted).toEqual([])
    expect(rejected[0].reasons).toEqual(["too-many-files"])
    expect(dragStatus(["image/png"], { multiple: false, maxFiles: 0 })).toBe(
      "reject"
    )
  })
})

describe("drag status", () => {
  test("rejects a type accept rules out, or too many items", () => {
    expect(dragStatus(["image/png"], { accept: "image/*" })).toBe("accept")
    expect(
      dragStatus(["image/png", "application/pdf"], { accept: "image/*" })
    ).toBe("reject")
    expect(dragStatus(["image/png", "image/png"], { multiple: false })).toBe(
      "reject"
    )
    expect(dragStatus(["", ""], { accept: ".pdf", maxFiles: 3 })).toBe("accept")
  })
})

// A fake folder whose reader returns its entries in batches, like Chromium's 100.
function folder(
  path: string,
  children: DroppedEntry[],
  batch = 100
): DroppedEntry {
  return {
    isFile: false,
    isDirectory: true,
    fullPath: path,
    createReader() {
      let index = 0
      return {
        readEntries(resolve) {
          resolve(children.slice(index, (index += batch)))
        },
      }
    },
  }
}
function fileEntry(path: string): DroppedEntry {
  return {
    isFile: true,
    isDirectory: false,
    fullPath: path,
    file: (resolve) => resolve(new File(["x"], path.split("/").pop()!)),
  }
}

describe("folders", () => {
  test("reads every batch of a folder, not just the first", async () => {
    const children = Array.from({ length: 250 }, (_, index) =>
      fileEntry(`/photos/${index}.jpg`)
    )
    const files = await readEntries([folder("/photos", children)])
    expect(files).toHaveLength(250)
  })

  test("walks nested folders and remembers each file's path", async () => {
    const files = await readEntries([
      folder("/docs", [
        fileEntry("/docs/a.md"),
        folder("/docs/sub", [fileEntry("/docs/sub/b.md")]),
      ]),
    ])
    expect(files.map(relativePath)).toEqual(["docs/a.md", "docs/sub/b.md"])
  })

  test("stops at the limit and skips system files", async () => {
    const children = [
      fileEntry("/f/.DS_Store"),
      ...Array.from({ length: 50 }, (_, i) => fileEntry(`/f/${i}`)),
    ]
    const files = await readEntries([folder("/f", children, 10)], 20)
    expect(files).toHaveLength(20)
    expect(files.some((f) => f.name === ".DS_Store")).toBe(false)
  })

  test("a folder that fails to read keeps what was read", async () => {
    const broken: DroppedEntry = {
      isFile: false,
      isDirectory: true,
      fullPath: "/broken",
      createReader: () => ({
        readEntries: (_, reject) => reject(new Error("gone")),
      }),
    }
    const files = await readEntries([
      fileEntry("/a.txt"),
      broken,
      fileEntry("/b.txt"),
    ])
    expect(files.map((f) => f.name)).toEqual(["a.txt", "b.txt"])
  })
})

test("formats file sizes in the locale", () => {
  expect(formatFileSize(512, "en-US")).toBe("512 bytes")
  expect(formatFileSize(1, "en-US")).toBe("1 byte")
  expect(formatFileSize(1536, "en-US")).toBe("1.5 kB")
  expect(formatFileSize(25_000_000, "en-US")).toBe("25 MB")
  expect(formatFileSize(1536, "de-DE")).toBe("1,5 kB")
})

test("a size that rounds up to 1000 of a unit reads as the next unit", () => {
  expect(formatFileSize(999_999, "en-US")).toBe("1 MB")
  expect(formatFileSize(999_600_000, "en-US")).toBe("1 GB")
  expect(formatFileSize(999_400, "en-US")).toBe("999 kB")
})
