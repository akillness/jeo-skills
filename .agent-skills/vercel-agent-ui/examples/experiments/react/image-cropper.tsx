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

type ImageCropperOptions = {
  size: { width: number; height: number }
  crop?: ResizeBox
  defaultCrop?: ResizeBox
  onCropChange?: (crop: ResizeBox, details: ChangeDetails<ResizeReason>) => void
  aspect?: number
  minSize?: number
}

type ImageCropperState = { crop: ResizeBox; draft: ResizeDraft | null }

type ImageCropperRootState = {
  crop: ResizeBox
  dragging: ResizeHandle | undefined
}
type ImageCropperBoxState = { dragging: ResizeHandle | undefined }

const handleNames: Record<ResizeHandle, string> = {
  n: "top edge",
  s: "bottom edge",
  e: "right edge",
  w: "left edge",
  ne: "top right corner",
  nw: "top left corner",
  se: "bottom right corner",
  sw: "bottom left corner",
  move: "crop",
}

function fitAspect(
  box: ResizeBox,
  aspect: number,
  size: { width: number; height: number }
) {
  const width = Math.min(
    size.width,
    size.height * aspect,
    Math.max(box.width, box.height * aspect)
  )
  const height = width / aspect
  const x = Math.min(
    size.width - width,
    Math.max(0, box.x + box.width / 2 - width / 2)
  )
  const y = Math.min(
    size.height - height,
    Math.max(0, box.y + box.height / 2 - height / 2)
  )
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  }
}

const imageCropper = /* @__PURE__ */ definePrimitive({
  name: "crop-box",
  options: {
    size: "value",
    crop: "value",
    defaultCrop: "value",
    onCropChange: "callback",
    aspect: "number",
    minSize: "number",
  },
  state: (options: ImageCropperOptions): ImageCropperState => ({
    crop: options.crop ??
      options.defaultCrop ?? {
        x: 0,
        y: 0,
        width: options.size.width,
        height: options.size.height,
      },
    draft: null,
  }),
  sync: (options) => (options.crop === undefined ? {} : { crop: options.crop }),
  controlled: ["crop"],
  live: ["draft"],
  api: (context) => {
    const change = createChange(context)
    const resize = createResize<ImageCropperState>(context, {
      boxes: (state) => ({ crop: state.crop }),
      draft: "draft",
      set: (boxes, details) => change("crop", boxes.crop, details),
      min: () => ({
        width: context.options().minSize ?? 24,
        height: context.options().minSize ?? 24,
      }),
      bounds: () => {
        const { width, height } = context.options().size
        return { left: 0, top: 0, right: width, bottom: height }
      },
      aspect: () => context.options().aspect,
      label: () => "Crop",
    })
    return {
      resize,
      setCrop(crop: ResizeBox) {
        return resize.resizeTo("crop", crop)
      },
    }
  },
  slots: (slot) => ({
    root: slot<{}, ImageCropperRootState>({
      state: (state, { api }) => ({
        crop: api.resize.box(state, "crop")!,
        dragging: api.resize.dragging(state, "crop"),
      }),
      attrs: (_state, { id }) => ({
        role: "group",
        "aria-describedby": `${id}-instructions`,
        style: css({
          position: "relative",
          overflow: "hidden",
          "user-select": "none",
          "touch-action": "none",
        }),
      }),
    }),
    box: slot<{}, ImageCropperBoxState>({
      state: (state, { api }) => ({
        dragging: api.resize.dragging(state, "crop"),
      }),
      attrs: (state, { api }) => {
        const { crop } = state
        return {
          role: "group",
          tabindex: "0",
          "aria-roledescription": "crop",
          "aria-label": `Crop, ${crop.width} by ${crop.height} at ${crop.x}, ${crop.y}`,
          style: `${api.resize.boxStyle(state, "crop")};cursor:move;touch-action:none`,
        }
      },
      live: live<ImageCropperState, any, {}>((state, { api }) => ({
        style: api.resize.style(state, "crop"),
        "data-dragging": api.resize.dragging(state, "crop"),
      })),
      on: {
        pointerdown: (event, { el, api }) =>
          el && api.resize.pointerdown(event, "crop", "move", el),
        keydown: (event, { api }) => api.resize.keydown(event, "crop", "move"),
      },
    }),
    handle: slot<{ value: Exclude<ResizeHandle, "move"> }>({
      props: { value: "string" },
      attrs: (_state, { key, api }) => ({
        ...api.resize.handleAttrs(key as ResizeHandle),
        tabindex: "0",
        "aria-roledescription": "resize handle",
        "aria-label": `Resize from the ${handleNames[key as Exclude<ResizeHandle, "move">]}`,
      }),
      on: {
        pointerdown: (event, { el, api, key }) =>
          el && api.resize.pointerdown(event, "crop", key as ResizeHandle, el),
        keydown: (event, { api, key }) =>
          api.resize.keydown(event, "crop", key as ResizeHandle),
      },
    }),
    instructions: slot({
      attrs: (_state, { id }) => ({ id: `${id}-instructions`, hidden: "" }),
    }),
  }),
})

const parts = createParts(imageCropper, {
  root: "div",
  box: "div",
  instructions: "div",
})

const ImageCropper = parts.Root

const ImageCropperBox = parts.Box

function ImageCropperHandle({
  handle,
  ...props
}: { handle: Exclude<ResizeHandle, "move"> } & PartProps<"div">) {
  return usePart(imageCropper, "handle", { value: handle }, props)
}

const ImageCropperInstructions = parts.Instructions

const size = { width: 480, height: 300 }

function Landscape(props: React.SVGProps<SVGSVGElement>) {
  const sky = React.useId()
  return (
    <svg
      viewBox="0 0 480 300"
      preserveAspectRatio="none"
      aria-hidden="true"
      {...props}
    >
      <defs>
        <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fde68a" />
          <stop offset="0.6" stopColor="#fda4af" />
          <stop offset="1" stopColor="#c4b5fd" />
        </linearGradient>
      </defs>
      <rect width="480" height="300" fill={`url(#${sky})`} />
      <circle cx="330" cy="120" r="42" fill="#fff7ed" />
      <path
        d="M0 210 L90 130 L170 200 L260 110 L360 205 L430 160 L480 190 V300 H0 Z"
        fill="#7c3aed"
        opacity="0.55"
      />
      <path
        d="M0 250 L120 190 L210 240 L320 180 L480 245 V300 H0 Z"
        fill="#4c1d95"
        opacity="0.8"
      />
      <path d="M0 280 Q120 255 240 275 T480 270 V300 H0 Z" fill="#1e1b4b" />
    </svg>
  )
}

const ratios = [
  { label: "Free", value: undefined },
  { label: "1:1", value: 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "16:9", value: 16 / 9 },
]
const corners = ["nw", "ne", "sw", "se"] as const
const edges = ["n", "e", "s", "w"] as const
function Example() {
  const [crop, setCrop] = React.useState<ResizeBox>({
    x: 96,
    y: 60,
    width: 288,
    height: 180,
  })
  const [aspect, setAspect] = React.useState<number | undefined>(undefined)
  return (
    <div data-slot="stack">
      <div data-slot="row" role="group" aria-label="Ratio">
        {ratios.map((ratio) => (
          <button
            key={ratio.label}
            type="button"
            data-size="sm"
            aria-pressed={aspect === ratio.value}
            onClick={() => {
              setAspect(ratio.value)
              if (ratio.value) {
                setCrop(fitAspect(crop, ratio.value, size))
              }
            }}
          >
            {ratio.label}
          </button>
        ))}
      </div>
      <ImageCropper
        size={size}
        crop={crop}
        onCropChange={setCrop}
        aspect={aspect}
        aria-label="Photo"
        style={
          {
            "--crop-box-width": `${size.width}px`,
            "--crop-box-height": `${size.height}px`,
          } as React.CSSProperties
        }
      >
        <Landscape data-slot="crop-box-image" />
        <ImageCropperBox>
          <span data-slot="crop-box-grid" aria-hidden="true">
            {Array.from({ length: 9 }, (_, i) => (
              <span key={i} />
            ))}
          </span>
          {corners.map((corner) => (
            <ImageCropperHandle key={corner} handle={corner} />
          ))}
          {edges.map((edge) => (
            <ImageCropperHandle key={edge} handle={edge} />
          ))}
        </ImageCropperBox>
        <ImageCropperInstructions>
          Drag the crop or its handles. Arrows move the crop while it has focus,
          and move an edge while its handle has focus. Shift moves five times as
          far.
        </ImageCropperInstructions>
      </ImageCropper>
      <div data-slot="row">
        <span
          aria-hidden="true"
          data-slot="crop-box-preview"
          style={{ height: (96 * crop.height) / crop.width }}
        >
          <Landscape
            style={{
              width: (size.width * 96) / crop.width,
              height: (size.height * 96) / crop.width,
              left: (-crop.x * 96) / crop.width,
              top: (-crop.y * 96) / crop.width,
            }}
          />
        </span>
        <span data-slot="hint">
          {crop.width} × {crop.height} at {crop.x}, {crop.y}
        </span>
      </div>
    </div>
  )
}

export {
  Example,
  fitAspect,
  imageCropper,
  ImageCropper,
  ImageCropperBox,
  type ImageCropperBoxState,
  ImageCropperHandle,
  ImageCropperInstructions,
  type ImageCropperOptions,
  type ImageCropperRootState,
}
