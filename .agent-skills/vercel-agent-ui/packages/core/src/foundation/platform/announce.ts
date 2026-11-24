// A polite and an assertive live region per document, each made on first use,
// for text that changes without a region of its own, like a toggletip's when
// a press opens it, files arriving in a drop zone, or a toast. Live regions
// stay live over modals, since `inertOutside` keeps them, so announcements
// reach a screen reader from anywhere.

/**
 * How urgently a screen reader reads an announcement: `"polite"` waits for a pause, `"assertive"` interrupts.
 * @stable
 */
type AnnouncePriority = "polite" | "assertive"

const regions = new WeakMap<
  Document,
  Partial<Record<AnnouncePriority, HTMLElement>>
>()
let announcer: ((text: string, priority: AnnouncePriority) => void) | undefined
const pending: Partial<
  Record<AnnouncePriority, ReturnType<typeof setTimeout>>
> = {}

/**
 * Replaces how text is announced, like in unit tests, which run without a
 * document. Undefined goes back to the live regions.
 */
function setAnnouncer(
  announce: ((text: string, priority: AnnouncePriority) => void) | undefined
) {
  announcer = announce
}

function regionIn(doc: Document, priority: AnnouncePriority) {
  let found = regions.get(doc)
  if (!found) {
    regions.set(doc, (found = {}))
  }
  const existing = found[priority]
  if (existing?.isConnected) {
    return existing
  }
  const region = doc.createElement("div")
  region.setAttribute("role", priority === "assertive" ? "alert" : "status")
  region.setAttribute("aria-live", priority)
  region.setAttribute("aria-atomic", "true")
  region.setAttribute(
    "data-ui-sdk-announcer",
    priority === "assertive" ? "assertive" : ""
  )
  region.style.cssText =
    "position:fixed;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap"
  doc.body.append(region)
  found[priority] = region
  return region
}

/**
 * Creates both live regions ahead of time, so the first announcement isn't
 * missed by screen readers that only notice regions present before a change.
 * @stable
 */
function prepareAnnouncements(doc: Document) {
  if (announcer || !doc.body) {
    return
  }
  regionIn(doc, "polite")
  regionIn(doc, "assertive")
}

/**
 * Has screen readers read `text` once they're idle, or at once with
 * `priority: "assertive"`. The same text twice is read twice.
 * @stable
 */
function announce(
  text: string,
  {
    priority = "polite",
    doc = typeof document === "undefined" ? undefined : document,
  }: { priority?: AnnouncePriority; doc?: Document } = {}
) {
  if (!text) {
    return
  }
  if (announcer) {
    return announcer(text, priority)
  }
  if (!doc?.body) {
    return
  }
  const region = regionIn(doc, priority)
  region.textContent = ""
  // Screen readers only notice text that changes after the region exists, and
  // the same text twice only after it was cleared. A newer text replaces one
  // still waiting at the same priority.
  clearTimeout(pending[priority])
  pending[priority] = setTimeout(() => {
    region.textContent = text
  }, 100)
}

export { announce, type AnnouncePriority, prepareAnnouncements, setAnnouncer }
