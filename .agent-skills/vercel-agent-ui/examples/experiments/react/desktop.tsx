import * as React from "react"
import {
  createChange,
  createResize,
  css,
  definePrimitive,
  live,
  type ChangeDetails,
  type ResizeBox,
  type ResizeDraft,
  type ResizeHandle,
  type ResizeReason,
} from "@ui-sdk/core"
import { createParts, usePart, type PartProps } from "@ui-sdk/react/primitive"

type DesktopOptions = {
  size: { width: number; height: number }
  boxes?: Record<string, ResizeBox>
  defaultBoxes?: Record<string, ResizeBox>
  onBoxesChange?: (
    boxes: Record<string, ResizeBox>,
    details: ChangeDetails<ResizeReason>
  ) => void
  defaultClosed?: string[]
  minSize?: { width: number; height: number }
}

type DesktopState = {
  boxes: Record<string, ResizeBox>
  draft: ResizeDraft | null
  order: string[]
  closed: string[]
  maximized: string[]
}

type DesktopWindowState = {
  active: boolean
  maximized: boolean
  dragging: ResizeHandle | undefined
}
type DesktopDockItemState = { open: boolean; active: boolean }

const handleNames: Record<Exclude<ResizeHandle, "move">, string> = {
  n: "top edge",
  s: "bottom edge",
  e: "right edge",
  w: "left edge",
  ne: "top right corner",
  nw: "top left corner",
  se: "bottom right corner",
  sw: "bottom left corner",
}

const desktop = /* @__PURE__ */ definePrimitive({
  name: "desktop",
  options: {
    size: "value",
    boxes: "value",
    defaultBoxes: "value",
    onBoxesChange: "callback",
    defaultClosed: "list",
    minSize: "value",
  },
  state: (options: DesktopOptions): DesktopState => {
    const boxes = options.boxes ?? options.defaultBoxes ?? {}
    return {
      boxes,
      draft: null,
      order: Object.keys(boxes),
      closed: options.defaultClosed ?? [],
      maximized: [],
    }
  },
  sync: (options) =>
    options.boxes === undefined ? {} : { boxes: options.boxes },
  controlled: ["boxes"],
  live: ["draft"],
  api: (context) => {
    const { store } = context
    const change = createChange(context)
    const resize = createResize<DesktopState>(context, {
      boxes: (state) => state.boxes,
      draft: "draft",
      set: (boxes, details) => change("boxes", boxes, details),
      min: () => context.options().minSize ?? { width: 200, height: 120 },
      bounds: () => {
        const { width, height } = context.options().size
        return { left: 0, top: 0, right: width, bottom: height }
      },
      disabled: (id) => store.get().maximized.includes(id),
      label: (id) => context.props<{ title: string }>("window", id)?.title,
    })
    const toggle = (list: string[], id: string, on: boolean) =>
      on
        ? list.includes(id)
          ? list
          : [...list, id]
        : list.filter((other) => other !== id)

    const api = {
      resize,
      front: (state: DesktopState) =>
        state.order.filter((id) => !state.closed.includes(id)).at(-1),
      raise(id: string) {
        const { order } = store.get()
        if (order.at(-1) !== id) {
          store.set({ order: [...order.filter((other) => other !== id), id] })
        }
      },
      show(id: string) {
        store.set({ closed: toggle(store.get().closed, id, false) })
        api.raise(id)
        queueMicrotask(() => context.element("window", id)?.focus())
      },
      close(id: string) {
        store.set({
          closed: toggle(store.get().closed, id, true),
          maximized: toggle(store.get().maximized, id, false),
        })
        const next = api.front(store.get())
        queueMicrotask(() =>
          (next
            ? context.element("window", next)
            : context.element("dock-item", id)
          )?.focus()
        )
      },
      toggleMaximized(id: string) {
        const { maximized } = store.get()
        store.set({ maximized: toggle(maximized, id, !maximized.includes(id)) })
        api.raise(id)
      },
    }
    return api
  },
  slots: (slot) => ({
    root: slot({
      attrs: () => ({
        role: "group",
        style: css({
          position: "relative",
          overflow: "hidden",
          "user-select": "none",
        }),
      }),
    }),
    window: slot<{ value: string; title: string }, DesktopWindowState>({
      props: { value: "string", title: "string" },
      present: (state, { key }) => !state.closed.includes(key),
      state: (state, { key, api }) => ({
        active: api.front(state) === key,
        maximized: state.maximized.includes(key),
        dragging: api.resize.dragging(state, key),
      }),
      attrs: (state, { key, id, api }) => {
        const maximized = state.maximized.includes(key)
        return {
          role: "dialog",
          "aria-labelledby": `${id}-${key}-title`,
          tabindex: "-1",
          "data-active": api.front(state) === key ? "" : undefined,
          "data-maximized": maximized ? "" : undefined,
          style: `${maximized ? css({ position: "absolute", inset: "0" }) : api.resize.boxStyle(state, key)};z-index:${state.order.indexOf(key) + 1}`,
        }
      },
      live: live<DesktopState, any, { value: string; title: string }>(
        (state, { key, api }) => ({
          style: api.resize.style(state, key),
          "data-dragging": api.resize.dragging(state, key),
        })
      ),
      on: {
        pointerdown: (_event, { api, key }) => api.raise(key),
        focusin: (_event, { api, key }) => api.raise(key),
      },
    }),
    title: slot<{ value: string }>({
      props: { value: { kind: "string", from: "window" } },
      attrs: (state, { key, id }) => ({
        id: `${id}-${key}-title`,
        tabindex: "0",
        "aria-roledescription": "title bar",
        "aria-describedby": `${id}-instructions`,
        style: css({
          cursor: state.maximized.includes(key) ? "default" : "move",
          "touch-action": "none",
        }),
      }),
      on: {
        pointerdown: (event, { el, api, key }) =>
          el && api.resize.pointerdown(event, key, "move", el),
        keydown: (event, { api, key }) =>
          api.resize.keydown(event, key, "move"),
        dblclick: (_event, { api, key }) => api.toggleMaximized(key),
      },
    }),
    handle: slot<{
      id: string
      window: string
      handle: Exclude<ResizeHandle, "move">
    }>({
      props: { window: "string", handle: "string" },
      present: (state, { props }) => !state.maximized.includes(props.window),
      attrs: (_state, { props, api }) => ({
        ...api.resize.handleAttrs(props.handle),
        tabindex: "0",
        "aria-roledescription": "resize handle",
        "aria-label": `Resize from the ${handleNames[props.handle]}`,
      }),
      on: {
        pointerdown: (event, { el, api, props }) =>
          el && api.resize.pointerdown(event, props.window, props.handle, el),
        keydown: (event, { api, props }) =>
          api.resize.keydown(event, props.window, props.handle),
      },
    }),
    maximize: slot<{ value: string }>({
      props: { value: { kind: "string", from: "window" } },
      attrs: (state, { key }) => ({
        type: "button",
        "aria-label": state.maximized.includes(key) ? "Restore" : "Maximize",
      }),
      on: { click: (_event, { api, key }) => api.toggleMaximized(key) },
    }),
    close: slot<{ value: string }>({
      props: { value: { kind: "string", from: "window" } },
      attrs: () => ({ type: "button", "aria-label": "Close" }),
      on: { click: (_event, { api, key }) => api.close(key) },
    }),
    dock: slot({ attrs: () => ({ role: "toolbar", "aria-label": "Dock" }) }),
    "dock-item": slot<{ value: string }, DesktopDockItemState>({
      props: { value: "string" },
      state: (state, { key, api }) => ({
        open: !state.closed.includes(key),
        active: api.front(state) === key,
      }),
      attrs: (state, { key, api }) => ({
        type: "button",
        "aria-pressed": String(!state.closed.includes(key)),
        "data-open": state.closed.includes(key) ? undefined : "",
        "data-active": api.front(state) === key ? "" : undefined,
      }),
      on: { click: (_event, { api, key }) => api.show(key) },
    }),
    instructions: slot({
      attrs: (_state, { id }) => ({ id: `${id}-instructions`, hidden: "" }),
    }),
  }),
})

const parts = createParts(desktop, {
  root: "div",
  dock: "div",
  "dock-item": "button",
  instructions: "div",
})

const DesktopWindowContext = React.createContext<string | null>(null)

function useDesktopWindow() {
  const id = React.useContext(DesktopWindowContext)
  if (id === null) {
    throw new Error("This part must be used inside <DesktopWindow>.")
  }
  return id
}

const Desktop = parts.Root

function DesktopWindow({
  value,
  title,
  ...props
}: { value: string; title: string } & PartProps<"div", DesktopWindowState>) {
  return (
    <DesktopWindowContext.Provider value={value}>
      {usePart(desktop, "window", { value, title }, props)}
    </DesktopWindowContext.Provider>
  )
}

function DesktopTitle(props: PartProps<"div">) {
  return usePart(desktop, "title", { value: useDesktopWindow() }, props)
}

function DesktopHandle({
  handle,
  ...props
}: { handle: Exclude<ResizeHandle, "move"> } & PartProps<"div">) {
  const win = useDesktopWindow()
  return usePart(
    desktop,
    "handle",
    { id: `${win}-${handle}`, window: win, handle },
    props
  )
}

function DesktopMaximize(props: PartProps<"button">) {
  return usePart(
    desktop,
    "maximize",
    { value: useDesktopWindow() },
    props,
    "button"
  )
}

function DesktopClose(props: PartProps<"button">) {
  return usePart(
    desktop,
    "close",
    { value: useDesktopWindow() },
    props,
    "button"
  )
}

const DesktopDock = parts.Dock

const DesktopDockItem = parts.DockItem

const DesktopInstructions = parts.Instructions

const size = { width: 560, height: 340 }
const handles = ["n", "e", "s", "w", "ne", "nw", "se", "sw"] as const
const apps = [
  {
    id: "notes",
    title: "Notes",
    box: { x: 24, y: 24, width: 240, height: 180 },
  },
  {
    id: "photos",
    title: "Photos",
    box: { x: 190, y: 84, width: 280, height: 200 },
  },
  {
    id: "music",
    title: "Music",
    box: { x: 326, y: 32, width: 210, height: 140 },
  },
]

function AppContent({ id }: { id: string }) {
  if (id === "notes") {
    return (
      <p data-slot="hint">
        Windows move by their title and resize by any edge or corner. Click one
        to bring it forward.
      </p>
    )
  }
  if (id === "photos") {
    return (
      <div data-slot="desktop-photos">
        {["#fdba74", "#a5b4fc", "#5eead4"]
          .flatMap((tone) => [tone, tone])
          .map((tone, i) => (
            <div
              key={i}
              data-slot="desktop-photo"
              style={{ background: tone }}
            />
          ))}
      </div>
    )
  }
  return (
    <div data-slot="stack">
      <span>Gymnopédie No. 1</span>
      <span data-slot="hint">Erik Satie</span>
      <span data-slot="desktop-progress">
        <span />
      </span>
    </div>
  )
}

function Example() {
  return (
    <Desktop
      size={size}
      defaultBoxes={Object.fromEntries(apps.map((app) => [app.id, app.box]))}
      aria-label="Desktop"
      style={
        {
          "--desktop-width": `${size.width}px`,
          "--desktop-height": `${size.height}px`,
        } as React.CSSProperties
      }
    >
      <div data-slot="desktop-screen">
        {apps.map((app) => (
          <DesktopWindow key={app.id} value={app.id} title={app.title}>
            <div data-slot="desktop-titlebar">
              <DesktopTitle>{app.title}</DesktopTitle>
              <DesktopMaximize>
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  <rect x="3" y="3" width="10" height="10" rx="1.5" />
                </svg>
              </DesktopMaximize>
              <DesktopClose>
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </DesktopClose>
            </div>
            <div data-slot="desktop-body">
              <AppContent id={app.id} />
            </div>
            {handles.map((which) => (
              <DesktopHandle key={which} handle={which} />
            ))}
          </DesktopWindow>
        ))}
      </div>
      <DesktopDock>
        {apps.map((app) => (
          <DesktopDockItem key={app.id} value={app.id}>
            {app.title}
          </DesktopDockItem>
        ))}
      </DesktopDock>
      <DesktopInstructions>
        Arrows on a window's title move it, and on a handle move that edge.
        Shift moves five times as far.
      </DesktopInstructions>
    </Desktop>
  )
}

export {
  Desktop,
  desktop,
  DesktopClose,
  DesktopDock,
  DesktopDockItem,
  type DesktopDockItemState,
  DesktopHandle,
  DesktopInstructions,
  DesktopMaximize,
  type DesktopOptions,
  DesktopTitle,
  DesktopWindow,
  type DesktopWindowState,
  Example,
}
