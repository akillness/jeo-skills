// An image cropper's parts and their attributes. State and what the parts do
// live in image-cropper-api.ts.
import { resizeCursors } from "../../foundation/direct-manipulation/resize"
import { css } from "../../foundation/kernel/inline-style"
import { live } from "../../foundation/kernel/live"
import { subscribe } from "../../foundation/kernel/part"
import type { SlotFactory } from "../../foundation/kernel/primitive-types"
import type {
  ImageCropperFlipProps,
  ImageCropperHandlePosition,
  ImageCropperHandleProps,
  ImageCropperHandleState,
  ImageCropperState,
} from "./image-cropper"
import {
  isInert,
  isReady,
  layout,
  zoomText,
  type ImageCropperApi,
  type State,
} from "./image-cropper-api"
import { shownSize, smallest } from "./image-cropper-geometry"

function cropperState(state: State) {
  return {
    crop: state.crop,
    zoom: zoomText(state),
    loading: state.status === "loading",
    error: state.status === "error",
    dragging: !!state.dragging,
    mode: state.mode,
    shape: state.shape,
    disabled: state.disabled,
  } satisfies ImageCropperState
}

function dataAttrs(state: State) {
  return {
    "data-mode": state.mode,
    "data-shape": state.shape,
    "data-loading": state.status === "loading" ? "" : undefined,
    "data-error": state.status === "error" ? "" : undefined,
    "data-disabled": state.disabled ? "" : undefined,
  }
}

const px = (value: number) => `${Math.round(value * 100) / 100}px`

const arrowKeys = [
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "shift+ArrowUp",
  "shift+ArrowDown",
  "shift+ArrowLeft",
  "shift+ArrowRight",
] as const

// English by default. Pass `aria-label` in another language.
const handleNames: Record<ImageCropperHandlePosition, string> = {
  n: "Top edge",
  e: "Right edge",
  s: "Bottom edge",
  w: "Left edge",
  ne: "Top right corner",
  nw: "Top left corner",
  se: "Bottom right corner",
  sw: "Bottom left corner",
}

// Where on the selection's box each handle sits, as fractions of its size.
const handleSpots: Record<ImageCropperHandlePosition, [number, number]> = {
  n: [0.5, 0],
  e: [1, 0.5],
  s: [0.5, 1],
  w: [0, 0.5],
  ne: [1, 0],
  nw: [0, 0],
  se: [1, 1],
  sw: [0, 1],
}

// The selection's place, which also sets the image's, so a drag lays out nothing but these.
const selectionLive = live<State, ImageCropperApi, {}>((state) => {
  const at = layout(state)
  const { crop, natural } = state
  const dragging = state.dragging ? "" : undefined
  // Hidden until the image loads, with a value all the same.
  if (!crop || !natural) {
    return { "aria-valuenow": "0", "data-dragging": dragging }
  }
  const shown = shownSize(natural, crop.rotation)
  return {
    style: at
      ? css({
          left: px(at.selection.left),
          top: px(at.selection.top),
          width: px(at.selection.width),
          height: px(at.selection.height),
        })
      : undefined,
    "aria-valuenow": String(crop.x),
    "aria-valuemax": String(shown.width - crop.width),
    // English by default.
    "aria-valuetext": `${crop.width} by ${crop.height} pixels, at ${crop.x}, ${crop.y}`,
    "data-dragging": dragging,
  }
})

function imageCropperSlots(slot: SlotFactory<State, ImageCropperApi>) {
  return {
    root: slot<{}, ImageCropperState>({
      role: "group",
      state: cropperState,
      attrs: (state) => ({
        ...dataAttrs(state),
        "aria-busy": state.status === "loading" ? "true" : undefined,
      }),
      live: live((state) => ({
        "data-dragging": state.dragging ? "" : undefined,
      })),
    }),

    // The area the image shows in, which a frame's pointer pans and the wheel zooms.
    // Its padding keeps the image and the selection off its edges.
    viewport: slot<{}, ImageCropperState>({
      state: cropperState,
      attrs: (state) => ({
        ...dataAttrs(state),
        style: css({
          position: "relative",
          overflow: "hidden",
          "user-select": "none",
          "touch-action": state.mode === "frame" ? "none" : undefined,
          cursor:
            state.mode === "frame" && !isInert(state) ? "move" : undefined,
        }),
      }),
      // The image's ratio as it shows, for a viewport sized to fit it.
      live: live((state) => {
        const { crop, natural } = state
        const shown = crop && natural ? shownSize(natural, crop.rotation) : null
        return {
          style: shown
            ? `--image-cropper-aspect-ratio:${shown.width} / ${shown.height}`
            : undefined,
          "data-dragging": state.dragging ? "" : undefined,
        }
      }),
      on: {
        pointerdown: (event, { api, el }) =>
          el && api.internal.viewportPointerdown(event, el),
        wheel: (event, { api, el }) => el && api.internal.wheel(event, el),
      },
      bind(el, { api }) {
        api.internal.measure(el)
        const view = el.ownerDocument.defaultView
        const observer = view?.ResizeObserver
          ? new view.ResizeObserver(() => api.internal.measure(el))
          : undefined
        observer?.observe(el)
        return () => observer?.disconnect()
      },
    }),

    // The image, turned and flipped. Until it loads, and on the server, it shows as it is.
    image: slot<{}, ImageCropperState>({
      state: cropperState,
      attrs: (state) => ({
        src: state.src,
        draggable: "false",
        ...dataAttrs(state),
        style: css({ "pointer-events": "none", "user-select": "none" }),
      }),
      live: live((state) => {
        const at = layout(state)
        const { crop, natural } = state
        if (!at || !crop || !natural) {
          return {}
        }
        const flip = `scale(${crop.flipX ? -1 : 1}, ${crop.flipY ? -1 : 1})`
        return {
          style: css({
            position: "absolute",
            left: px(at.image.left + at.image.width / 2),
            top: px(at.image.top + at.image.height / 2),
            width: px(natural.width * at.scale),
            height: px(natural.height * at.scale),
            "max-width": "none",
            "max-height": "none",
            transform: `translate(-50%, -50%) ${flip} rotate(${crop.rotation}deg)`,
          }),
        }
      }),
      bind(el, { api }) {
        const img = el as HTMLImageElement
        let bound = true
        const load = () => bound && api.internal.loaded(img)
        const fail = () => bound && api.internal.failed()
        // An image already loaded, like a cached one, reports once the page
        // hydrates, so the server's markup matches the first render.
        if (img.complete && img.currentSrc) {
          queueMicrotask(img.naturalWidth ? load : fail)
        }
        img.addEventListener("load", load)
        img.addEventListener("error", fail)
        return () => {
          bound = false
          img.removeEventListener("load", load)
          img.removeEventListener("error", fail)
        }
      },
    }),

    // The crop. Arrows move it, plus and minus zoom, and R turns the image.
    selection: slot<{}, ImageCropperState>({
      role: "slider",
      focus: "tab-stop",
      keys: [...arrowKeys, "+", "-", "=", "r", "shift+R"],
      state: cropperState,
      attrs: (state) => ({
        hidden: isReady(state) ? undefined : "",
        tabindex: isInert(state) ? undefined : "0",
        // English by default. Pass `aria-label` in another language.
        "aria-label": "Crop",
        "aria-roledescription": "crop area",
        "aria-valuemin": "0",
        "aria-valuenow": undefined,
        "aria-disabled": state.disabled ? "true" : undefined,
        ...dataAttrs(state),
        style: css({
          position: "absolute",
          "touch-action": state.mode === "box" ? "none" : undefined,
          cursor: state.mode === "box" && !isInert(state) ? "move" : undefined,
        }),
      }),
      live: selectionLive,
      on: {
        pointerdown: (event, { api, el }) =>
          el && api.internal.selectionPointerdown(event, el, "move"),
        keydown: (event, { api }) => api.internal.keydown(event, "move"),
      },
    }),

    // Lines across the selection, in thirds, for CSS to draw. `data-dragging` shows them only during a drag.
    grid: slot<{}, ImageCropperState>({
      state: cropperState,
      attrs: (state) => ({
        "aria-hidden": "true",
        ...dataAttrs(state),
        style: css({
          position: "absolute",
          inset: "0",
          "pointer-events": "none",
        }),
      }),
      live: live((state) => ({
        "data-dragging": state.dragging ? "" : undefined,
      })),
    }),

    // An edge or corner of a box's selection, beside it in the viewport,
    // since a slider's children are hidden from assistive technology. Arrows move its edges.
    handle: slot<ImageCropperHandleProps, ImageCropperHandleState>({
      role: "slider",
      focus: "tab-stop",
      keys: [...arrowKeys, "+", "-", "=", "r", "shift+R"],
      props: { id: "id", position: "string" },
      state: (state, { props }) => ({
        ...cropperState(state),
        position: props.position,
      }),
      attrs: (state, { props }) => ({
        hidden: isReady(state) && state.mode === "box" ? undefined : "",
        tabindex: isInert(state) ? undefined : "0",
        "aria-label": handleNames[props.position] ?? props.position,
        "aria-roledescription": "resize handle",
        "aria-valuenow": undefined,
        "aria-orientation":
          props.position === "n" || props.position === "s"
            ? "vertical"
            : props.position === "e" || props.position === "w"
              ? "horizontal"
              : undefined,
        "aria-disabled": state.disabled ? "true" : undefined,
        "data-position": props.position,
        ...dataAttrs(state),
        style: css({
          position: "absolute",
          cursor: isInert(state) ? undefined : resizeCursors[props.position],
          "touch-action": "none",
        }),
      }),
      live: live((state, { props }) => {
        const { crop, natural } = state
        const dragging = state.dragging === props.position ? "" : undefined
        if (!crop || !natural) {
          return { "aria-valuenow": "0", "data-dragging": dragging }
        }
        const at = layout(state)
        const [across, down] = handleSpots[props.position] ?? [0, 0]
        const shown = shownSize(natural, crop.rotation)
        const least = smallest(shown, {
          aspect: state.aspectRatio,
          minWidth: state.minWidth,
          minHeight: state.minHeight,
          maxZoom: state.maxZoom,
        })
        const vertical = props.position === "n" || props.position === "s"
        return {
          style: at
            ? css({
                left: px(at.selection.left + across * at.selection.width),
                top: px(at.selection.top + down * at.selection.height),
              })
            : undefined,
          "aria-valuenow": String(vertical ? crop.height : crop.width),
          "aria-valuemin": String(
            Math.ceil(vertical ? least.height : least.width)
          ),
          "aria-valuemax": String(vertical ? shown.height : shown.width),
          // English by default.
          "aria-valuetext": `${crop.width} by ${crop.height} pixels`,
          "data-dragging": dragging,
        }
      }),
      on: {
        pointerdown: (event, { api, el, props }) =>
          el && api.internal.selectionPointerdown(event, el, props.position),
        keydown: (event, { api, props }) =>
          api.internal.keydown(event, props.position),
      },
    }),

    // A range input for the zoom, from 1 to `maxZoom`.
    zoom: slot<{}, ImageCropperState>({
      role: "slider",
      focus: "native",
      keys: { none: "The range input moves with them itself." },
      state: cropperState,
      attrs: (state) => ({
        type: "range",
        min: "1",
        max: String(state.maxZoom),
        step: "any",
        // English by default. Pass `aria-label` in another language.
        "aria-label": "Zoom",
        "aria-valuenow": undefined,
        disabled: isInert(state) ? "" : undefined,
        ...dataAttrs(state),
      }),
      live: live((state) => ({
        "aria-valuetext": `${Math.round(zoomText(state) * 100)}%`,
      })),
      on: {
        input: (event, { api, el }) =>
          el && api.internal.zoomInput(event, el as HTMLInputElement),
        change: (event, { api }) => api.internal.zoomCommit(event),
      },
      bind(el, part) {
        const input = el as HTMLInputElement
        const write = () => {
          const next = String(zoomText(part.store.get()))
          if (input.value !== next) {
            input.value = next
          }
        }
        write()
        return subscribe(part, write)
      },
    }),

    // Turns the image a quarter clockwise.
    rotate: slot<{}, ImageCropperState>({
      state: cropperState,
      attrs: (state) => ({
        type: "button",
        disabled: isInert(state) ? "" : undefined,
        ...dataAttrs(state),
      }),
      press: ({ api }, event) =>
        api.rotate(1, { reason: "rotate-press", event }),
    }),

    // Mirrors the image, left to right or top to bottom.
    flip: slot<ImageCropperFlipProps, ImageCropperState>({
      props: { id: "id", direction: "string" },
      state: cropperState,
      attrs: (state, { props }) => ({
        type: "button",
        disabled: isInert(state) ? "" : undefined,
        "data-direction": props.direction ?? "horizontal",
        ...dataAttrs(state),
      }),
      press: ({ api, props }, event) =>
        api.flip(props.direction ?? "horizontal", {
          reason: "flip-press",
          event,
        }),
    }),
  }
}

export { imageCropperSlots }
