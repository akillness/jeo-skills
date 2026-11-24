import * as React from "react"
import {
  createChange,
  createResize,
  definePrimitive,
  live,
  type ChangeDetails,
  type ResizeBox,
  type ResizeDraft,
  type ResizeHandle,
  type ResizeReason,
} from "@ui-sdk/core"
import { usePart, usePrimitive, type PartProps } from "@ui-sdk/react/primitive"
import { useLog } from "../../shared/react/log"

type FrameState = {
  boxes: Record<string, ResizeBox>
  draft: ResizeDraft | null
}

type FrameOptions = {
  defaultBox: ResizeBox
  onBoxesChange?: (
    boxes: Record<string, ResizeBox>,
    details: ChangeDetails<ResizeReason>
  ) => void
}

const frame = definePrimitive({
  name: "frame",
  options: { defaultBox: "value", onBoxesChange: "callback" },
  state: (options: FrameOptions): FrameState => ({
    boxes: { frame: options.defaultBox },
    draft: null,
  }),
  live: ["draft"],
  api: (context) => {
    const change = createChange(context)
    return {
      resize: createResize<FrameState>(context, {
        boxes: (state) => state.boxes,
        draft: "draft",
        set: (value, details) => change("boxes", value, details),
        min: () => ({ width: 60, height: 40 }),
        bounds: () => ({ left: 0, top: 0, right: 272, bottom: 176 }),
        step: () => 4,
      }),
    }
  },
  slots: (slot) => ({
    box: slot({
      attrs: (state, { api }) => ({
        style: `${api.resize.boxStyle(state, "frame")};touch-action:none`,
      }),
      live: live<FrameState, any, {}>((state, { api }) => ({
        style: api.resize.style(state, "frame"),
      })),
      on: {
        pointerdown: (event, { el, api }) =>
          api.resize.pointerdown(event, "frame", "move", el!),
      },
    }),
    handle: slot<{ id: string; handle: ResizeHandle }>({
      props: { handle: "string" },
      attrs: (_state, { props, api }) => api.resize.handleAttrs(props.handle),
      on: {
        pointerdown: (event, { el, api, props }) =>
          api.resize.pointerdown(event, "frame", props.handle, el!),
        keydown: (event, { api, props }) =>
          api.resize.keydown(event, "frame", props.handle),
      },
    }),
  }),
})

function Frame({
  defaultBox,
  onBoxesChange,
  ...props
}: FrameOptions & PartProps<"div">) {
  const handle = usePrimitive(frame, { defaultBox, onBoxesChange })
  return usePart(handle, "box", {}, props, "div")
}

function FrameHandle({
  handle,
  ...props
}: { handle: ResizeHandle } & PartProps<"button">) {
  return usePart(
    frame,
    "handle",
    { id: handle, handle },
    { type: "button", ...props },
    "button"
  )
}

const handles: Partial<Record<ResizeHandle, string>> = {
  nw: "top left",
  n: "top",
  ne: "top right",
  e: "right",
  se: "bottom right",
  s: "bottom",
  sw: "bottom left",
  w: "left",
}

function Example() {
  const log = useLog()
  return (
    <div data-slot="resize-stage">
      <Frame
        aria-label="Frame"
        defaultBox={{ x: 68, y: 40, width: 136, height: 96 }}
        onBoxesChange={({ frame }, details) =>
          log(
            `${frame.width} × ${frame.height} at ${frame.x}, ${frame.y} (${details.reason})`
          )
        }
      >
        {(Object.keys(handles) as ResizeHandle[]).map((name) => (
          <FrameHandle
            key={name}
            handle={name}
            aria-label={`Resize ${handles[name]}`}
          />
        ))}
      </Frame>
    </div>
  )
}

export { Example }
