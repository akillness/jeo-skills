import type { PreferenceLike } from "@ui-sdk/core"
import { claimTag, upgradeProperties, whenGone } from "./define-element"
import type { UiPreferencesElement } from "./events"

// <ui-preferences> shows preferences on `data-*` attributes, so CSS styles by
// them: global ones on <html>, the rest on the element itself, which has
// `display: contents`. Set `preferences` to the list. For the first paint,
// render `preferencesScript(preferences)` from `@ui-sdk/core` in a <script>
// as its first child: it puts every saved value on its attribute as the page
// loads, before this element is defined.
function definePreferencesElements() {
  if (!claimTag("ui-preferences")) {
    return
  }
  customElements.define(
    "ui-preferences",
    class extends HTMLElement {
      #preferences: readonly PreferenceLike[] = []
      #stop?: () => void

      get preferences() {
        return this.#preferences
      }

      set preferences(list: readonly PreferenceLike[]) {
        this.#preferences = list
        if (this.isConnected) {
          this.#start()
        }
      }

      connectedCallback() {
        // Set before the element was defined, it would hide the setter.
        upgradeProperties(this, ["preferences"])
        this.style.display ||= "contents"
        // Moved in one go, it keeps following.
        if (!this.#stop) {
          this.#start()
        }
      }

      disconnectedCallback() {
        whenGone(this, () => this.#teardown())
      }

      #start() {
        this.#teardown()
        const list = this.#preferences
        const write = () => {
          for (const preference of list) {
            ;(preference.global ? document.documentElement : this).setAttribute(
              preference.attribute,
              preference.get().value
            )
          }
        }
        // Subscribing first reads back what was saved.
        const stops = list.map((preference) => preference.subscribe(write))
        write()
        this.#stop = () => stops.forEach((stop) => stop())
      }

      #teardown() {
        this.#stop?.()
        this.#stop = undefined
      }
    } satisfies CustomElementConstructor & { new (): UiPreferencesElement }
  )
}

export { definePreferencesElements }
