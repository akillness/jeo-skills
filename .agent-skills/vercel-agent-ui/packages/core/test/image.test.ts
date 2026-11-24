// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { cropImage } from "../src/foundation/image/crop"

type Matrix = [number, number, number, number, number, number]

// A 2D context that keeps its transform, and where each drawn image's corners
// and the clip land, so a test reads what a real canvas would paint.
function fakeContext() {
  let m: Matrix = [1, 0, 0, 1, 0, 0]
  const apply = ([a, b, c, d, e, f]: Matrix) => {
    const [A, B, C, D, E, F] = m
    m = [
      A * a + C * b,
      B * a + D * b,
      A * c + C * d,
      B * c + D * d,
      A * e + C * f + E,
      B * e + D * f + F,
    ]
  }
  const point = (x: number, y: number) =>
    [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]].map(
      (n) => Math.round(n * 1e6) / 1e6 + 0
    )
  const drawn: { topLeft: number[]; bottomRight: number[] }[] = []
  const clips: number[][] = []
  return {
    drawn,
    clips,
    context: {
      imageSmoothingQuality: "low",
      scale: (x: number, y: number) => apply([x, 0, 0, y, 0, 0]),
      translate: (x: number, y: number) => apply([1, 0, 0, 1, x, y]),
      rotate: (angle: number) =>
        apply([
          Math.cos(angle),
          Math.sin(angle),
          -Math.sin(angle),
          Math.cos(angle),
          0,
          0,
        ]),
      beginPath: () => {},
      ellipse: (...args: number[]) => clips.push(args.slice(0, 4)),
      clip: () => {},
      drawImage: (
        image: { width: number; height: number },
        x: number,
        y: number
      ) =>
        drawn.push({
          topLeft: point(x, y),
          bottomRight: point(x + image.width, y + image.height),
        }),
    },
  }
}

let canvas: ReturnType<typeof fakeContext>
let made: { width: number; height: number; type?: string }[]

beforeEach(() => {
  made = []
  canvas = fakeContext()
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      constructor(
        public width: number,
        public height: number
      ) {
        made.push(this)
      }
      getContext() {
        return canvas.context
      }
      async convertToBlob({ type }: { type: string }) {
        made.at(-1)!.type = type
        // Like a browser that can't write AVIF.
        return new Blob(["x"], {
          type: type === "image/avif" ? "image/png" : type,
        })
      }
    }
  )
  vi.stubGlobal("createImageBitmap", async () => ({
    width: 100,
    height: 50,
    close: vi.fn(),
  }))
})

afterEach(() => vi.unstubAllGlobals())

const photo = new File(["photo"], "beach.jpeg", { type: "image/jpeg" })

describe("cropImage", () => {
  test("cuts the region at its own size, as PNG named after the source", async () => {
    const file = await cropImage(photo, { x: 10, y: 20, width: 50, height: 25 })
    expect(made[0]).toMatchObject({ width: 50, height: 25, type: "image/png" })
    expect(canvas.drawn[0]).toEqual({
      topLeft: [-10, -20],
      bottomRight: [90, 30],
    })
    expect(file).toBeInstanceOf(File)
    expect(file.name).toBe("beach.png")
    expect(file.type).toBe("image/png")
  })

  test("scales to an output width, keeping the crop's ratio", async () => {
    await cropImage(
      photo,
      { x: 0, y: 0, width: 40, height: 20 },
      { width: 400, type: "image/webp" }
    )
    expect(made[0]).toMatchObject({
      width: 400,
      height: 200,
      type: "image/webp",
    })
    expect(canvas.drawn[0]).toEqual({
      topLeft: [0, 0],
      bottomRight: [1000, 500],
    })
  })

  test("turns the image before taking the region, with x and y in the turned image", async () => {
    await cropImage(photo, { x: 0, y: 0, width: 50, height: 100, rotation: 90 })
    // The image's top-left corner lands at the top right, as a quarter turn clockwise puts it.
    expect(canvas.drawn[0]).toEqual({ topLeft: [50, 0], bottomRight: [0, 100] })
  })

  test("mirrors the turned image", async () => {
    await cropImage(photo, { x: 0, y: 0, width: 100, height: 50, flipX: true })
    expect(canvas.drawn[0]).toEqual({ topLeft: [100, 0], bottomRight: [0, 50] })
  })

  test("a circle clips to the ellipse inside the output", async () => {
    await cropImage(
      photo,
      { x: 0, y: 0, width: 50, height: 50 },
      { shape: "circle", width: 200 }
    )
    expect(canvas.clips).toEqual([[100, 100, 100, 100]])
  })

  test("names the file by the type the browser wrote", async () => {
    const file = await cropImage(
      new Blob(["x"]),
      { x: 0, y: 0, width: 10, height: 10 },
      { type: "image/avif" }
    )
    expect(file.name).toBe("image.png")
    expect(file.type).toBe("image/png")
  })

  test("a crop with no area throws", async () => {
    await expect(
      cropImage(photo, { x: 0, y: 0, width: 0, height: 10 })
    ).rejects.toThrow(RangeError)
  })
})
