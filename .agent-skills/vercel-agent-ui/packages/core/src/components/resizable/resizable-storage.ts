// Saved layouts, for groups with an `autoSaveId`. One entry per group, holding
// a layout for each set of panels it has had, so panels that come and go
// each get back the sizes they were left at.

/**
 * Where layouts are saved: `localStorage` by default. Anything with the same
 * two methods works, like `sessionStorage` or a cookie, which a server can
 * read to render the saved sizes on the first paint.
 * @stable
 */
type ResizableStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

/**
 * The key a group saves under, from its `autoSaveId`.
 * @stable
 */
const storageKey = (autoSaveId: string) => `ui-sdk-resizable:${autoSaveId}`

// Reading `localStorage` throws where storage is blocked, like a sandboxed
// iframe. Saving is a convenience, so it's skipped there.
// check-code: allow return-type callers pass any ResizableStorage, not only the browser's Storage.
function defaultStorage(): ResizableStorage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage
  } catch {
    return undefined
  }
}

function entries(storage: ResizableStorage, key: string) {
  try {
    const saved = JSON.parse(storage.getItem(key) ?? "{}") as unknown
    return saved && typeof saved === "object"
      ? (saved as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

/** The layout saved for these panels, if there is one that fits them. */
function loadLayout(
  autoSaveId: string,
  ids: readonly string[],
  storage = defaultStorage()
) {
  if (!storage) {
    return undefined
  }
  const layout = entries(storage, storageKey(autoSaveId))[ids.join(",")]
  const valid =
    Array.isArray(layout) &&
    layout.length === ids.length &&
    layout.every((size) => typeof size === "number" && Number.isFinite(size))
  return valid ? (layout as number[]) : undefined
}

function saveLayout(
  autoSaveId: string,
  ids: readonly string[],
  layout: readonly number[],
  storage = defaultStorage()
) {
  if (!storage) {
    return
  }
  const key = storageKey(autoSaveId)
  const saved = entries(storage, key)
  saved[ids.join(",")] = layout.map((size) => Math.round(size * 1000) / 1000)
  try {
    storage.setItem(key, JSON.stringify(saved))
  } catch {
    // Full or blocked storage keeps the layout for this visit only.
  }
}

export { loadLayout, type ResizableStorage, saveLayout, storageKey }
