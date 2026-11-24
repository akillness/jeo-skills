import * as React from "react"
import {
  createChange,
  createResize,
  definePrimitive,
  live,
  type ResizeBox,
  type ResizeDraft,
  type ResizeHandle,
} from "@ui-sdk/core"
import { usePart, usePrimitive, type PartProps } from "@ui-sdk/react/primitive"
import { Checkbox, CheckboxIndicator } from "@ui-sdk/react/checkbox"
import { CheckIcon, PlayIcon } from "lucide-react"
import { useLog } from "../../shared/react/log"

type VideoState = {
  boxes: Record<string, ResizeBox>
  locked: boolean
  draft: ResizeDraft | null
}

type VideoOptions = {
  locked?: boolean
  onBoxesChange?: (boxes: Record<string, ResizeBox>) => void
}

const video = definePrimitive({
  name: "video",
  options: { locked: "boolean", onBoxesChange: "callback" },
  state: (options: VideoOptions): VideoState => ({
    boxes: { video: { x: 56, y: 43, width: 160, height: 90 } },
    locked: options.locked ?? true,
    draft: null,
  }),
  sync: (options) => ({ locked: options.locked ?? true }),
  live: ["draft"],
  api: (context) => {
    const change = createChange(context)
    return {
      resize: createResize<VideoState>(context, {
        boxes: (state) => state.boxes,
        draft: "draft",
        set: (value, details) => change("boxes", value, details),
        aspect: () => (context.store.get().locked ? 16 / 9 : undefined),
        min: () => ({ width: 96, height: 54 }),
        max: () => ({ width: 256, height: 144 }),
        bounds: () => ({ left: 0, top: 0, right: 272, bottom: 176 }),
        largeStep: () => 16,
      }),
    }
  },
  slots: (slot) => ({
    box: slot({
      attrs: (state, { api }) => ({
        style: `${api.resize.boxStyle(state, "video")};touch-action:none`,
      }),
      live: live<VideoState, any, {}>((state, { api }) => ({
        style: api.resize.style(state, "video"),
      })),
      on: {
        pointerdown: (event, { el, api }) =>
          api.resize.pointerdown(event, "video", "move", el!),
      },
    }),
    handle: slot<{ id: string; handle: ResizeHandle }>({
      props: { handle: "string" },
      attrs: (_state, { props, api }) => api.resize.handleAttrs(props.handle),
      on: {
        pointerdown: (event, { el, api, props }) =>
          api.resize.pointerdown(event, "video", props.handle, el!),
        keydown: (event, { api, props }) =>
          api.resize.keydown(event, "video", props.handle),
      },
    }),
  }),
})

function Video({
  locked,
  onBoxesChange,
  ...props
}: VideoOptions & PartProps<"div">) {
  const handle = usePrimitive(video, { locked, onBoxesChange })
  return usePart(handle, "box", {}, props, "div")
}

function VideoHandle({
  handle,
  ...props
}: { handle: ResizeHandle } & PartProps<"button">) {
  return usePart(
    video,
    "handle",
    { id: handle, handle },
    { type: "button", ...props },
    "button"
  )
}

const places: Partial<Record<ResizeHandle, string>> = {
  nw: "top left",
  ne: "top right",
  e: "right",
  se: "bottom right",
  sw: "bottom left",
  w: "left",
}

function Example() {
  const log = useLog()
  const [locked, setLocked] = React.useState(true)
  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <label data-slot="label">
          <Checkbox
            checked={locked}
            onCheckedChange={(next) => setLocked(next === true)}
          >
            <CheckboxIndicator>
              <CheckIcon aria-hidden="true" />
            </CheckboxIndicator>
          </Checkbox>
          Keep 16:9
        </label>
      </div>
      <div data-slot="resize-stage">
        <Video
          aria-label="Video"
          locked={locked}
          onBoxesChange={({ video }) =>
            log(`${Math.round(video.width)} × ${Math.round(video.height)}`)
          }
        >
          <PlayIcon aria-hidden="true" />
          {(Object.keys(places) as ResizeHandle[]).map((name) => (
            <VideoHandle
              key={name}
              handle={name}
              aria-label={`Resize ${places[name]}`}
            />
          ))}
        </Video>
      </div>
    </div>
  )
}

export { Example }
