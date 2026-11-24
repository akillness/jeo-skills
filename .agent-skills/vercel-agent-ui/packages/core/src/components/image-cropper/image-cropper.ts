// An image cropper around one crop of one image. This module is the public
// API and assembles the primitive. State and the API live in
// image-cropper-api.ts, and parts in image-cropper-parts.ts.
import type { ImageCrop } from "../../foundation/image/crop"
import { createController } from "../../foundation/kernel/controller"
import type {
  ChangeDetails,
  ChangeOptions,
  CommitDetails,
} from "../../foundation/kernel/details"
import { definePrimitive } from "../../foundation/kernel/primitive"
import type {
  Named,
  PrimitiveOptions,
} from "../../foundation/kernel/primitive-types"
import { imageCropperApi, initialState, syncState } from "./image-cropper-api"
import { imageCropperSlots } from "./image-cropper-parts"

/**
 * Why an image cropper's crop wants to change.
 * @experimental
 */
type ImageCropperCropChangeReason =
  | "image-load"
  | "drag"
  | "pinch"
  | "wheel"
  | "step-key"
  | "zoom-key"
  | "zoom-input"
  | "rotate-key"
  | "rotate-press"
  | "flip-press"
  | "aspect-ratio-change"
  | "imperative"

/**
 * What `onCropChange` receives after the crop.
 * @experimental
 */
type ImageCropperCropChangeDetails = ChangeDetails<ImageCropperCropChangeReason>

/**
 * What `onCropCommit` receives after the crop.
 * @experimental
 */
type ImageCropperCropCommitDetails = CommitDetails<ImageCropperCropChangeReason>

/**
 * Options for every write method on a controller.
 * @experimental
 */
type ImageCropperChangeOptions = ChangeOptions<ImageCropperCropChangeReason>

/**
 * How the crop changes: `"box"` moves and resizes a selection over the whole
 * image, `"frame"` pans and zooms the image under a selection that stays put.
 * @experimental
 */
type ImageCropperMode = "box" | "frame"

/**
 * The selection's shape. A circle only changes how it looks, and the crop is
 * still its box; pass the same shape to `cropImage`.
 * @experimental
 */
type ImageCropperShape = "rectangle" | "circle"

/**
 * Which way a flip mirrors the image: `"horizontal"` left to right, `"vertical"` top to bottom.
 * @experimental
 */
type ImageCropperFlipDirection = "horizontal" | "vertical"

/**
 * The edge or corner a handle resizes, by compass point.
 * @experimental
 */
type ImageCropperHandlePosition =
  "n" | "e" | "s" | "w" | "ne" | "nw" | "se" | "sw"

/**
 * Sets and inspects an image cropper from outside it. Pass it as the `controller` option.
 * @experimental
 */
function createImageCropperController() {
  return createController<{
    /** The crop, or null until the image loads. */
    getCrop: () => Required<ImageCrop> | null
    /** Sets the crop, as a user would. Returns whether it changed. */
    setCrop: (crop: ImageCrop, options?: ImageCropperChangeOptions) => boolean
    /** Turns the image a quarter clockwise, or counterclockwise with `-1`. */
    rotate: (direction?: 1 | -1, options?: ImageCropperChangeOptions) => boolean
    /** Mirrors the image left to right, or top to bottom with `"vertical"`. */
    flip: (
      direction?: ImageCropperFlipDirection,
      options?: ImageCropperChangeOptions
    ) => boolean
    /** How far the crop magnifies: 1 when it's as large as the image allows at its ratio. */
    getZoom: () => number
    /** Zooms to a level, about the crop's middle, within 1 and `maxZoom`. */
    setZoom: (zoom: number, options?: ImageCropperChangeOptions) => boolean
    /** Moves focus to the selection. */
    focus: () => void
  }>()
}

/**
 * A controller from `createImageCropperController()`. Pass it as the `controller` option.
 * @experimental
 */
type ImageCropperController = ReturnType<typeof createImageCropperController>

/**
 * The options `imageCropper` takes. A component takes them as props on its root.
 * @experimental
 */
type ImageCropperOptions = {
  /** The image's URL, like an object URL for a file someone picked. */
  src?: string
  /**
   * The crop, in the image's own pixels, from the top left of the image as
   * it shows once turned and flipped, with its `rotation`, `flipX` and
   * `flipY`. Pass it straight to `cropImage`. Pass it to control the cropper.
   */
  crop?: ImageCrop
  /**
   * The crop at first, when uncontrolled.
   * @defaultValue once the image loads, a crop at `aspectRatio` in the middle: four fifths of the largest in a box, the largest in a frame
   */
  defaultCrop?: ImageCrop
  /** Runs while the crop changes: on every step of a drag, a key or the wheel, and once an image loads. `details.cancel()` stops it. */
  onCropChange?: (
    crop: Required<ImageCrop>,
    details: ImageCropperCropChangeDetails
  ) => void
  /** Runs once an interaction that changed the crop ends: the pointer lifts, a key is pressed, the wheel pauses. For saving. */
  onCropCommit?: (
    crop: Required<ImageCrop>,
    details: ImageCropperCropCommitDetails
  ) => void
  /**
   * `"box"` moves and resizes a selection over the whole image. `"frame"`
   * keeps the selection still and as large as it fits, and pans and zooms
   * the image under it, like an avatar editor.
   * @defaultValue "box"
   */
  mode?: ImageCropperMode
  /** Keeps the crop's width over its height, like `1` for a square or `16 / 9`. Changing it fits the crop to the new ratio. */
  aspectRatio?: number
  /**
   * The selection's shape, as `data-shape`. A circle is still a box to the
   * crop, so pass `shape: "circle"` to `cropImage` too.
   * @defaultValue "rectangle"
   */
  shape?: ImageCropperShape
  /**
   * The narrowest the crop gets, in image pixels.
   * @defaultValue 1
   */
  minWidth?: number
  /**
   * The shortest the crop gets, in image pixels.
   * @defaultValue 1
   */
  minHeight?: number
  /**
   * How far the crop magnifies the image, where 1 is the largest crop the image allows.
   * @defaultValue 10
   */
  maxZoom?: number
  /** Stops every change: the selection can't be focused, and the buttons and zoom are disabled. */
  disabled?: boolean
  /** Sets the crop from anywhere. Create one with `createImageCropperController()`. */
  controller?: ImageCropperController
} & PrimitiveOptions

/**
 * The props the `handle` slot of `imageCropper` takes.
 * @experimental
 */
type ImageCropperHandleProps = {
  /** The edge or corner it resizes, like `"nw"` for the top left corner. */
  position: ImageCropperHandlePosition
}

/**
 * The props the `flip` slot of `imageCropper` takes.
 * @experimental
 */
type ImageCropperFlipProps = {
  /**
   * Which way it mirrors the image.
   * @defaultValue "horizontal"
   */
  direction?: ImageCropperFlipDirection
}

/**
 * What `render` functions and state-based class names receive.
 * @experimental
 */
type ImageCropperState = {
  /** The crop, or null until the image loads. */
  crop: Required<ImageCrop> | null
  /** How far the crop magnifies: 1 when it's as large as the image allows at its ratio. */
  zoom: number
  /** Whether the image is still loading, so nothing can change yet. */
  loading: boolean
  /** Whether the image failed to load. */
  error: boolean
  /** Whether a pointer is dragging the selection, a handle or the image. */
  dragging: boolean
  /** How the crop changes. */
  mode: ImageCropperMode
  /** The selection's shape. */
  shape: ImageCropperShape
  /** Whether the `disabled` option stops every change. */
  disabled: boolean
}

/**
 * The state the `handle` slot of `imageCropper` hands `render` functions and
 * state-based class names.
 * @experimental
 */
type ImageCropperHandleState = ImageCropperState & {
  /** The edge or corner it resizes. */
  position: ImageCropperHandlePosition
}

const imageCropperPrimitive = /* @__PURE__ */ definePrimitive({
  name: "image-cropper",
  options: {
    src: "string",
    crop: "value",
    defaultCrop: "value",
    onCropChange: "callback",
    onCropCommit: "callback",
    mode: "string",
    aspectRatio: "number",
    shape: "string",
    minWidth: "number",
    minHeight: "number",
    maxZoom: "number",
    disabled: "boolean",
    controller: "value",
  },
  state: initialState,
  sync: syncState,
  controlled: ["crop"],
  commits: ["crop"],
  live: ["crop", "box", "dragging"],
  api: imageCropperApi,
  slots: imageCropperSlots,
  agent: { actions: ["setCrop", "rotate", "flip", "setZoom"] },
})

/**
 * The type of `imageCropper`.
 * @experimental
 */
interface ImageCropperPrimitive extends Named<typeof imageCropperPrimitive> {}

/**
 * The image cropper primitive, with the slots `root`, `viewport`, `image`,
 * `selection`, `grid`, `handle`, `zoom`, `rotate`, `flip`. Render it with an
 * adapter's `usePrimitive`, or compose it inside your own primitive.
 * @experimental
 */
const imageCropper = imageCropperPrimitive as ImageCropperPrimitive

export {
  createImageCropperController,
  imageCropper,
  type ImageCropperChangeOptions,
  type ImageCropperController,
  type ImageCropperCropChangeDetails,
  type ImageCropperCropChangeReason,
  type ImageCropperCropCommitDetails,
  type ImageCropperFlipDirection,
  type ImageCropperFlipProps,
  type ImageCropperHandlePosition,
  type ImageCropperHandleProps,
  type ImageCropperHandleState,
  type ImageCropperMode,
  type ImageCropperOptions,
  type ImageCropperPrimitive,
  type ImageCropperShape,
  type ImageCropperState,
}
export type { ImageCropperApi } from "./image-cropper-api"
export type { ImageCrop, ImageRotation } from "../../foundation/image/crop"
