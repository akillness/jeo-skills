// Helpers for building custom parts on the same primitives the components use.
// It only re-exports, so the build ships it without "use client": the hooks
// stay client references through their own module, and `renderElement` stays
// a function a Server Component can call.
export { mergeProps, renderElement, type RenderProp } from "./render-element"
export {
  createParts,
  type GenericPartComponent,
  type PartComponent,
  usePart,
  usePrimitive,
  type PartProps,
  type Parts,
  type PrimitiveHandle,
} from "./use-primitive"
