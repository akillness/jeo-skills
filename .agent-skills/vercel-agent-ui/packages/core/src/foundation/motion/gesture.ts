// The gesture layer's public entry: the physics under Drawer and Carousel,
// and which way a stroke points. Its own entry, so a page that never imports
// it doesn't load what a lazy sheet shares with it up front.
export { createVelocityTracker } from "./velocity"
export { projectDistance } from "./projection"
export { solveSpring } from "./spring"
export { rubberBand } from "./rubber-band"
export { sectorOf } from "./sector"
