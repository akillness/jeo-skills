// The browser build's `web/core.js`, for a page without a bundler to build
// its own component. Toast, confirm and the controllers stay out: with them
// the file and its chunks were about four times larger.
export * from "@ui-sdk/core"
export { createParts, wrappedButton, wrappedChild } from "./define-element"
