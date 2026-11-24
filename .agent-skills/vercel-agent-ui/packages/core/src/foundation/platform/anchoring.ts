import { opposite, type PhysicalSide } from "./sides"

let supported: boolean | undefined

function supportsAnchoring() {
  supported ??=
    typeof CSS !== "undefined" &&
    typeof CSS.supports === "function" &&
    [
      "position-anchor: --a",
      "position-try-fallbacks: flip-y",
      "position-visibility: always",
    ].every((declaration) => CSS.supports(declaration))
  return supported
}

const fillsLayoutViewport = (viewport: {
  x: number
  y: number
  width: number
  height: number
}) => {
  const root = document.documentElement
  return (
    !viewport.x &&
    !viewport.y &&
    Math.abs(viewport.width - root.clientWidth) < 1 &&
    Math.abs(viewport.height - root.clientHeight) < 1
  )
}

// The browser places against the layout viewport, not the part a pinch zoom
// or a keyboard leaves, finds anchors only in the popup's own tree, and
// doesn't animate a popup moving between anchors.
function anchorable(
  anchor: HTMLElement,
  shown: { width: number; height: number },
  el: HTMLElement,
  style: CSSStyleDeclaration,
  viewport: Parameters<typeof fillsLayoutViewport>[0]
) {
  if (
    !supportsAnchoring() ||
    anchor.getRootNode() !== el.getRootNode() ||
    !(shown.width || shown.height) ||
    !fillsLayoutViewport(viewport)
  ) {
    return false
  }
  // Safari runs a popup's enter transition again each time it ends while the
  // browser places it, so a popup that animates is placed by script.
  const moves = (durations: string) =>
    durations.split(",").some((duration) => parseFloat(duration) > 0)
  return (
    !moves(style.transitionDuration) &&
    (style.animationName === "none" || !moves(style.animationDuration))
  )
}

// Places a popup of `size`, in CSS pixels, as `computePlacement` would:
// flipped when there isn't room, shifted to stay `collisionPadding` inside
// the viewport, but never past the anchor's far edge.
function anchorStyles(
  name: string,
  side: PhysicalSide,
  align: "start" | "center" | "end",
  options: {
    sideOffset: number
    alignOffset: number
    collisionPadding: number
  },
  size: { width: number; height: number }
) {
  const { sideOffset, alignOffset, collisionPadding: padding } = options
  const vertical = side === "top" || side === "bottom"
  const [start, end] = vertical ? ["left", "right"] : ["top", "bottom"]
  const length = vertical ? size.width : size.height
  const ideal =
    align === "start"
      ? `anchor(${start}) + ${alignOffset}px`
      : align === "end"
        ? `anchor(${end}) - ${length + alignOffset}px`
        : `anchor(center) - ${length / 2 - alignOffset}px`
  const facing = opposite[side]
  return {
    // Whole pixels, so text inside renders the same each time.
    [facing]: `round(anchor(${side}), 1px)`,
    [side]: "auto",
    [`margin-${facing}`]: `${sideOffset}px`,
    [`margin-${side}`]: `${padding}px`,
    [start]: `round(min(max(${ideal}, min(${padding}px, anchor(${end}))), max(100% - ${length + padding}px, anchor(${start}) - ${length}px)), 1px)`,
    "position-anchor": name,
    "position-try-fallbacks": vertical ? "flip-y" : "flip-x",
    // Its initial value hides a popup whose anchor is scrolled out of view.
    "position-visibility": "always",
  }
}

const names = new WeakMap<HTMLElement, string>()
// Shared on `globalThis`, since anchor names are global to the page and a second copy of
// core counting from 1 would hand an open popup's name to its own anchor.
const named = ((globalThis as Record<symbol, unknown>)[
  Symbol.for("ui-sdk.anchor-names@1")
] ??= { count: 0 }) as { count: number }

// Adds a name to the anchor's own, kept for its later popups, and adds it
// back when something rewrites the anchor's styles.
function nameAnchor(anchor: HTMLElement) {
  let name = names.get(anchor)
  if (!name) {
    name = `--ui-anchor-${++named.count}`
    names.set(anchor, name)
  }
  const own = anchor.style.getPropertyValue("anchor-name")
  if (!own.split(",").some((part) => part.trim() === name)) {
    const current = getComputedStyle(anchor).getPropertyValue("anchor-name")
    anchor.style.setProperty(
      "anchor-name",
      current && current !== "none" ? `${current}, ${name}` : name
    )
  }
  return name
}

function unnameAnchor(anchor: HTMLElement) {
  const name = names.get(anchor)
  const rest = anchor.style
    .getPropertyValue("anchor-name")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part && part !== name)
  if (rest.length) {
    anchor.style.setProperty("anchor-name", rest.join(", "))
  } else {
    anchor.style.removeProperty("anchor-name")
  }
  if (!anchor.getAttribute("style")) {
    anchor.removeAttribute("style")
  }
}

export {
  anchorable,
  anchorStyles,
  fillsLayoutViewport,
  nameAnchor,
  unnameAnchor,
}
