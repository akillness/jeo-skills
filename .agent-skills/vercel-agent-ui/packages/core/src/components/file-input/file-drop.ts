import { setRelativePath } from "../../foundation/forms/files"

// Drags that started in this document: text, links, images and draggable
// elements. They can carry "Files" too, like an image in Chromium, but they're
// never uploads.
let pageDrag = false

/** Whether a drag carries files from outside the page, rather than text or an element dragged within it. */
function carriesFiles(event: DragEvent) {
  const data = event.dataTransfer
  if (pageDrag || !data) {
    return false
  }
  // Firefox once named them differently, and Chromium sometimes leaves "Files"
  // out of `types` while its items are files.
  const types = Array.from(data.types ?? [])
  return (
    types.includes("Files") ||
    types.includes("application/x-moz-file") ||
    Array.from(data.items ?? []).some((item) => item.kind === "file")
  )
}

/** The MIME types of the files a drag carries, which is all a drag reveals before the drop. */
function draggedTypes(dataTransfer: DataTransfer | null) {
  if (!dataTransfer?.items) {
    return []
  }
  return Array.from(dataTransfer.items)
    .filter((item) => item.kind === "file")
    .map((item) => item.type)
}

/** The files a paste carries, like a screenshot. Empty for text. */
function pastedFiles(event: ClipboardEvent) {
  const data = event.clipboardData
  if (!data) {
    return []
  }
  const files = Array.from(data.files ?? [])
  if (files.length) {
    return files
  }
  return Array.from(data.items ?? [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => !!file)
}

const systemFiles = new Set([".DS_Store", "Thumbs.db", "desktop.ini"])

/** The most files read from dropped folders, so a huge folder can't stall the page. */
const folderFileLimit = 1000

// The parts of the File and Directory Entries API that reading folders uses.
type DroppedEntry = {
  isFile: boolean
  isDirectory: boolean
  fullPath: string
  file?: (
    resolve: (file: File) => void,
    reject: (error: unknown) => void
  ) => void
  createReader?: () => {
    readEntries: (
      resolve: (entries: DroppedEntry[]) => void,
      reject: (error: unknown) => void
    ) => void
  }
}

/**
 * Reads files from dropped entries, walking into folders, up to `limit`
 * files. A folder's reader returns its entries in batches (100 at a time in
 * Chromium), so it's read until it returns none. Each file remembers its path
 * inside the folder, for `relativePath()`.
 */
async function readEntries(
  entries: readonly DroppedEntry[],
  limit = folderFileLimit
) {
  const files: File[] = []
  const visit = async (entry: DroppedEntry) => {
    if (files.length >= limit) {
      return
    }
    if (entry.isFile && entry.file) {
      if (systemFiles.has(entry.fullPath.split("/").pop()!)) {
        return
      }
      const file = await new Promise<File>((resolve, reject) =>
        entry.file!(resolve, reject)
      )
      setRelativePath(file, entry.fullPath.replace(/^\//, ""))
      files.push(file)
      return
    }
    const reader = entry.isDirectory ? entry.createReader?.() : undefined
    if (!reader) {
      return
    }
    for (;;) {
      const batch = await new Promise<DroppedEntry[]>((resolve, reject) =>
        reader.readEntries(resolve, reject)
      )
      if (!batch.length || files.length >= limit) {
        return
      }
      for (const child of batch) {
        await visit(child)
      }
    }
  }
  for (const entry of entries) {
    await visit(entry).catch(() => {})
  }
  return files
}

/**
 * The files a drop carries. Without folders, that's the files themselves,
 * right away. With folders, a promise of every file inside them. Entries are
 * only readable during the drop event, so call this from its listener.
 */
function droppedFiles(dataTransfer: DataTransfer) {
  const items = Array.from(dataTransfer.items ?? []).filter(
    (item) => item.kind === "file"
  )
  const entries = items.map(
    (item) =>
      (item.webkitGetAsEntry?.() ?? null) as unknown as DroppedEntry | null
  )
  if (!entries.some((entry) => entry?.isDirectory)) {
    return Array.from(dataTransfer.files)
  }
  // Entries of plain files read like the rest. Items without one, which
  // scripted drops have, are taken as they are.
  const loose = items.flatMap((item, index) =>
    entries[index] ? [] : [item.getAsFile()]
  )
  return readEntries(
    entries.filter((entry): entry is DroppedEntry => !!entry)
  ).then((files) => [...loose.filter((file): file is File => !!file), ...files])
}

const claimed = new WeakSet<Event>()

/** Marks a drag or paste event as handled by a drop zone. */
function claim(event: Event) {
  claimed.add(event)
}

/** Whether a drop zone already handled the event. */
function isClaimed(event: Event) {
  return claimed.has(event)
}

// A native file input handles its own drops.
function isFileInput(target: EventTarget | null) {
  return target instanceof HTMLInputElement && target.type === "file"
}

let guards = 0
let releaseGuard: (() => void) | undefined

/**
 * While any drop zone is on the page, a file dropped anywhere else does
 * nothing, instead of the browser opening it and leaving the page. Also tells
 * page drags from file drags. Reference-counted: returns a release.
 */
function guardFileDrops() {
  if (typeof window === "undefined") {
    return () => {}
  }
  if (guards++ === 0) {
    const onDragStart = () => (pageDrag = true)
    const onDragEnd = () => (pageDrag = false)
    const onDragOver = (event: DragEvent) => {
      if (
        isClaimed(event) ||
        !carriesFiles(event) ||
        isFileInput(event.target)
      ) {
        return
      }
      event.preventDefault()
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "none"
      }
    }
    const onDrop = (event: DragEvent) => {
      if (
        isClaimed(event) ||
        !carriesFiles(event) ||
        isFileInput(event.target)
      ) {
        return
      }
      event.preventDefault()
    }
    window.addEventListener("dragstart", onDragStart, true)
    window.addEventListener("dragend", onDragEnd, true)
    window.addEventListener("dragover", onDragOver)
    window.addEventListener("drop", onDrop)
    releaseGuard = () => {
      window.removeEventListener("dragstart", onDragStart, true)
      window.removeEventListener("dragend", onDragEnd, true)
      window.removeEventListener("dragover", onDragOver)
      window.removeEventListener("drop", onDrop)
      pageDrag = false
    }
  }
  let released = false
  return () => {
    if (released) {
      return
    }
    released = true
    if (--guards === 0) {
      releaseGuard?.()
    }
  }
}

/**
 * Tracks whether a drag is over an element without flickering as it crosses
 * the element's children: `dragenter` on a child comes before `dragleave` on
 * the one it left, so the set of entered nodes empties only when the drag
 * leaves for good. Safari reports no `relatedTarget` on drag events, which
 * rules that approach out.
 */
function createDragTracker(onChange: (over: boolean) => void) {
  const entered = new Set<EventTarget>()
  return {
    enter(event: DragEvent) {
      if (event.target) {
        entered.add(event.target)
      }
      if (entered.size === 1) {
        onChange(true)
      }
    },
    leave(event: DragEvent) {
      if (!event.target || !entered.delete(event.target)) {
        return
      }
      // A node that left the page sends no dragleave. Forget it too.
      for (const node of entered) {
        if (node instanceof Node && !node.isConnected) {
          entered.delete(node)
        }
      }
      if (!entered.size) {
        onChange(false)
      }
    },
    reset() {
      if (!entered.size) {
        return
      }
      entered.clear()
      onChange(false)
    },
  }
}

export {
  carriesFiles,
  claim,
  createDragTracker,
  draggedTypes,
  type DroppedEntry,
  droppedFiles,
  guardFileDrops,
  isClaimed,
  isFileInput,
  pastedFiles,
  readEntries,
}
