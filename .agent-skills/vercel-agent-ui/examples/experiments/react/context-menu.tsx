import * as React from "react"
import {
  bindLayer,
  createChange,
  createRovingFocus,
  createTypeahead,
  css,
  definePrimitive,
  dispatch,
  isTypeaheadKey,
  labelOf,
  position,
  selects,
  type ChangeDetails,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

type Anchor = { x: number; y: number } | HTMLElement

type ContextMenuState = {
  open: boolean
  anchor: Anchor | null
  target: string | null
  focused: string | null
}

type ContextMenuOpenChangeReason =
  | "context-menu"
  | "long-press"
  | "context-key"
  | "item-press"
  | "escape-key"
  | "outside-press"
  | "window-blur"
  | "imperative"

type ContextMenuOptions = {
  onOpenChange?: (
    open: boolean,
    details: ChangeDetails<ContextMenuOpenChangeReason>
  ) => void
  onAction?: (
    value: string,
    details: ChangeDetails<"item-press"> & { target: string | null }
  ) => void
  delay?: number
}

type ContextMenuAreaState = {
  open: boolean
  target: string | null
}
type ContextMenuPopupState = { target: string | null }
type ContextMenuItemState = { disabled: boolean }

const contextMenu = /* @__PURE__ */ definePrimitive({
  name: "context-menu",
  options: { onOpenChange: "callback", onAction: "callback", delay: "number" },
  state: (_options: ContextMenuOptions): ContextMenuState => ({
    open: false,
    anchor: null,
    target: null,
    focused: null,
  }),
  api: (context) => {
    const { store } = context
    const change = createChange(context)
    const roving = createRovingFocus<
      ContextMenuState,
      { value: string; disabled?: boolean }
    >(context, {
      slot: "item",
      key: "focused",
      loop: () => true,
      disabled: (item) => !!item.props.disabled,
    })
    const typeahead = createTypeahead()
    let press: ReturnType<typeof setTimeout> | undefined
    let returnTo: HTMLElement | null = null
    let placement: ReturnType<typeof position> | undefined
    const placed = (next: ReturnType<typeof position> | undefined) =>
      (placement = next)

    const targetOf = (event: Event) =>
      (event.target as Element | null)?.closest<HTMLElement>("[data-target]") ??
      null

    const api = {
      roving,
      placed,
      openAt(
        anchor: Anchor,
        target: HTMLElement | null,
        details: { reason: ContextMenuOpenChangeReason; event?: Event }
      ) {
        returnTo = target ?? (document.activeElement as HTMLElement | null)
        store.set({
          anchor,
          target: target?.dataset.target ?? null,
          focused: null,
        })
        if (!store.get().open) {
          change("open", true, details)
        } else {
          placement?.place()
        }
      },
      close(details: { reason: ContextMenuOpenChangeReason; event?: Event }) {
        if (!store.get().open) {
          return
        }
        change("open", false, details)
        if (details.reason !== "outside-press") {
          returnTo?.focus()
        }
      },
      run(value: string, event: Event) {
        dispatch(context, "onAction", value, {
          reason: "item-press",
          event,
          target: store.get().target,
        })
        api.close({ reason: "item-press", event })
      },
      areaContextmenu(event: MouseEvent) {
        event.preventDefault()
        api.openAt({ x: event.clientX, y: event.clientY }, targetOf(event), {
          reason: "context-menu",
          event,
        })
      },
      areaPointerdown(event: PointerEvent) {
        if (event.pointerType !== "touch") {
          return
        }
        const target = targetOf(event)
        const at = { x: event.clientX, y: event.clientY }
        clearTimeout(press)
        press = setTimeout(
          () => api.openAt(at, target, { reason: "long-press", event }),
          context.options().delay ?? 500
        )
        const cancel = () => {
          clearTimeout(press)
          window.removeEventListener("pointerup", cancel)
          window.removeEventListener("pointermove", cancel)
        }
        window.addEventListener("pointerup", cancel)
        window.addEventListener("pointermove", cancel)
      },
      areaKeydown(event: KeyboardEvent) {
        if (
          event.key !== "ContextMenu" &&
          !(event.shiftKey && event.key === "F10")
        ) {
          return
        }
        event.preventDefault()
        const target = targetOf(event)
        if (target) {
          api.openAt(target, target, { reason: "context-key", event })
        }
      },
      menuKeydown(event: KeyboardEvent) {
        const el = event.target as HTMLElement
        if (event.key === "Tab") {
          event.preventDefault()
        } else if (isTypeaheadKey(event)) {
          const items = roving.items()
          const index = typeahead(
            event.key,
            items.map((item) => labelOf(item.el)),
            items.findIndex((item) => item.el === el)
          )
          if (index !== -1) {
            items[index].el.focus()
          }
        } else {
          roving.keydown(event, el)
        }
      },
      place: () => placement?.place(),
    }
    context.onDestroy(() => clearTimeout(press))
    return api
  },
  slots: (slot) => ({
    area: slot<{}, ContextMenuAreaState>({
      state: (state) => ({ open: state.open, target: state.target }),
      on: {
        contextmenu: (event, { api }) => api.areaContextmenu(event),
        pointerdown: (event, { api }) => api.areaPointerdown(event),
        keydown: (event, { api }) => api.areaKeydown(event),
      },
    }),
    menu: slot<{}, ContextMenuPopupState>({
      present: (state) => state.open,
      state: (state) => ({ target: state.target }),
      attrs: () => ({
        role: "menu",
        style: css({
          inset: "auto",
          margin: "0",
          "max-height": "var(--available-height)",
        }),
      }),
      bind: (el, { api, store }) => {
        const stopLayer = bindLayer(el, {
          topLayer: true,
          onDismiss: (reason, event) => api.close({ reason, event }),
        })
        const stopPosition = api.placed(
          position(
            () => store.get().anchor,
            el,
            () => ({
              side: "bottom",
              align: "start",
              sideOffset: store.get().anchor instanceof HTMLElement ? 4 : 2,
            })
          )
        )
        queueMicrotask(() => api.roving.items()[0]?.el.focus())
        return () => {
          stopPosition?.()
          api.placed(undefined)
          stopLayer()
        }
      },
      on: { keydown: (event, { api }) => api.menuKeydown(event) },
    }),
    item: slot<{ value: string; disabled?: boolean }, ContextMenuItemState>({
      props: { value: "string", disabled: "boolean" },
      state: (_state, { props }) => ({ disabled: !!props.disabled }),
      selects: selects({ focused: ({ key }) => [key, null] }),
      attrs: (state, part) => ({
        role: "menuitem",
        tabindex: part.api.roving.tabIndex(state, part),
        "aria-disabled": part.props.disabled ? "true" : undefined,
        "data-disabled": part.props.disabled ? "" : undefined,
      }),
      on: {
        click: (event, { api, key, props }) =>
          !props.disabled && api.run(key, event),
        keydown: (event, { api, key, props }) => {
          if ((event.key === "Enter" || event.key === " ") && !props.disabled) {
            event.preventDefault()
            api.run(key, event)
          }
        },
        pointermove: (_event, { el, api, key, props }) => {
          if (!props.disabled && el && el.ownerDocument.activeElement !== el) {
            api.roving.focus(key)
          }
        },
      },
      bind: (el, part) => part.api.roving.bind(el, part),
    }),
  }),
})

const parts = createParts(contextMenu, {
  area: "div",
  menu: "div",
  item: "div",
})

const ContextMenu = parts.Root

const ContextMenuArea = parts.Area

const ContextMenuPopup = parts.Menu

const ContextMenuItem = parts.Item

const files = [
  { value: "notes.md", kind: "Markdown", size: "4 KB" },
  { value: "roadmap.pdf", kind: "PDF", size: "1.2 MB" },
  { value: "logo.svg", kind: "Image", size: "8 KB" },
  { value: "budget.xlsx", kind: "Spreadsheet", size: "96 KB" },
  { value: "demo.mov", kind: "Video", size: "48 MB" },
]

const actions = [
  { value: "open", label: "Open" },
  { value: "rename", label: "Rename" },
  { value: "duplicate", label: "Duplicate" },
  { value: "share", label: "Share", disabled: true },
  { value: "trash", label: "Move to Trash" },
]

function Example() {
  const [log, setLog] = React.useState(
    "Right-click a file, long-press it, or focus one and press Shift+F10."
  )
  return (
    <ContextMenu
      onAction={(value, details) =>
        setLog(
          `${actions.find((action) => action.value === value)?.label} ${details.target ?? "the folder"}.`
        )
      }
    >
      <div data-slot="stack">
        <ContextMenuArea>
          {files.map((file) => (
            <div
              key={file.value}
              data-target={file.value}
              tabIndex={0}
              data-slot="context-menu-file"
            >
              <span>{file.value}</span>
              <span data-slot="hint">
                {file.kind} · {file.size}
              </span>
            </div>
          ))}
        </ContextMenuArea>
        <p data-slot="output" aria-live="polite">
          {log}
        </p>
      </div>
      <ContextMenuPopup aria-label="File actions">
        {actions.map((action) => (
          <ContextMenuItem
            key={action.value}
            value={action.value}
            disabled={action.disabled}
            data-destructive={action.value === "trash" ? "" : undefined}
          >
            {action.label}
          </ContextMenuItem>
        ))}
      </ContextMenuPopup>
    </ContextMenu>
  )
}

export {
  ContextMenu,
  ContextMenuArea,
  ContextMenuItem,
  ContextMenuPopup,
  contextMenu,
  Example,
  type ContextMenuAreaState,
  type ContextMenuItemState,
  type ContextMenuOpenChangeReason,
  type ContextMenuOptions,
  type ContextMenuPopupState,
}
