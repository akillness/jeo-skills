/**
 * For tests: prove a primitive works the way a person would check it. Mount
 * it from markup without a framework, press keys, type, click and drag, and
 * read what changed and what was announced. Also read what a part renders
 * without a DOM, and pick the platform a test runs as.
 *
 * @module
 */
export {
  attrs as partAttrs,
  partState,
  present as partPresent,
} from "./foundation/kernel/part"
export { setPlatform } from "./foundation/platform/platform"
export { checkDirection } from "./testing/check-direction"
export { checkPattern, type Pattern } from "./testing/check-pattern"
export { checkServer } from "./testing/check-server"
export { settle } from "./testing/input"
export { mount } from "./testing/mount"
