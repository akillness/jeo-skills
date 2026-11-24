/**
 * A quarter turn clockwise, in degrees.
 * @experimental
 */
type ImageRotation = 0 | 90 | 180 | 270

/**
 * A region of an image, in the image's own pixels, as it shows after its
 * rotation and flips.
 * @experimental
 */
type ImageCrop = {
  /** Pixels from the left edge of the turned image. */
  x: number
  /** Pixels from the top edge of the turned image. */
  y: number
  /** The region's width, in the image's own pixels. */
  width: number
  /** The region's height, in the image's own pixels. */
  height: number
  /**
   * Turns the image clockwise before the region is taken.
   * @defaultValue 0
   */
  rotation?: ImageRotation
  /**
   * Mirrors the turned image left to right.
   * @defaultValue false
   */
  flipX?: boolean
  /**
   * Mirrors the turned image top to bottom.
   * @defaultValue false
   */
  flipY?: boolean
}

/**
 * Options for `cropImage`.
 * @experimental
 */
type CropImageOptions = {
  /**
   * The file's type. A browser that can't write it writes PNG, which the returned file's `type` says.
   * @defaultValue "image/png"
   */
  type?: string
  /** From 0 to 1, for JPEG and WebP. The browser picks when it's left out. */
  quality?: number
  /** The output's width in pixels. Left out, it follows `height` at the crop's ratio, or the crop's own width. */
  width?: number
  /** The output's height in pixels. Left out, it follows `width` at the crop's ratio, or the crop's own height. */
  height?: number
  /**
   * `"circle"` keeps the ellipse inside the crop and leaves the corners
   * transparent, which PNG and WebP keep and JPEG fills with black.
   * @defaultValue "rectangle"
   */
  shape?: "rectangle" | "circle"
  /** The file's name. Left out, it's the source file's name with the new extension, or `"image"` and the extension. */
  name?: string
}

/**
 * What `cropImage` reads: an image file, a URL, or anything a canvas draws.
 * @experimental
 */
type ImageSource =
  | Blob
  | string
  | HTMLImageElement
  | HTMLCanvasElement
  | ImageBitmap
  | OffscreenCanvas

type Drawable = Exclude<ImageSource, Blob | string>
type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

const extensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}

const isImage = (source: Drawable): source is HTMLImageElement =>
  "naturalWidth" in source

const sizeOf = (source: Drawable) =>
  isImage(source)
    ? { width: source.naturalWidth, height: source.naturalHeight }
    : { width: source.width, height: source.height }

async function load(source: ImageSource) {
  if (typeof source === "string") {
    const image = new Image()
    // A URL from another origin would taint the canvas without CORS.
    image.crossOrigin = "anonymous"
    image.src = source
    await image.decode()
    return image
  }
  if (source instanceof Blob) {
    return createImageBitmap(source)
  }
  if (isImage(source) && !(source.complete && source.naturalWidth)) {
    await source.decode()
  }
  return source
}

function outputSize(crop: ImageCrop, options: CropImageOptions) {
  const ratio = crop.width / crop.height
  const width =
    options.width ??
    (options.height === undefined ? crop.width : options.height * ratio)
  const height = options.height ?? width / ratio
  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  }
}

function drawCrop(
  context: Context,
  image: Drawable,
  crop: ImageCrop,
  size: { width: number; height: number },
  circle: boolean
) {
  const natural = sizeOf(image)
  const rotation = crop.rotation ?? 0
  const turned = rotation % 180 !== 0
  const shown = turned
    ? { width: natural.height, height: natural.width }
    : natural
  context.imageSmoothingQuality = "high"
  if (circle) {
    context.beginPath()
    context.ellipse(
      size.width / 2,
      size.height / 2,
      size.width / 2,
      size.height / 2,
      0,
      0,
      Math.PI * 2
    )
    context.clip()
  }
  context.scale(size.width / crop.width, size.height / crop.height)
  context.translate(shown.width / 2 - crop.x, shown.height / 2 - crop.y)
  context.scale(crop.flipX ? -1 : 1, crop.flipY ? -1 : 1)
  context.rotate((rotation * Math.PI) / 180)
  context.drawImage(image, -natural.width / 2, -natural.height / 2)
}

async function encode(
  width: number,
  height: number,
  draw: (context: Context) => void,
  type: string,
  quality?: number
) {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height)
    draw(canvas.getContext("2d")!)
    return canvas.convertToBlob({ type, quality })
  }
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  draw(canvas.getContext("2d")!)
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("The image couldn't be encoded.")),
      type,
      quality
    )
  )
}

function nameOf(source: ImageSource, type: string, name?: string) {
  if (name) {
    return name
  }
  const extension = extensions[type] ?? type.split("/")[1] ?? "png"
  const base =
    source instanceof File && source.name
      ? source.name.replace(/\.[^.]*$/, "")
      : "image"
  return `${base}.${extension}`
}

/**
 * Cuts a region out of an image and returns it as a new image file. The
 * region is in the image's own pixels, after `rotation` and the flips, as
 * an Image Cropper hands it back.
 *
 * @example
 * const avatar = await cropImage(photo, { x: 120, y: 40, width: 600, height: 600 }, {
 *   type: "image/webp",
 *   width: 256,
 *   shape: "circle",
 * })
 * @experimental
 */
async function cropImage(
  source: ImageSource,
  crop: ImageCrop,
  options: CropImageOptions = {}
) {
  if (!(crop.width > 0 && crop.height > 0)) {
    throw new RangeError("A crop needs a width and a height above 0.")
  }
  const image = await load(source)
  try {
    const size = outputSize(crop, options)
    const blob = await encode(
      size.width,
      size.height,
      (context) =>
        drawCrop(context, image, crop, size, options.shape === "circle"),
      options.type ?? "image/png",
      options.quality
    )
    return new File([blob], nameOf(source, blob.type, options.name), {
      type: blob.type,
    })
  } finally {
    if (source instanceof Blob) {
      ;(image as ImageBitmap).close()
    }
  }
}

export {
  cropImage,
  type CropImageOptions,
  type ImageCrop,
  type ImageRotation,
  type ImageSource,
}
