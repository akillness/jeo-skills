import {
  createToaster as createCoreToaster,
  toast as coreToast,
  toastRegion,
  type Toast,
  type ToastActionDetails,
  type ToastItem,
  type Toaster,
} from "@ui-sdk/core/toast"
import { actionOf } from "./action"
import { createParts, wrappedButton } from "./define-element"
import type { UiToastRegionElement } from "./events"

/**
 * What toasts can say on the web: text, or a node.
 * @stable
 */
type ToastContent = string | Node

type RegionElement = UiToastRegionElement & { hosted?: boolean }
type RegionInstance = ReturnType<typeof toastRegion>

// What each region rendered: its list, and a toast element per toast id.
const rendered = new WeakMap<
  RegionElement,
  { list: HTMLOListElement; toasts: Map<string, HTMLElement> }
>()
// Parts whose content came from the toast's data, and that content, so only
// an update replaces it. Replacing the text under a press would cancel its
// click in Safari.
const filled = new WeakMap<Element, ToastContent | undefined>()
// Close buttons that show a toast's cancel, built from its data or left empty
// in a template, and the latest data of each rendered toast, so an update can
// add or change one.
const dataCloses = new WeakSet<Element>()
const latest = new WeakMap<Element, Toast<ToastContent>>()
// The `aria-label` an author gave a region. The region removes its name while
// it has no toasts, so it's kept from the start.
const authorLabels = new WeakMap<Element, string | undefined>()

const part = (tag: string) => document.createElement(tag)

// A part around a button, like <ui-toast-close><button></button></ui-toast-close>.
function button(tag: string) {
  const wrapper = part(tag)
  const el = part("button")
  el.setAttribute("type", "button")
  wrapper.append(el)
  return wrapper
}

// A toast's parts, built from its data, when the region has no template.
function fromData() {
  const root = part("ui-toast")
  const content = part("div")
  content.append(part("ui-toast-title"), part("ui-toast-description"))
  root.append(content)
  // Always there, and hidden without an action or cancel, so an update that adds one shows it.
  const close = button("ui-toast-close")
  dataCloses.add(close)
  root.append(button("ui-toast-action"), close)
  return root
}

// A toast's parts, cloned from the region's template. An empty close button
// is the toast's cancel, like one built from data.
function fromTemplate(template: HTMLTemplateElement) {
  const root = (
    template.content.cloneNode(true) as DocumentFragment
  ).querySelector("ui-toast") as HTMLElement
  for (const close of root.querySelectorAll("ui-toast-close")) {
    if (!(wrappedButton(close as HTMLElement) ?? close).childNodes.length) {
      dataCloses.add(close)
    }
  }
  return root
}

// The cancel handler of a close button built from data, read at press time.
const cancelOf =
  (el: HTMLElement) =>
  (event: Event | undefined, details: ToastActionDetails) => {
    const root = el.closest("ui-toast")
    return root
      ? latest.get(root)?.cancel?.onCancel?.(event, details)
      : undefined
  }

// Fills parts that have no content of their own from the toast's data, again
// after every update. Title, description or action without data stay hidden.
function fill(root: HTMLElement, toast: Toast<ToastContent>) {
  latest.set(root, toast)
  const contents: [string, ToastContent | undefined][] = [
    ["ui-toast-title", toast.title],
    ["ui-toast-description", toast.description],
    ["ui-toast-action", toast.action?.label],
    ["ui-toast-close", toast.cancel?.label],
  ]
  for (const [tag, content] of contents) {
    for (const el of root.querySelectorAll<HTMLElement>(tag)) {
      if (tag === "ui-toast-close" && !dataCloses.has(el)) {
        continue
      }
      const target =
        tag === "ui-toast-action" || tag === "ui-toast-close"
          ? (wrappedButton(el) ?? el)
          : el
      if (
        filled.has(target)
          ? filled.get(target) === content
          : target.childNodes.length
      ) {
        continue
      }
      el.hidden = content == null
      target.replaceChildren(...(content == null ? [] : [content]))
      filled.set(target, content)
    }
  }
}

// Keeps the list in step with the region's toasts: newest first, closing ones
// in place until their exit ends. Toasts fill again when they're new or
// updated, or with `refresh`, once a property changed.
function sync(
  region: RegionElement,
  instance: RegionInstance,
  refresh = false
) {
  const state = rendered.get(region)
  if (!state) {
    return
  }
  const template =
    region.querySelector<HTMLTemplateElement>(":scope > template")
  const items = instance.get().items as readonly ToastItem<ToastContent>[]
  const ids = new Set(items.map((item) => item.toast.id))
  // Forgotten before it goes: removing a focused toast blurs it, and what that
  // changes syncs again before remove() returns.
  for (const [id, el] of state.toasts) {
    if (!ids.has(id)) {
      state.toasts.delete(id)
      el.remove()
    }
  }
  let previous: Element | null = null
  for (const { toast } of items) {
    let el = state.toasts.get(toast.id)
    if (!el) {
      el = template ? fromTemplate(template) : fromData()
      el.setAttribute("toast", toast.id)
      state.toasts.set(toast.id, el)
    }
    if (refresh || latest.get(el) !== toast) {
      fill(el, toast)
      region.renderToast?.(toast, el)
    }
    // Filling can show or hide the title and description, which name the toast.
    instance.api.internal.label(toast.id)
    const next: Element | null = previous
      ? previous.nextElementSibling
      : state.list.firstElementChild
    if (next !== el) {
      state.list.insertBefore(el, next)
    }
    previous = el
  }
}

function render(region: RegionElement, instance: RegionInstance) {
  if (!rendered.has(region)) {
    const list = document.createElement("ol")
    list.setAttribute("data-slot", "toast-list")
    region.append(list)
    rendered.set(region, { list, toasts: new Map() })
  }
  sync(region, instance, true)
  return instance.subscribe(() => sync(region, instance))
}

// <ui-toast-region> shows a toaster's toasts. Place it once. Without children
// it renders each toast from its data.
// With a <template> holding a <ui-toast>, it clones that for each toast, and
// parts without content of their own show the toast's. An empty close button
// shows the toast's cancel, and hides without one:
//
// <ui-toast-region side="bottom" align="end">
//   <template>
//     <ui-toast class="toast">
//       <ui-toast-title></ui-toast-title>
//       <ui-toast-description></ui-toast-description>
//       <ui-toast-action><button></button></ui-toast-action>
//       <ui-toast-close><button></button></ui-toast-close>
//     </ui-toast>
//   </template>
// </ui-toast-region>
function defineToastElements() {
  createParts(toastRegion, {
    root: {
      tag: "ui-toast-region",
      self: "region",
      display: "block",
      // The region sets these itself: whether a host placed it, and its author's name.
      kinds: { placed: null, label: null },
      // Described on `UiToastRegionElement`.
      properties: ["renderToast"],
      options: (el) => {
        if (!authorLabels.has(el)) {
          authorLabels.set(el, el.getAttribute("aria-label") ?? undefined)
        }
        return {
          placed: !(el as RegionElement).hosted,
          label: authorLabels.get(el),
        }
      },
      api: ["focus", "pause", "resume"],
      render: (el, instance) => render(el as RegionElement, instance),
    },
    toast: {
      tag: "ui-toast",
      // Each toast fills the root slot, since the region fills `region`.
      slot: "root",
      display: "block",
      context: (el: HTMLElement) => ({
        id: el.getAttribute("toast") ?? undefined,
      }),
      // In the region's list, each toast is an item of it.
      render: (el: HTMLElement) => el.setAttribute("role", "listitem"),
    },
    title: { tag: "ui-toast-title", display: "block" },
    description: { tag: "ui-toast-description", display: "block" },
    // Runs the toast's action. Without one, an `action` attribute fires a
    // cancelable `action` event; pass a Promise to `event.detail.waitUntil()` to
    // keep the toast open, and the button pending, until it settles.
    action: {
      tag: "ui-toast-action",
      defaults: { dismiss: true },
      display: "contents",
      target: wrappedButton,
      // Always present, so the toast's own action runs when there's no attribute.
      context: (el) => ({
        onAction: el.hasAttribute("action") ? actionOf(el) : undefined,
      }),
    },
    // Closes the toast. With an `action` attribute, fires `action` first, like the action part.
    close: {
      tag: "ui-toast-close",
      display: "contents",
      target: wrappedButton,
      context: (el) => ({
        action: dataCloses.has(el)
          ? cancelOf(el)
          : el.hasAttribute("action")
            ? actionOf(el)
            : undefined,
      }),
    },
  })
}

/**
 * Shows a toast from anywhere: `toast("Saved")`, `toast.success(...)`,
 * `toast.promise(save(), { loading, success, error })`. Content is text or a node.
 * @stable
 */
const toast = coreToast as Toaster<ToastContent>

/**
 * Creates a queue of toasts and the function that adds to it, for a second
 * region with its own toasts. Pass it to that region as `toaster`.
 * @stable
 */
const createToaster = createCoreToaster as <Content = ToastContent>(
  options?: Parameters<typeof createCoreToaster>[0]
) => Toaster<Content>

export { createToaster, defineToastElements, toast, type ToastContent }
