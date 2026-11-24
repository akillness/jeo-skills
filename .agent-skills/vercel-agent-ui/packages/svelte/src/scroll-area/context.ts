type ScrollAreaOrientation = "vertical" | "horizontal"

// The scrollbar a thumb sits in.
const OrientationKey = Symbol("scroll-area-orientation")

type OrientationContext = () => ScrollAreaOrientation

export { type OrientationContext, OrientationKey, type ScrollAreaOrientation }
