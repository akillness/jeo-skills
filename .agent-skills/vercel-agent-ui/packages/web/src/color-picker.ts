import { colorPicker, type ColorPickerApi } from "@ui-sdk/core/color-picker"
import { createParts, ownButton } from "./define-element"

// The element an input or canvas part wraps: the author's own, or one it makes.
function own(tag: "input" | "canvas") {
  return (el: HTMLElement) => {
    const written = el.querySelector(tag)
    if (written) {
      return written
    }
    const made = el.ownerDocument.createElement(tag)
    el.append(made)
    return made
  }
}

// <ui-color-picker> is form-associated: it submits its value, a CSS color,
// under its name. Inputs, the canvas, the eye dropper and swatch items wrap
// the element they need, or make one.
function defineColorPickerElements() {
  createParts(colorPicker, {
    root: {
      tag: "ui-color-picker",
      display: "block",
      formAssociated: true,
      state: {
        value: {
          get: (api: ColorPickerApi) => api.getValue(),
          set: (api: ColorPickerApi, value: string) => api.setValue(value),
        },
      },
      api: ["getValue", "setValue", "focus"],
    },
    area: { tag: "ui-color-picker-area", display: "block" },
    "area-thumb": { tag: "ui-color-picker-area-thumb", display: "block" },
    "area-canvas": {
      tag: "ui-color-picker-area-canvas",
      display: "contents",
      target: own("canvas"),
    },
    slider: { tag: "ui-color-picker-slider", display: "block" },
    "slider-thumb": { tag: "ui-color-picker-slider-thumb", display: "block" },
    input: {
      tag: "ui-color-picker-input",
      display: "contents",
      target: own("input"),
    },
    "channel-input": {
      tag: "ui-color-picker-channel-input",
      display: "contents",
      target: own("input"),
    },
    swatch: { tag: "ui-color-picker-swatch", display: "block" },
    "eye-dropper": {
      tag: "ui-color-picker-eye-dropper",
      display: "contents",
      target: ownButton(),
    },
    swatches: { tag: "ui-color-picker-swatches", display: "block" },
    "swatch-item": {
      tag: "ui-color-picker-swatch-item",
      display: "contents",
      target: ownButton(),
    },
  })
}

export { defineColorPickerElements }
