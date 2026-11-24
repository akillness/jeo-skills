// Where a crop sits on the image and the image on screen. Crops count in the
// image's own pixels, from the top left of the image as it shows after it's
// turned and flipped, as `cropImage` reads them.
import {
  resizeBox,
  type ResizeHandle,
} from "../../foundation/direct-manipulation/resize"
import type { ImageCrop, ImageRotation } from "../../foundation/image/crop"
import { clamp } from "../../foundation/number/steps"

type Size = { width: number; height: number }

type Rect = { left: number; top: number; width: number; height: number }

type Crop = Required<ImageCrop>

type Limits = {
  aspect: number | undefined
  minWidth: number
  minHeight: number
  maxZoom: number
}

const turned = (rotation: number) => rotation % 180 !== 0

// The image's size as it shows, which a quarter turn swaps.
const shownSize = (natural: Size, rotation: number) =>
  turned(rotation) ? { width: natural.height, height: natural.width } : natural

const complete = (crop: ImageCrop) => ({
  x: crop.x,
  y: crop.y,
  width: crop.width,
  height: crop.height,
  rotation: crop.rotation ?? 0,
  flipX: !!crop.flipX,
  flipY: !!crop.flipY,
})

const sameCrop = (a: Crop, b: Crop) =>
  a.x === b.x &&
  a.y === b.y &&
  a.width === b.width &&
  a.height === b.height &&
  a.rotation === b.rotation &&
  a.flipX === b.flipX &&
  a.flipY === b.flipY

const round = (crop: Crop) => ({
  ...crop,
  x: Math.round(crop.x),
  y: Math.round(crop.y),
  width: Math.max(1, Math.round(crop.width)),
  height: Math.max(1, Math.round(crop.height)),
})

// How far the crop magnifies: 1 when it's as large as the image allows at its ratio.
const zoomOf = (crop: Crop, natural: Size) => {
  const shown = shownSize(natural, crop.rotation)
  return Math.min(shown.width / crop.width, shown.height / crop.height)
}

// The largest box at `ratio` inside `shown`, which zoom 1 crops.
function largest(shown: Size, ratio: number | undefined) {
  if (!ratio) {
    return { width: shown.width, height: shown.height }
  }
  const width = Math.min(shown.width, shown.height * ratio)
  return { width, height: width / ratio }
}

// The smallest a crop gets, from the minimum size and the zoom limit.
function smallest(shown: Size, limits: Limits) {
  const { aspect, minWidth, minHeight, maxZoom } = limits
  if (!aspect) {
    return {
      width: Math.max(minWidth, shown.width / maxZoom),
      height: Math.max(minHeight, shown.height / maxZoom),
    }
  }
  const width = Math.max(
    minWidth,
    minHeight * aspect,
    largest(shown, aspect).width / maxZoom
  )
  return { width, height: width / aspect }
}

// A box of `size` centered on a point, kept inside the image.
function centered(size: Size, center: { x: number; y: number }, shown: Size) {
  return {
    x: clamp(
      center.x - size.width / 2,
      0,
      Math.max(0, shown.width - size.width)
    ),
    y: clamp(
      center.y - size.height / 2,
      0,
      Math.max(0, shown.height - size.height)
    ),
    width: size.width,
    height: size.height,
  }
}

/**
 * The crop an image starts with, in the middle: in a box, most of the image
 * at the ratio, so its edges show; in a frame, the largest.
 */
function initialCrop(natural: Size, limits: Limits, mode: "box" | "frame") {
  const full = largest(natural, limits.aspect)
  const min = smallest(natural, limits)
  const inset =
    mode === "frame"
      ? 1
      : Math.min(
          1,
          Math.max(0.8, min.width / full.width, min.height / full.height)
        )
  const size = { width: full.width * inset, height: full.height * inset }
  const box = centered(
    size,
    { x: natural.width / 2, y: natural.height / 2 },
    natural
  )
  return round({ ...box, rotation: 0, flipX: false, flipY: false })
}

/** The crop after a handle moves by `dx` and `dy` image pixels, or the whole crop with `"move"`. */
function resizeCrop(
  crop: Crop,
  natural: Size,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  limits: Limits,
  keepRatio = false
) {
  const shown = shownSize(natural, crop.rotation)
  const aspect =
    limits.aspect ?? (keepRatio ? crop.width / crop.height : undefined)
  const box = resizeBox(crop, handle, dx, dy, {
    bounds: { left: 0, top: 0, right: shown.width, bottom: shown.height },
    min: smallest(shown, { ...limits, aspect }),
    aspect,
  })
  return round({ ...crop, ...box })
}

/**
 * The crop at a zoom, keeping the image point `at` where it is, or the
 * crop's middle. Its ratio stays.
 */
function zoomCrop(
  crop: Crop,
  natural: Size,
  zoom: number,
  limits: Limits,
  at?: { x: number; y: number }
) {
  const shown = shownSize(natural, crop.rotation)
  const ratio = limits.aspect ?? crop.width / crop.height
  const full = largest(shown, ratio)
  const least = smallest(shown, { ...limits, aspect: ratio })
  const most = Math.max(
    1,
    Math.min(full.width / least.width, full.height / least.height)
  )
  const next = clamp(zoom, 1, most)
  const width = full.width / next
  const height = full.height / next
  const point = at ?? {
    x: crop.x + crop.width / 2,
    y: crop.y + crop.height / 2,
  }
  const k = width / crop.width
  const box = {
    x: clamp(point.x - (point.x - crop.x) * k, 0, shown.width - width),
    y: clamp(
      point.y - (point.y - crop.y) * (height / crop.height),
      0,
      shown.height - height
    ),
    width,
    height,
  }
  return round({ ...crop, ...box })
}

/**
 * The crop after the image turns a quarter clockwise, or counterclockwise for
 * `-1`. The crop turns with it; at a fixed ratio it keeps its zoom instead.
 * A flip on one axis is on the other once turned.
 */
function rotateCrop(
  crop: Crop,
  natural: Size,
  direction: 1 | -1,
  limits: Limits
) {
  const shown = shownSize(natural, crop.rotation)
  const box =
    direction === 1
      ? {
          x: shown.height - crop.y - crop.height,
          y: crop.x,
          width: crop.height,
          height: crop.width,
        }
      : {
          x: crop.y,
          y: shown.width - crop.x - crop.width,
          width: crop.height,
          height: crop.width,
        }
  const rotation = ((crop.rotation + (direction === 1 ? 90 : 270)) %
    360) as ImageRotation
  const next = { ...box, rotation, flipX: crop.flipY, flipY: crop.flipX }
  if (!limits.aspect) {
    return round(next)
  }
  const turnedShown = shownSize(natural, rotation)
  const full = largest(turnedShown, limits.aspect)
  const zoom = Math.min(
    zoomOf(crop, natural),
    full.width / smallest(turnedShown, limits).width
  )
  const size = { width: full.width / zoom, height: full.height / zoom }
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  return round({ ...next, ...centered(size, center, turnedShown) })
}

/** The crop after the image mirrors left to right, or top to bottom. */
function flipCrop(
  crop: Crop,
  natural: Size,
  direction: "horizontal" | "vertical"
) {
  const shown = shownSize(natural, crop.rotation)
  return direction === "horizontal"
    ? { ...crop, x: shown.width - crop.x - crop.width, flipX: !crop.flipX }
    : { ...crop, y: shown.height - crop.y - crop.height, flipY: !crop.flipY }
}

/** The crop at a new ratio, as large as it was, about its middle. */
function fitCrop(crop: Crop, natural: Size, limits: Limits) {
  const { aspect } = limits
  if (!aspect || Math.abs(crop.width / aspect - crop.height) <= 1) {
    return crop
  }
  const shown = shownSize(natural, crop.rotation)
  const full = largest(shown, aspect)
  const zoom = Math.min(
    zoomOf(crop, natural),
    full.width / smallest(shown, limits).width
  )
  const size = { width: full.width / zoom, height: full.height / zoom }
  return round({
    ...crop,
    ...centered(
      size,
      { x: crop.x + crop.width / 2, y: crop.y + crop.height / 2 },
      shown
    ),
  })
}

/**
 * Where the image and the selection sit in the viewport's content box, in CSS
 * pixels, and how many of them one image pixel takes. A box shows the whole
 * image and the crop on it; a frame shows the crop as large as it fits, with
 * the image around it.
 */
function layoutOf(
  crop: Crop,
  natural: Size,
  box: Rect,
  mode: "box" | "frame",
  aspect: number | undefined
) {
  const shown = shownSize(natural, crop.rotation)
  if (mode === "frame") {
    const ratio = aspect ?? crop.width / crop.height
    const width = Math.min(box.width, box.height * ratio)
    const height = width / ratio
    const selection = {
      left: box.left + (box.width - width) / 2,
      top: box.top + (box.height - height) / 2,
      width,
      height,
    }
    const scale = width / crop.width
    const image = {
      left: selection.left - crop.x * scale,
      top: selection.top - crop.y * scale,
      width: shown.width * scale,
      height: shown.height * scale,
    }
    return { scale, image, selection }
  }
  const scale = Math.min(box.width / shown.width, box.height / shown.height)
  const image = {
    left: box.left + (box.width - shown.width * scale) / 2,
    top: box.top + (box.height - shown.height * scale) / 2,
    width: shown.width * scale,
    height: shown.height * scale,
  }
  const selection = {
    left: image.left + crop.x * scale,
    top: image.top + crop.y * scale,
    width: crop.width * scale,
    height: crop.height * scale,
  }
  return { scale, image, selection }
}

type Layout = ReturnType<typeof layoutOf>

export {
  complete,
  type Crop,
  fitCrop,
  flipCrop,
  initialCrop,
  type Layout,
  layoutOf,
  type Limits,
  type Rect,
  resizeCrop,
  rotateCrop,
  round,
  sameCrop,
  shownSize,
  type Size,
  smallest,
  zoomCrop,
  zoomOf,
}
