import * as React from "react"
import {
  createChange,
  createResize,
  css,
  definePrimitive,
  type ResizeBox,
  type ResizeDraft,
} from "@ui-sdk/core"
import { createParts, usePart, type PartProps } from "@ui-sdk/react/primitive"
import { LockIcon } from "lucide-react"

type DesktopState = {
  windows: Record<string, ResizeBox>
  draft: ResizeDraft | null
}

const titles: Record<string, string> = { mail: "Mail", notes: "Notes" }

const desktop = definePrimitive({
  name: "desktop",
  state: (): DesktopState => ({
    windows: {
      mail: { x: 20, y: 20, width: 160, height: 100 },
      notes: { x: 200, y: 100, width: 140, height: 100 },
    },
    draft: null,
  }),
  api: (context) => {
    const change = createChange(context)
    const resize = createResize<DesktopState>(context, {
      boxes: (state) => state.windows,
      draft: "draft",
      set: (value, details) => change("windows", value, details),
      min: () => ({ width: 100, height: 60 }),
      bounds: () => ({ left: 0, top: 0, right: 360, bottom: 220 }),
      scale: () => 0.75,
      disabled: (key) => key === "notes",
      label: (key) => titles[key],
      message: ({ label, handle, box }) =>
        handle === "move"
          ? `${label} moved.`
          : `${label} is ${box.width} by ${box.height}.`,
    })
    return {
      resize,
      act(action: string) {
        if (action === "maximize") {
          resize.resizeTo("mail", { x: 0, y: 0, width: 360, height: 220 })
        } else if (action === "grow") {
          resize.resizeBy("mail", "se", 40, 40)
        }
      },
    }
  },
  slots: (slot) => ({
    root: slot<{}, { mail: ResizeBox | null }>({
      state: (state, { api }) => ({ mail: api.resize.box(state, "mail") }),
    }),
    screen: slot({
      attrs: () => ({
        style: css({
          position: "relative",
          width: "360px",
          height: "220px",
          transform: "scale(0.75)",
          "transform-origin": "0 0",
        }),
      }),
    }),
    window: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, { api, key }) => ({
        role: "group",
        "aria-label": titles[key],
        "aria-disabled": key === "notes" ? "true" : undefined,
        "data-resizing": api.resize.dragging(state, key),
        style: `${api.resize.boxStyle(state, key)};${api.resize.style(state, key) ?? ""};touch-action:none`,
      }),
      on: {
        pointerdown: (event, { el, api, key }) =>
          api.resize.pointerdown(event, key, "move", el!),
      },
    }),
    corner: slot<{ id: string; box: string }>({
      props: { box: "string" },
      attrs: (_state, { api }) => api.resize.handleAttrs("se"),
      on: {
        pointerdown: (event, { el, api, props }) =>
          api.resize.pointerdown(event, props.box, "se", el!),
      },
    }),
    action: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({ type: "button" }),
      press: ({ api, key }) => api.act(key),
    }),
  }),
})

const parts = createParts(desktop, {
  root: "div",
  screen: "div",
  window: "div",
  action: "button",
})

const Desktop = parts.Root

const DesktopScreen = parts.Screen

const DesktopWindow = parts.Window

function DesktopCorner({ box, ...props }: { box: string } & PartProps<"div">) {
  return usePart(desktop, "corner", { id: `${box}-se`, box }, props, "div")
}

const DesktopAction = parts.Action

function Example() {
  return (
    <Desktop>
      {({ mail }) => (
        <>
          <div data-slot="controls">
            <DesktopAction data-size="sm" value="maximize">
              Maximize
            </DesktopAction>
            <DesktopAction data-size="sm" value="grow">
              Grow
            </DesktopAction>
          </div>
          <div data-slot="resize-stage">
            <DesktopScreen>
              {Object.entries(titles).map(([key, title]) => (
                <DesktopWindow key={key} value={key}>
                  <div data-slot="resize-titlebar">
                    {title}
                    {key === "mail" ? (
                      <span data-slot="hint">
                        {Math.round(mail!.width)} × {Math.round(mail!.height)}
                      </span>
                    ) : (
                      <LockIcon aria-hidden="true" />
                    )}
                  </div>
                  <DesktopCorner box={key} />
                </DesktopWindow>
              ))}
            </DesktopScreen>
          </div>
        </>
      )}
    </Desktop>
  )
}

export { Example }
