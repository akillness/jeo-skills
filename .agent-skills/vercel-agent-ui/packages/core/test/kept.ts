// An instance kept as a framework keeps it in the browser. Without a DOM, as
// on a server, an instance starts nothing outside itself, like its
// controller, so tests that drive that work without one keep it first.
import { keep } from "../src/foundation/kernel/keep"

function kept<T extends object>(instance: T) {
  keep(instance)
  return instance
}

export { kept }
