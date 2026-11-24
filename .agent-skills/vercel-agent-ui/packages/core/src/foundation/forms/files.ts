// File rules for FileInput: which files to accept, and
// why the others were rejected. Pure, with no DOM, so they run on the server
// and on any object with a `File`'s name, type and size.

/**
 * What the file checks read: a browser `File`, or any object with its name, type and size.
 * @stable
 */
type FileLike = {
  /** The file name, with its extension. */
  name: string
  /** The MIME type, like `"image/png"`. Empty when the platform doesn't know it. */
  type: string
  /** The size in bytes. */
  size: number
}

/**
 * Why a file was rejected.
 * @stable
 */
type FileRejectionReason =
  /** It matches nothing in `accept`. */
  | "file-type"
  /** It's bigger than `maxSize`. */
  | "file-too-large"
  /** It's smaller than `minSize`. */
  | "file-too-small"
  /** More files came than `maxFiles` allows, or more than one without `multiple`. */
  | "too-many-files"

/**
 * A file that didn't pass the checks, with every reason it failed.
 * @stable
 */
type FileRejection<F extends FileLike = File> = {
  /** The file that failed. It never joins the value. */
  file: F
  /**
   * Every reason, in the order they're checked: type, size, your `validate`,
   * then the count. A string from `validate` is its own reason.
   */
  reasons: (FileRejectionReason | (string & {}))[]
}

/**
 * The checks a FileInput runs on every file it receives.
 * @stable
 */
type FileRules<F extends FileLike = File> = {
  /**
   * The files to accept, like the `accept` attribute: MIME types (`"image/png"`),
   * wildcards (`"image/*"`) and extensions (`".pdf"`), in a comma-separated
   * string or an array. Without it, any file.
   */
  accept?: string | readonly string[]
  /** Accepts more than one file at a time. Without it, the first file is accepted and the rest are rejected. */
  multiple?: boolean
  /** The most files accepted at a time. The first ones that pass the other checks are accepted, and the rest are rejected. */
  maxFiles?: number
  /** The largest size accepted, in bytes. */
  maxSize?: number
  /** The smallest size accepted, in bytes. */
  minSize?: number
  /**
   * A check of your own. Return a reason, like `"duplicate"`, to reject the
   * file, or nothing to accept it. `accepted` holds the files of the same
   * choice, drop or paste accepted before this one.
   */
  validate?: (
    file: F,
    batch: { accepted: readonly F[] }
  ) => string | null | undefined | void
}

/** The tokens of an `accept` list: lowercase, trimmed, without empty ones. */
function parseAccept(accept: string | readonly string[] | undefined) {
  if (!accept) {
    return []
  }
  const list = typeof accept === "string" ? accept.split(",") : accept
  return list.map((token) => token.trim().toLowerCase()).filter(Boolean)
}

const isExtension = (token: string) => token.startsWith(".")
const isAny = (token: string) => token === "*" || token === "*/*"
// "text/csv; charset=utf-8" is a text/csv.
const essence = (type: string) => type.split(";")[0].trim().toLowerCase()

function matchesType(type: string, token: string) {
  if (isAny(token)) {
    return true
  }
  if (!type) {
    return false
  }
  if (token.endsWith("/*")) {
    return type.startsWith(token.slice(0, -1))
  }
  return type === token
}

/**
 * Whether a file matches an `accept` list. Extensions match the name, so a
 * `.csv` that Windows reports as `application/vnd.ms-excel`, or a file the
 * platform has no MIME type for, still matches `".csv"`.
 */
function acceptsFile(file: FileLike, tokens: readonly string[]) {
  if (!tokens.length) {
    return true
  }
  const name = file.name.toLowerCase()
  const type = essence(file.type)
  return tokens.some((token) =>
    isExtension(token) ? name.endsWith(token) : matchesType(type, token)
  )
}

// The MIME types common extensions arrive with, so a drag can be judged
// before names are readable. Windows reports CSV files as Excel files.
const extensionTypes: Record<string, string[]> = {
  ".pdf": ["application/pdf"],
  ".png": ["image/png"],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".gif": ["image/gif"],
  ".webp": ["image/webp"],
  ".svg": ["image/svg+xml"],
  ".txt": ["text/plain"],
  ".md": ["text/markdown", "text/x-markdown"],
  ".csv": ["text/csv", "application/vnd.ms-excel"],
  ".json": ["application/json"],
  ".zip": ["application/zip", "application/x-zip-compressed"],
  ".mp4": ["video/mp4"],
  ".mp3": ["audio/mpeg"],
}

/**
 * Whether a dragged item's MIME type matches, before the drop. Names aren't
 * readable during a drag, so an extension matches through the types it
 * usually arrives with. It's `undefined` when only an extension we don't know
 * could tell, or when the platform reports no type. Callers treat that as accepted.
 */
function acceptsType(type: string, tokens: readonly string[]) {
  if (!tokens.length) {
    return true
  }
  const mime = essence(type)
  if (!mime) {
    return undefined
  }
  const matches = tokens.some((token) =>
    isExtension(token)
      ? extensionTypes[token]?.includes(mime)
      : matchesType(mime, token)
  )
  if (matches) {
    return true
  }
  return tokens.some((token) => isExtension(token) && !extensionTypes[token])
    ? undefined
    : false
}

/** How many files the rules accept at a time. */
function fileLimit(rules: Pick<FileRules<FileLike>, "multiple" | "maxFiles">) {
  if (rules.multiple === false) {
    return Math.min(1, rules.maxFiles ?? 1)
  }
  return rules.maxFiles ?? Infinity
}

/**
 * Splits files into the accepted ones and the rejected ones, with every reason
 * each failed. Files keep their order. When there are too many, the first ones
 * that pass the other checks are accepted.
 */
function validateFiles<F extends FileLike>(
  files: readonly F[],
  rules: FileRules<F>
) {
  const tokens = parseAccept(rules.accept)
  const limit = fileLimit(rules)
  const accepted: F[] = []
  const rejected: FileRejection<F>[] = []
  for (const file of files) {
    const reasons: FileRejection<F>["reasons"] = []
    if (!acceptsFile(file, tokens)) {
      reasons.push("file-type")
    }
    if (rules.maxSize !== undefined && file.size > rules.maxSize) {
      reasons.push("file-too-large")
    }
    if (rules.minSize !== undefined && file.size < rules.minSize) {
      reasons.push("file-too-small")
    }
    // Your check runs only on files that passed ours, so it can be costly.
    const custom = reasons.length
      ? undefined
      : rules.validate?.(file, { accepted })
    if (custom) {
      reasons.push(custom)
    }
    if (!reasons.length && accepted.length >= limit) {
      reasons.push("too-many-files")
    }
    if (reasons.length) {
      rejected.push({ file, reasons })
    } else {
      accepted.push(file)
    }
  }
  return { accepted, rejected }
}

/**
 * Whether dragged items look acceptable, from what a drag exposes: their MIME
 * types and their count. `"reject"` when one has a type `accept` rules out or
 * there are too many; otherwise `"accept"`, since names and sizes are only
 * known after the drop.
 */
function dragStatus(
  types: readonly string[],
  rules: Pick<FileRules<FileLike>, "accept" | "multiple" | "maxFiles">
) {
  if (types.length > fileLimit(rules)) {
    return "reject"
  }
  const tokens = parseAccept(rules.accept)
  return types.some((type) => acceptsType(type, tokens) === false)
    ? "reject"
    : "accept"
}

const sizeUnits = [
  "byte",
  "kilobyte",
  "megabyte",
  "gigabyte",
  "terabyte",
] as const

/**
 * A file size for people, in the locale: 1536 bytes reads "1.5 kB".
 * @stable
 */
function formatFileSize(bytes: number, locale?: string) {
  let value = bytes
  let unit = 0
  while (Math.round(value) >= 1000 && unit < sizeUnits.length - 1) {
    value /= 1000
    unit++
  }
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: sizeUnits[unit],
    // The short form of a byte is the word in the singular, like "70 byte".
    unitDisplay: unit ? "short" : "long",
    maximumFractionDigits: value < 10 && unit > 0 ? 1 : 0,
  }).format(value)
}

// Where a file sat inside a dropped folder, recorded as folders are read.
const paths = new WeakMap<object, string>()

function setRelativePath(file: object, path: string) {
  paths.set(file, path)
}

/**
 * Where a file sat inside the folder it came from, like `"photos/2026/a.jpg"`,
 * for files from a dropped folder or a `directory` picker. Just the name otherwise.
 * @stable
 */
function relativePath(file: FileLike) {
  return (
    paths.get(file) ||
    (file as { webkitRelativePath?: string }).webkitRelativePath ||
    file.name
  )
}

export {
  acceptsFile,
  acceptsType,
  dragStatus,
  type FileLike,
  type FileRejection,
  type FileRejectionReason,
  type FileRules,
  formatFileSize,
  parseAccept,
  relativePath,
  setRelativePath,
  validateFiles,
}
