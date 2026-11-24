import { describe, expect, test } from "vitest"
import {
  colorDistance,
  contrastRatio,
  convertColor,
  formatColor,
  isInGamut,
  mixColor,
  parseColor,
  toGamut,
  type Color,
  type ColorSpace,
} from "../src/foundation/color/color"

const color = (text: string) => {
  const parsed = parseColor(text)
  if (!parsed) {
    throw new Error(`${text} isn't a color`)
  }
  return parsed
}

const coordsOf = (text: string, space: ColorSpace) =>
  convertColor(color(text), space).coords

const expectCoords = (
  coords: Color["coords"],
  expected: (number | null)[],
  digits = 4
) =>
  coords.forEach((value, index) =>
    expected[index] === null
      ? expect(value).toBeNull()
      : expect(value).toBeCloseTo(expected[index]!, digits)
  )

describe("parsing", () => {
  test("reads hex in every length", () => {
    expect(color("#f00")).toEqual({
      space: "srgb",
      coords: [1, 0, 0],
      alpha: 1,
    })
    expect(color("#ff000080").alpha).toBeCloseTo(0.502, 3)
    expect(color("#F0F8").coords).toEqual([1, 0, 1])
    expect(parseColor("#12")).toBeNull()
  })

  test("reads named colors and transparent, in any case", () => {
    expect(color("RebeccaPurple")).toEqual({
      space: "srgb",
      coords: [0.4, 0.2, 0.6],
      alpha: 1,
    })
    expect(color("transparent")).toEqual({
      space: "srgb",
      coords: [0, 0, 0],
      alpha: 0,
    })
    expect(parseColor("currentcolor")).toBeNull()
    expect(parseColor("constructor")).toBeNull()
  })

  test("reads modern and legacy rgb() and hsl()", () => {
    expect(color("rgb(255 0 0 / 50%)")).toEqual({
      space: "srgb",
      coords: [1, 0, 0],
      alpha: 0.5,
    })
    expect(color("rgba(255, 0, 0, 0.5)")).toEqual({
      space: "srgb",
      coords: [1, 0, 0],
      alpha: 0.5,
    })
    expect(color("rgb(100% 50% 0%)").coords).toEqual([1, 0.5, 0])
    expect(color("hsl(120deg 50% 25%)")).toEqual({
      space: "hsl",
      coords: [120, 50, 25],
      alpha: 1,
    })
    expect(color("hsla(0.5turn, 50%, 25%, 1)").coords).toEqual([180, 50, 25])
  })

  test("keeps the space a color is written in", () => {
    expect(color("hwb(200 10% 20%)").space).toBe("hwb")
    expect(color("lab(50% 50% -50%)")).toEqual({
      space: "lab",
      coords: [50, 62.5, -62.5],
      alpha: 1,
    })
    expect(color("oklch(70% 50% 2rad)").coords[0]).toBe(0.7)
    expect(color("oklch(70% 50% 2rad)").coords[1]).toBe(0.2)
    expect(color("color(display-p3 1 0 0)").space).toBe("display-p3")
    expect(color("color(xyz 0.5 0.5 0.5)").space).toBe("xyz-d65")
  })

  test("reads none as a missing channel", () => {
    expect(color("oklch(0.7 0.1 none)").coords).toEqual([0.7, 0.1, null])
    expect(parseColor("rgb(none, 0, 0)")).toBeNull()
  })

  test("clamps where CSS clamps", () => {
    expect(color("rgb(300 -20 0 / 2)")).toEqual({
      space: "srgb",
      coords: [1, 0, 0],
      alpha: 1,
    })
    expect(color("oklch(1.5 -0.1 0)").coords).toEqual([1, 0, 0])
    expect(color("color(display-p3 1.2 0 0)").coords[0]).toBe(1.2)
  })

  test("returns null for text that isn't a color", () => {
    for (const text of [
      "",
      "red blue",
      "rgb(1 2)",
      "hsl(10% 50% 50%)",
      "lab(50 1deg 0)",
      "oklch(0.5 0.1 1 / 1 / 1)",
    ]) {
      expect(parseColor(text)).toBeNull()
    }
  })

  test("rejects a long number with a bad suffix in linear time", () => {
    const start = performance.now()
    expect(parseColor(`rgb(${"1".repeat(50_000)}x 0 0)`)).toBeNull()
    expect(performance.now() - start).toBeLessThan(100)
  })
})

describe("converting", () => {
  // sRGB red in each space, as CSS Color 4 and its sample code convert it.
  test("matches CSS Color 4 for sRGB red", () => {
    expectCoords(coordsOf("red", "oklab"), [0.62796, 0.22486, 0.12585])
    expectCoords(coordsOf("red", "oklch"), [0.62796, 0.25768, 29.2339], 3)
    expectCoords(coordsOf("red", "lab"), [54.2905, 80.8049, 69.891], 3)
    expectCoords(coordsOf("red", "lch"), [54.2905, 106.8372, 40.8577], 3)
    expectCoords(coordsOf("red", "display-p3"), [0.91749, 0.20029, 0.13856])
    expectCoords(coordsOf("red", "xyz-d65"), [0.41239, 0.21264, 0.01933])
  })

  test("goes through HSL, HSV and HWB", () => {
    expectCoords(coordsOf("#7654cd", "hsl"), [256.8595, 54.7511, 56.6667])
    expectCoords(coordsOf("#7654cd", "hsv"), [256.8595, 59.0244, 80.3922])
    expectCoords(coordsOf("#7654cd", "hwb"), [256.8595, 32.9412, 19.6078])
    expect(
      formatColor(
        convertColor(color("hwb(256.8595 32.9412% 19.6078%)"), "srgb"),
        "hex"
      )
    ).toBe("#7654cd")
  })

  test("round-trips through every space", () => {
    const spaces: ColorSpace[] = [
      "srgb-linear",
      "display-p3",
      "hsl",
      "hsv",
      "hwb",
      "lab",
      "lch",
      "oklab",
      "oklch",
      "xyz-d50",
    ]
    const start = color("#7654cd")
    for (const space of spaces) {
      expectCoords(
        convertColor(convertColor(start, space), "srgb").coords,
        start.coords,
        6
      )
    }
  })

  test("keeps an out-of-gamut color through HSL", () => {
    const light = {
      space: "srgb",
      coords: [1.2, 1.1, 1],
      alpha: 1,
    } satisfies Color
    expectCoords(
      convertColor(convertColor(light, "hsl"), "srgb").coords,
      light.coords,
      6
    )
  })

  test("marks the hue of a grey as missing", () => {
    expect(coordsOf("white", "oklch")[2]).toBeNull()
    expect(coordsOf("#808080", "hsl")[0]).toBeNull()
    expect(coordsOf("black", "lch")[2]).toBeNull()
  })

  test("counts a missing channel as 0", () => {
    expectCoords(
      coordsOf("oklch(0.7 none 120)", "srgb"),
      coordsOf("oklch(0.7 0 0)", "srgb")
    )
  })

  test("returns the color itself in its own space, and keeps its alpha", () => {
    const red = color("rgb(255 0 0 / 0.5)")
    expect(convertColor(red, "srgb")).toBe(red)
    expect(convertColor(red, "oklch").alpha).toBe(0.5)
  })
})

describe("formatting", () => {
  test("writes each space in its CSS syntax", () => {
    const red = color("red")
    expect(formatColor(red)).toBe("rgb(255 0 0)")
    expect(formatColor(red, "hex")).toBe("#ff0000")
    expect(formatColor(red, "hsl")).toBe("hsl(0 100% 50%)")
    expect(formatColor(red, "oklch")).toBe("oklch(0.628 0.2577 29.23)")
    expect(formatColor(red, "lab")).toBe("lab(54.29 80.8 69.89)")
    expect(formatColor(red, "display-p3")).toBe(
      "color(display-p3 0.9175 0.2003 0.1386)"
    )
  })

  test("writes alpha after a slash, and in hex as a fourth byte", () => {
    expect(formatColor(color("rgb(255 0 0 / 0.5)"))).toBe("rgb(255 0 0 / 0.5)")
    expect(formatColor(color("rgb(0 0 0 / 0.5)"), "hex")).toBe("#00000080")
  })

  test("rounds to the precision", () => {
    expect(formatColor(color("red"), "oklch", { precision: 3 })).toBe(
      "oklch(0.63 0.26 29)"
    )
    expect(formatColor(color("oklch(0.5 0 none)"))).toBe("oklch(0.5 0 none)")
  })

  test("writes HSV as HSL", () => {
    expect(formatColor(convertColor(color("hsl(120 50% 50%)"), "hsv"))).toBe(
      "hsl(120 50% 50%)"
    )
  })

  test("writes a hue lost in conversion as 0", () => {
    expect(formatColor(color("white"), "oklch")).toBe("oklch(1 0 0)")
  })

  test("clips a wide color to fit an sRGB format", () => {
    expect(formatColor(color("color(display-p3 1 0 0)"), "hex")).toBe("#ff0000")
  })
})

describe("gamut", () => {
  test("says which screens can show a color", () => {
    expect(isInGamut(color("red"))).toBe(true)
    expect(isInGamut(color("color(display-p3 1 0 0)"))).toBe(false)
    expect(isInGamut(color("color(display-p3 1 0 0)"), "p3")).toBe(true)
    expect(isInGamut(color("oklch(0.7 0.4 150)"), "p3")).toBe(false)
  })

  test("maps a color into the gamut, keeping its lightness and hue", () => {
    const wide = color("oklch(0.7 0.4 150)")
    for (const gamut of ["srgb", "p3"] as const) {
      const mapped = toGamut(wide, gamut)
      const [lightness, chroma, hue] = mapped.coords
      expect(mapped.space).toBe("oklch")
      expect(isInGamut(mapped, gamut)).toBe(true)
      expect(lightness).toBeCloseTo(0.7, 1)
      expect(Math.abs(hue! - 150)).toBeLessThan(5)
      expect(chroma).toBeLessThan(0.3)
    }
  })

  test("leaves a color that fits as it is", () => {
    const red = color("red")
    expect(toGamut(red)).toBe(red)
  })

  test("maps colors past white and black to them", () => {
    expect(formatColor(toGamut(color("oklch(1.2 0.2 30)")), "hex")).toBe(
      "#ffffff"
    )
    expect(formatColor(toGamut(color("lab(0 40 40)")), "hex")).toBe("#000000")
  })
})

describe("comparing", () => {
  test("gives the WCAG 2 contrast ratio", () => {
    expect(contrastRatio(color("black"), color("white"))).toBeCloseTo(21, 5)
    expect(contrastRatio(color("white"), color("black"))).toBeCloseTo(21, 5)
    expect(contrastRatio(color("#777"), color("#fff"))).toBeCloseTo(4.48, 2)
    expect(contrastRatio(color("red"), color("red"))).toBe(1)
  })

  test("measures how different two colors look in Oklab", () => {
    expect(colorDistance(color("red"), color("red"))).toBe(0)
    expect(colorDistance(color("red"), color("#fe0000"))).toBeLessThan(0.02)
    expect(colorDistance(color("black"), color("white"))).toBeCloseTo(1, 5)
  })
})

describe("mixing", () => {
  test("mixes halfway in Oklab by default, like color-mix()", () => {
    const mixed = mixColor(color("white"), color("black"))
    expect(mixed.space).toBe("oklab")
    expectCoords(mixed.coords, [0.5, 0, 0])
    expect(
      formatColor(
        mixColor(color("red"), color("blue"), 0.25, { space: "srgb" })
      )
    ).toBe("rgb(191.25 0 63.75)")
  })

  test("takes the shorter way around the hue wheel, or the one asked for", () => {
    const red = color("hsl(350 100% 50%)")
    const orange = color("hsl(30 100% 50%)")
    expect(mixColor(red, orange, 0.5, { space: "hsl" }).coords[0]).toBeCloseTo(
      10
    )
    expect(
      mixColor(red, orange, 0.5, { space: "hsl", hue: "longer" }).coords[0]
    ).toBeCloseTo(190)
    expect(
      mixColor(orange, red, 0.5, { space: "hsl", hue: "increasing" }).coords[0]
    ).toBeCloseTo(190)
    expect(
      mixColor(orange, red, 0.5, { space: "hsl", hue: "decreasing" }).coords[0]
    ).toBeCloseTo(10)
  })

  test("mixes premultiplied by alpha, and a missing channel takes the other's", () => {
    const mixed = mixColor(
      color("rgb(255 0 0 / 0)"),
      color("rgb(0 0 255)"),
      0.5,
      { space: "srgb" }
    )
    expect(mixed.alpha).toBe(0.5)
    expectCoords(mixed.coords, [0, 0, 1])
    expectCoords(
      mixColor(color("oklch(0.6 0 none)"), color("oklch(0.8 0.2 120)"), 0.5, {
        space: "oklch",
      }).coords,
      [0.7, 0.1, 120]
    )
  })
})
