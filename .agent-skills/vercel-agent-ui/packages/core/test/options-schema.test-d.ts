// Compiled by `pnpm typecheck`, never run. Each `@ts-expect-error` fails the
// build if its line stops being an error.
import { definePrimitive } from "../src/foundation/kernel/primitive"

// No options, so no schema.
const counter = definePrimitive({
  name: "counter",
  state: () => ({ count: 0 }),
  api: (context) => ({
    add: () => context.store.set({ count: context.store.get().count + 1 }),
  }),
  slots: (slot) => ({ root: slot({ press: ({ api }) => api.add() }) }),
})
counter({ id: "a" }).api.add()

// Options, so a schema that names each one.
// @ts-expect-error `options` is missing.
definePrimitive({
  name: "toggle",
  state: (options: { defaultPressed?: boolean }) => ({
    pressed: options.defaultPressed ?? false,
  }),
  api: () => ({}),
  slots: (slot) => ({ root: slot({}) }),
})

definePrimitive({
  name: "toggle",
  // @ts-expect-error The schema leaves out `disabled`.
  options: { defaultPressed: "boolean" },
  state: (options: { defaultPressed?: boolean; disabled?: boolean }) => ({
    pressed: options.defaultPressed ?? false,
  }),
  api: () => ({}),
  slots: (slot) => ({ root: slot({}) }),
})
