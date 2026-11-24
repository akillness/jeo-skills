import { describe, expect, test } from "vitest"
import { anchorStyles } from "../src/foundation/platform/anchoring"

const options = { sideOffset: 4, alignOffset: 0, collisionPadding: 8 }
const size = { width: 200, height: 120 }

describe("anchor styles", () => {
  test("open below the anchor's start, flipping above, kept on screen", () => {
    expect(anchorStyles("--a", "bottom", "start", options, size)).toMatchObject(
      {
        "position-anchor": "--a",
        top: "round(anchor(bottom), 1px)",
        bottom: "auto",
        "margin-top": "4px",
        "margin-bottom": "8px",
        left: "round(min(max(anchor(left) + 0px, min(8px, anchor(right))), max(100% - 208px, anchor(left) - 200px)), 1px)",
        "position-try-fallbacks": "flip-y",
      }
    )
  })

  test("line up with the anchor's end or center along the side", () => {
    expect(
      anchorStyles("--a", "top", "end", { ...options, alignOffset: 2 }, size)
        .left
    ).toMatch(/^round\(min\(max\(anchor\(right\) - 202px,/)
    expect(anchorStyles("--a", "top", "center", options, size).left).toMatch(
      /^round\(min\(max\(anchor\(center\) - 100px,/
    )
  })

  test("open beside the anchor, flipping to the other side", () => {
    expect(anchorStyles("--a", "left", "start", options, size)).toMatchObject({
      right: "round(anchor(left), 1px)",
      left: "auto",
      "margin-right": "4px",
      "margin-left": "8px",
      top: "round(min(max(anchor(top) + 0px, min(8px, anchor(bottom))), max(100% - 128px, anchor(top) - 120px)), 1px)",
      "position-try-fallbacks": "flip-x",
    })
  })
})
