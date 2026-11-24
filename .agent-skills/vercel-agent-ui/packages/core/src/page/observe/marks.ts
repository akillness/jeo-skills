// The marks an app writes on its own elements for the agent bridge: a change
// a person must make (`data-agent-confirm`), a region agents stay out of
// (`data-agent-hidden`) and values that never reach the model
// (`data-agent-secret`). Each covers its element and everything inside it, so
// one mark on a section covers every control in it. People see no
// difference: the marks change no behavior, style or ARIA, and only the
// bridge reads them.
import { checkMarks as warnMarks } from "#dev"
import { composedClosest } from "../../foundation/platform/platform"

const marks = ["data-agent-confirm", "data-agent-hidden", "data-agent-secret"]

// Confirm text is page text that reaches the model and the person, so it's
// cut short, like a label would be. Every distinct mark a step touches is
// shown, so approving one warning never approves another unseen.
function confirmOf(elements: Element[]) {
  const texts = new Set<string>()
  for (const el of elements) {
    const text = composedClosest(el, "[data-agent-confirm]")?.getAttribute(
      "data-agent-confirm"
    )
    if (text != null) {
      texts.add(text.trim().slice(0, 200) || "This needs a person.")
    }
  }
  return texts.size ? [...texts].join("; ") : undefined
}

const isOffLimits = (elements: Element[]) =>
  elements.some((el) => composedClosest(el, "[data-agent-hidden]"))

const isSecret = (elements: Element[]) =>
  elements.some((el) => composedClosest(el, "[data-agent-secret]"))

// An element's text as it reads, with its spaces collapsed, and without the text of the
// elements in `skip`, like a tree branch's child items, of `data-agent-hidden` or of what a
// screen reader skips, like an item's check mark: "Ada Lovelace", not "✓ Ada Lovelace".
function textOf(el: Element, skip: Element[] = []) {
  let text = ""
  const walk = (node: Node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        text += child.textContent
      } else if (
        child instanceof Element &&
        !skip.includes(child) &&
        !child.hasAttribute("data-agent-hidden") &&
        child.getAttribute("aria-hidden") !== "true"
      ) {
        walk(child)
      }
    }
  }
  walk(el)
  return text.replace(/\s+/g, " ").trim()
}

// A misspelled mark does nothing, so development warns about one.
const checkMarks = (elements: Element[]) => warnMarks(elements, marks)

export { checkMarks, confirmOf, isOffLimits, isSecret, textOf }
