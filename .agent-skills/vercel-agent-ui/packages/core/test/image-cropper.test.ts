// @vitest-environment jsdom
import { describe, expect, test, vi } from "vitest"
import {
  imageCropper,
  type ImageCropperOptions,
} from "../src/components/image-cropper/image-cropper"
import { layoutOf } from "../src/components/image-cropper/image-cropper-geometry"
import { attrs, bind, liveAttrs } from "../src/foundation/kernel/part"

const make = (options: ImageCropperOptions = {}) =>
  imageCropper({ id: "c", src: "photo.png", ...options })

const load = (cropper: ReturnType<typeof make>, width = 400, height = 300) =>
  cropper.api.internal.loaded({
    naturalWidth: width,
    naturalHeight: height,
  } as HTMLImageElement)

const key = (key: string, shiftKey = false) =>
  new KeyboardEvent("keydown", { key, shiftKey, cancelable: true })

const plain = { rotation: 0, flipX: false, flipY: false } as const

describe("image cropper", () => {
  test("shows no crop until the image loads, then crops four fifths of the largest box at the ratio", () => {
    const onCropChange = vi.fn()
    const onCropCommit = vi.fn()
    const cropper = make({ aspectRatio: 1, onCropChange, onCropCommit })
    expect(attrs(cropper.part("root", {}))).toMatchObject({
      "aria-busy": "true",
      "data-loading": "",
    })
    expect(attrs(cropper.part("selection", {}))).toMatchObject({ hidden: "" })
    expect(cropper.api.getCrop()).toBe(null)
    load(cropper)
    const crop = { x: 80, y: 30, width: 240, height: 240, ...plain }
    expect(cropper.api.getCrop()).toEqual(crop)
    expect(onCropChange).toHaveBeenCalledOnce()
    expect(onCropChange.mock.lastCall![1].reason).toBe("image-load")
    expect(onCropCommit).toHaveBeenCalledWith(
      crop,
      expect.objectContaining({ reason: "image-load" })
    )
    expect(attrs(cropper.part("selection", {}))).toMatchObject({
      role: "slider",
      tabindex: "0",
    })
    expect(liveAttrs(cropper.part("selection", {}))).toMatchObject({
      "aria-valuenow": "80",
      "aria-valuemax": "160",
      "aria-valuetext": "240 by 240 pixels, at 80, 30",
    })
  })

  test("a frame starts with the largest crop, and a box never below its minimum", () => {
    const frame = make({ mode: "frame", aspectRatio: 1 })
    load(frame)
    expect(frame.api.getCrop()).toEqual({
      x: 50,
      y: 0,
      width: 300,
      height: 300,
      ...plain,
    })
    const box = make({ minWidth: 380 })
    load(box)
    expect(box.api.getCrop()).toMatchObject({ width: 380, height: 285 })
  })

  test("arrows move the crop inside the image, ten times as far with Shift, and commit each press", () => {
    const onCropCommit = vi.fn()
    const cropper = make({
      defaultCrop: { x: 10, y: 10, width: 100, height: 100 },
      onCropCommit,
    })
    load(cropper)
    cropper.api.internal.keydown(key("ArrowRight"), "move")
    cropper.api.internal.keydown(key("ArrowDown", true), "move")
    expect(cropper.api.getCrop()).toMatchObject({ x: 11, y: 20 })
    cropper.api.internal.keydown(key("ArrowLeft", true), "move")
    cropper.api.internal.keydown(key("ArrowLeft", true), "move")
    expect(cropper.api.getCrop()).toMatchObject({ x: 0, y: 20 })
    expect(onCropCommit).toHaveBeenCalledTimes(4)
  })

  test("arrows on a handle move its edges, and a ratio holds", () => {
    const cropper = make({
      defaultCrop: { x: 100, y: 100, width: 100, height: 100 },
    })
    load(cropper)
    cropper.api.internal.keydown(key("ArrowRight", true), "se")
    expect(cropper.api.getCrop()).toMatchObject({
      x: 100,
      y: 100,
      width: 110,
      height: 100,
    })
    cropper.api.internal.keydown(key("ArrowUp"), "e")
    expect(cropper.api.getCrop()).toMatchObject({ width: 110, height: 100 })
    const square = make({
      aspectRatio: 1,
      defaultCrop: { x: 100, y: 100, width: 100, height: 100 },
    })
    load(square)
    square.api.internal.keydown(key("ArrowLeft", true), "nw")
    expect(square.api.getCrop()).toMatchObject({
      x: 90,
      y: 90,
      width: 110,
      height: 110,
    })
  })

  test("zoom shrinks the crop about its middle, from 1 to maxZoom", () => {
    const cropper = make({ aspectRatio: 1, maxZoom: 3 })
    load(cropper)
    expect(cropper.api.getZoom()).toBe(1.25)
    cropper.api.setZoom(2)
    expect(cropper.api.getCrop()).toMatchObject({
      x: 125,
      y: 75,
      width: 150,
      height: 150,
    })
    cropper.api.setZoom(8)
    expect(cropper.api.getCrop()).toMatchObject({ width: 100, height: 100 })
    cropper.api.internal.keydown(key("-"), "move")
    expect(cropper.api.getZoom()).toBeCloseTo(2.4)
    cropper.api.setZoom(0.5)
    expect(cropper.api.getZoom()).toBe(1)
  })

  test("a quarter turn turns the crop with the image and swaps the flips", () => {
    const cropper = make({
      defaultCrop: { x: 0, y: 0, width: 100, height: 50, flipX: true },
    })
    load(cropper)
    cropper.api.rotate()
    expect(cropper.api.getCrop()).toEqual({
      x: 250,
      y: 0,
      width: 50,
      height: 100,
      rotation: 90,
      flipX: false,
      flipY: true,
    })
    cropper.api.internal.keydown(key("R", true), "move")
    expect(cropper.api.getCrop()).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      rotation: 0,
      flipX: true,
      flipY: false,
    })
  })

  test("at a fixed ratio, a turn keeps the crop's zoom and shape", () => {
    const cropper = make({ aspectRatio: 4 / 3 })
    load(cropper, 400, 300)
    cropper.api.setZoom(2)
    cropper.api.rotate()
    const crop = cropper.api.getCrop()!
    expect(crop.rotation).toBe(90)
    expect(crop.width / crop.height).toBeCloseTo(4 / 3, 1)
    expect(cropper.api.getZoom()).toBeCloseTo(2, 1)
    expect(crop.x + crop.width).toBeLessThanOrEqual(300)
    const least = make({ aspectRatio: 4 / 3, minWidth: 100 })
    load(least, 400, 300)
    least.api.setZoom(4)
    least.api.rotate()
    expect(least.api.getCrop()).toMatchObject({ width: 100, height: 75 })
  })

  test("a flip mirrors the crop across the image", () => {
    const cropper = make({
      defaultCrop: { x: 10, y: 20, width: 100, height: 50 },
    })
    load(cropper)
    cropper.api.flip()
    expect(cropper.api.getCrop()).toMatchObject({ x: 290, y: 20, flipX: true })
    cropper.api.flip("vertical")
    expect(cropper.api.getCrop()).toMatchObject({ x: 290, y: 230, flipY: true })
  })

  test("a controlled crop changes only when the owner passes it back", () => {
    const onCropChange = vi.fn()
    const onCropCommit = vi.fn()
    const crop = { x: 0, y: 0, width: 100, height: 100 }
    const cropper = make({ crop, onCropChange, onCropCommit })
    load(cropper)
    expect(onCropChange).not.toHaveBeenCalled()
    cropper.api.internal.keydown(key("ArrowRight"), "move")
    expect(onCropChange.mock.lastCall![0]).toMatchObject({ x: 1 })
    expect(onCropCommit.mock.lastCall![0]).toMatchObject({ x: 1 })
    expect(cropper.api.getCrop()).toMatchObject({ x: 0 })
  })

  test("a controlled crop changed in place moves the cropper", () => {
    const crop = { x: 0, y: 0, width: 100, height: 100 }
    const cropper = make({ crop })
    load(cropper)
    crop.x = 40
    cropper.setOptions({ id: "c", src: "photo.png", crop })
    expect(cropper.api.getCrop()).toMatchObject({ x: 40 })
  })

  test("a new ratio fits the crop about its middle", async () => {
    const onCropChange = vi.fn()
    const cropper = make({ onCropChange })
    load(cropper)
    cropper.setOptions({
      id: "c",
      src: "photo.png",
      onCropChange,
      aspectRatio: 1,
    })
    await Promise.resolve()
    expect(cropper.api.getCrop()).toMatchObject({
      x: 80,
      y: 30,
      width: 240,
      height: 240,
    })
    expect(onCropChange.mock.lastCall![1].reason).toBe("aspect-ratio-change")
  })

  test("a new image loads again and starts its own crop", () => {
    const cropper = make({
      defaultCrop: { x: 10, y: 10, width: 50, height: 50 },
    })
    load(cropper)
    cropper.setOptions({ id: "c", src: "other.png" })
    expect(attrs(cropper.part("root", {}))).toMatchObject({
      "data-loading": "",
    })
    load(cropper, 200, 100)
    expect(cropper.api.getCrop()).toEqual({
      x: 20,
      y: 10,
      width: 160,
      height: 80,
      ...plain,
    })
  })

  test("nothing changes while disabled, and the buttons are disabled", () => {
    const cropper = make({ disabled: true })
    load(cropper)
    const before = cropper.api.getCrop()
    cropper.api.internal.keydown(key("ArrowRight"), "move")
    expect(cropper.api.rotate()).toBe(false)
    expect(cropper.api.getCrop()).toEqual(before)
    expect(attrs(cropper.part("rotate", {}))).toMatchObject({ disabled: "" })
    expect(attrs(cropper.part("selection", {})).tabindex).toBeUndefined()
  })

  test("a drag or a pan stops where it is once the cropper is disabled", async () => {
    const pointer = (type: string, clientX: number) =>
      new PointerEvent(type, {
        pointerId: 1,
        pointerType: "mouse",
        button: 0,
        buttons: type === "pointerup" ? 0 : 1,
        clientX,
        clientY: 150,
        bubbles: true,
        cancelable: true,
      })
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve))
    for (const mode of ["box", "frame"] as const) {
      const onCropCommit = vi.fn()
      const options = {
        mode,
        defaultCrop: { x: 100, y: 100, width: 100, height: 100 },
        onCropCommit,
      }
      const cropper = make(options)
      const viewport = document.body.appendChild(document.createElement("div"))
      Object.defineProperties(viewport, {
        clientWidth: { value: 400 },
        clientHeight: { value: 300 },
      })
      viewport.getBoundingClientRect = () => new DOMRect(0, 0, 400, 300)
      const unbind = bind(cropper.part("viewport", {}), viewport)
      load(cropper)
      if (mode === "box") {
        cropper.api.internal.selectionPointerdown(
          pointer("pointerdown", 150),
          viewport,
          "move"
        )
      } else {
        cropper.api.internal.viewportPointerdown(
          pointer("pointerdown", 150),
          viewport
        )
      }
      viewport.dispatchEvent(pointer("pointermove", 170))
      await frame()
      const held = cropper.api.getCrop()
      expect(held!.x).not.toBe(100)
      cropper.setOptions({
        id: "c",
        src: "photo.png",
        ...options,
        disabled: true,
      })
      expect(onCropCommit).toHaveBeenCalledTimes(1)
      viewport.dispatchEvent(pointer("pointermove", 220))
      await frame()
      viewport.dispatchEvent(pointer("pointerup", 220))
      expect(cropper.api.getCrop()).toEqual(held)
      expect(onCropCommit).toHaveBeenCalledTimes(1)
      unbind?.()
      cropper.destroy()
    }
  })

  test("Escape during a drag or a pan puts the crop back, and reports the last pointer event", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const pointer = (type: string, clientX: number) =>
      new PointerEvent(type, {
        pointerId: 1,
        pointerType: "mouse",
        button: 0,
        buttons: 1,
        clientX,
        clientY: 150,
        bubbles: true,
        cancelable: true,
      })
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve))
    for (const mode of ["box", "frame"] as const) {
      const onCropChange = vi.fn()
      const defaultCrop = { x: 100, y: 100, width: 100, height: 100 }
      const cropper = make({ mode, defaultCrop, onCropChange })
      const viewport = document.body.appendChild(document.createElement("div"))
      Object.defineProperties(viewport, {
        clientWidth: { value: 400 },
        clientHeight: { value: 300 },
      })
      viewport.getBoundingClientRect = () => new DOMRect(0, 0, 400, 300)
      const unbind = bind(cropper.part("viewport", {}), viewport)
      load(cropper)
      const before = cropper.api.getCrop()
      if (mode === "box") {
        cropper.api.internal.selectionPointerdown(
          pointer("pointerdown", 150),
          viewport,
          "move"
        )
      } else {
        cropper.api.internal.viewportPointerdown(
          pointer("pointerdown", 150),
          viewport
        )
      }
      viewport.dispatchEvent(pointer("pointermove", 170))
      await frame()
      expect(cropper.api.getCrop()).not.toEqual(before)
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      )
      expect(cropper.api.getCrop()).toEqual(before)
      const [, details] = onCropChange.mock.lastCall!
      expect(details.reason).toBe("drag")
      expect(details.event).toBeInstanceOf(PointerEvent)
      unbind?.()
      cropper.destroy()
    }
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  test("a box shows the whole image, and a frame shows the crop as large as it fits", () => {
    const crop = { x: 100, y: 50, width: 200, height: 200, ...plain }
    const box = { left: 10, top: 10, width: 400, height: 400 }
    const inBox = layoutOf(
      crop,
      { width: 400, height: 200 },
      box,
      "box",
      undefined
    )
    expect(inBox.scale).toBe(1)
    expect(inBox.image).toEqual({ left: 10, top: 110, width: 400, height: 200 })
    expect(inBox.selection).toEqual({
      left: 110,
      top: 160,
      width: 200,
      height: 200,
    })
    const inFrame = layoutOf(crop, { width: 400, height: 200 }, box, "frame", 1)
    expect(inFrame.scale).toBe(2)
    expect(inFrame.selection).toEqual({
      left: 10,
      top: 10,
      width: 400,
      height: 400,
    })
    expect(inFrame.image).toMatchObject({ left: -190, top: -90 })
  })
})
