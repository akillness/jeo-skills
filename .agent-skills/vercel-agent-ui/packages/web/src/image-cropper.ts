import { imageCropper, type ImageCropperApi } from "@ui-sdk/core/image-cropper"
import { createParts, ownButton, wrappedChild } from "./define-element"

// The range input the zoom wraps: the author's own, or one it makes.
function ownInput(el: HTMLElement) {
  const written = el.querySelector("input")
  if (written) {
    return written
  }
  const made = el.ownerDocument.createElement("input")
  el.append(made)
  return made
}

// The image part wraps your own <img>, with its `alt`, and the root's `src` sets its source.
function defineImageCropperElements() {
  createParts(imageCropper, {
    root: {
      tag: "ui-image-cropper",
      display: "block",
      state: {
        crop: {
          get: (api: ImageCropperApi) => api.getCrop(),
          set: (
            api: ImageCropperApi,
            crop: Parameters<ImageCropperApi["setCrop"]>[0] | null
          ) => {
            if (crop) {
              api.setCrop(crop)
            }
          },
        },
      },
      api: [
        "getCrop",
        "setCrop",
        "rotate",
        "flip",
        "getZoom",
        "setZoom",
        "focus",
      ],
    },
    viewport: { tag: "ui-image-cropper-viewport", display: "block" },
    image: {
      tag: "ui-image-cropper-image",
      display: "contents",
      target: wrappedChild("img"),
    },
    selection: { tag: "ui-image-cropper-selection", display: "block" },
    grid: { tag: "ui-image-cropper-grid", display: "block" },
    handle: { tag: "ui-image-cropper-handle", display: "block" },
    zoom: {
      tag: "ui-image-cropper-zoom",
      display: "contents",
      target: ownInput,
    },
    rotate: {
      tag: "ui-image-cropper-rotate",
      display: "contents",
      target: ownButton(),
    },
    flip: {
      tag: "ui-image-cropper-flip",
      display: "contents",
      target: ownButton(),
    },
  })
}

export { defineImageCropperElements }
