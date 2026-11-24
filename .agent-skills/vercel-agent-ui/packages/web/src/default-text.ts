import type { PrimitiveInstance } from "@ui-sdk/core"

// Parts that show text from state while the author leaves them empty, like a
// slider's value or a code's slot. Text the author wrote stays. `text` reads
// each part's text; parts of a nested owner of the same kind are skipped.
// Returns the unsubscribe, for the owner's `render` to return.
function showDefaultText(
  owner: HTMLElement,
  instance: PrimitiveInstance,
  selector: string,
  text: (el: HTMLElement, instance: PrimitiveInstance, index: number) => string
) {
  const update = () => {
    const parts = Array.from(
      owner.querySelectorAll<HTMLElement>(selector)
    ).filter((el) => el.closest(owner.localName) === owner)
    parts.forEach((el, index) => {
      if (!("text" in el.dataset) && el.childNodes.length) {
        return
      }
      el.dataset.text = ""
      const next = text(el, instance, index)
      if (el.textContent !== next) {
        el.textContent = next
      }
    })
  }
  const unsubscribe = instance.subscribe(update)
  queueMicrotask(update)
  return unsubscribe
}

export { showDefaultText }
