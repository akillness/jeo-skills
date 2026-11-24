import type { ConfirmEntry, ConfirmOptions } from "@ui-sdk/core/dialog"
import { toasterInternals } from "@ui-sdk/core/renderer"
import {
  overlays as sharedOverlays,
  type OverlayEntry,
} from "@ui-sdk/core/overlays"
import type { Toaster } from "@ui-sdk/core/toast"
import { claimTag, whenGone } from "./define-element"
import type { UiOverlayHostElement } from "./events"
import { defineAlertDialogElements } from "./dialog"
import { defineToastElements } from "./toast"

/**
 * What `<ui-overlay-host>`'s `toast` property sets on the toast regions it renders.
 * @stable
 */
type OverlayHostToastOptions = {
  /** Attributes for the region, like `side`, `align`, `max` and `class`. */
  attributes?: Record<string, string>
  /** What each toast renders, like a `<template>` inside `<ui-toast-region>`. */
  template?: HTMLTemplateElement
}

function element(tag: string, text?: string) {
  const el = document.createElement(tag)
  if (text) {
    el.textContent = text
  }
  return el
}

// A toaster's region, unless the app placed one of its own.
function toasterRegion(host: UiOverlayHostElement, toaster: Toaster) {
  const region = element("ui-toast-region") as HTMLElement & {
    toaster?: Toaster
    hosted?: boolean
  }
  region.hosted = true
  region.toaster = toaster
  for (const [name, value] of Object.entries(host.toast?.attributes ?? {})) {
    region.setAttribute(name, value)
  }
  if (host.toast?.template) {
    region.append(host.toast.template.cloneNode(true))
  }
  const show = () => {
    const placed = toasterInternals(toaster).hasPlacedRegion()
    if (placed && region.isConnected) {
      region.remove()
    }
    if (!placed && !region.isConnected) {
      host.append(region)
    }
  }
  const stop = toaster.subscribe(show)
  show()
  return () => {
    stop()
    region.remove()
  }
}

// The alert dialog that asks a question for confirm().
function confirmDialog(host: UiOverlayHostElement, entry: ConfirmEntry) {
  const question = (entry.payload ?? {}) as Partial<ConfirmOptions>
  const dialog = element("ui-alert-dialog") as HTMLElement & {
    controller?: unknown
  }
  dialog.controller = entry.controller
  const content = element("ui-alert-dialog-content")
  content.append(element("ui-alert-dialog-title", question.title))
  if (question.description) {
    content.append(element("ui-alert-dialog-description", question.description))
  }
  const actions = element("div")
  const cancel = element("ui-alert-dialog-close")
  cancel.append(element("button", question.cancelLabel ?? "Cancel"))
  const agree = element("ui-alert-dialog-close")
  agree.setAttribute("value", "confirm")
  agree.append(element("button", question.confirmLabel ?? "Continue"))
  actions.append(cancel, agree)
  content.append(actions)
  dialog.append(content)
  dialog.addEventListener("openchangecomplete", (event) => {
    if ((event as CustomEvent<{ value: boolean }>).detail.value === false) {
      entry.done()
    }
  })
  host.append(dialog)
  // Its parts register a microtask after it connects. Then it can open.
  let opening = true
  const frame = requestAnimationFrame(() => {
    opening = false
    entry.open()
  })
  return () => {
    dialog.remove()
    if (!opening) {
      return
    }
    cancelAnimationFrame(frame)
    entry.done()
  }
}

// <ui-overlay-host> renders what toast() and confirm() open, from anywhere.
// Mount it once. Set `toast` to `{ attributes, template }` for the toast regions it renders.
function defineOverlayHostElements() {
  defineToastElements()
  defineAlertDialogElements()
  if (!claimTag("ui-overlay-host")) {
    return
  }
  customElements.define(
    "ui-overlay-host",
    class extends HTMLElement {
      #rendered = new Map<OverlayEntry, () => void>()
      #stop?: () => void
      #attached?: unknown

      connectedCallback() {
        const host = this as UiOverlayHostElement
        const overlays = host.overlays ?? sharedOverlays
        // Moved in one go, it's still rendering, and its confirms still wait
        // for their answer, unless it was given other overlays meanwhile.
        if (this.#stop && overlays === this.#attached) {
          return
        }
        this.#teardown()
        this.#attached = overlays
        const release = overlays.attachHost()
        const sync = () => {
          const entries = overlays.entries()
          for (const [entry, remove] of this.#rendered) {
            if (!entries.includes(entry)) {
              remove()
              this.#rendered.delete(entry)
            }
          }
          for (const entry of entries) {
            if (this.#rendered.has(entry)) {
              continue
            }
            if (entry.type === "toaster") {
              this.#rendered.set(
                entry,
                toasterRegion(
                  host,
                  (entry.data as { toaster: Toaster }).toaster
                )
              )
            }
            if (entry.type === "confirm") {
              this.#rendered.set(
                entry,
                confirmDialog(host, entry.data as ConfirmEntry)
              )
            }
          }
        }
        const unsubscribe = overlays.subscribe(sync)
        sync()
        this.#stop = () => {
          unsubscribe()
          release()
        }
      }

      disconnectedCallback() {
        whenGone(this, () => this.#teardown())
      }

      #teardown() {
        this.#stop?.()
        this.#stop = undefined
        for (const remove of this.#rendered.values()) {
          remove()
        }
        this.#rendered.clear()
      }
    }
  )
}

export { createOverlays, overlays } from "@ui-sdk/core/overlays"

export { defineOverlayHostElements, type OverlayHostToastOptions }
