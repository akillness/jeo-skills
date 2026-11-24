import type { AgentStep, createAgent } from "./agent"

// Keying the original act method preserves the guard through object spreads and reactive proxies.
const guardedActions = new WeakMap<
  object,
  (
    steps: AgentStep[],
    guard: () => boolean
  ) => ReturnType<ReturnType<typeof createAgent>["act"]>
>()

export { guardedActions }
