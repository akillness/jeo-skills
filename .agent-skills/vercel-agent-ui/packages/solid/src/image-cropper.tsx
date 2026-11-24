import { imageCropper } from "@ui-sdk/core/image-cropper"
import { createParts } from "./use-primitive"

const parts = createParts(imageCropper, {
  root: "div",
  viewport: "div",
  image: "img",
  selection: "div",
  grid: "div",
  handle: "div",
  zoom: "input",
  rotate: "button",
  flip: "button",
})

/**
 * The root: a group around the image and its controls, busy until the image loads.
 * @experimental
 */
const ImageCropper = parts.Root

/**
 * The area the image shows in. Give it a size; its padding keeps the image
 * off its edges. In a frame, a pointer pans the image and the wheel zooms it.
 * @experimental
 */
const ImageCropperViewport = parts.Viewport

/**
 * The image, from the root's `src`, turned and flipped. Give it an `alt`.
 * @experimental
 */
const ImageCropperImage = parts.Image

/**
 * The crop. A pointer drags it in a box; arrows move it, plus and minus
 * zoom, and R turns the image.
 * @experimental
 */
const ImageCropperSelection = parts.Selection

/**
 * Lines across the selection in thirds, for CSS to draw, with `data-dragging` during a drag.
 * @experimental
 */
const ImageCropperGrid = parts.Grid

/**
 * An edge or corner of the selection, by its `position`, that resizes it in a box.
 * @experimental
 */
const ImageCropperHandle = parts.Handle

/**
 * A range input for the zoom, from 1 to `maxZoom`.
 * @experimental
 */
const ImageCropperZoom = parts.Zoom

/**
 * A button that turns the image a quarter clockwise.
 * @experimental
 */
const ImageCropperRotate = parts.Rotate

/**
 * A button that mirrors the image, left to right or, with `direction="vertical"`, top to bottom.
 * @experimental
 */
const ImageCropperFlip = parts.Flip

export { createImageCropperController } from "@ui-sdk/core/image-cropper"
export type {
  ImageCrop,
  ImageCropperApi,
  ImageCropperChangeOptions,
  ImageCropperController,
  ImageCropperCropChangeDetails,
  ImageCropperCropChangeReason,
  ImageCropperCropCommitDetails,
  ImageCropperFlipDirection,
  ImageCropperFlipProps,
  ImageCropperHandlePosition,
  ImageCropperHandleProps,
  ImageCropperHandleState,
  ImageCropperMode,
  ImageCropperOptions,
  ImageCropperPrimitive,
  ImageCropperShape,
  ImageCropperState,
  ImageRotation,
} from "@ui-sdk/core/image-cropper"

export {
  ImageCropper,
  ImageCropperFlip,
  ImageCropperGrid,
  ImageCropperHandle,
  ImageCropperImage,
  ImageCropperRotate,
  ImageCropperSelection,
  ImageCropperViewport,
  ImageCropperZoom,
}
