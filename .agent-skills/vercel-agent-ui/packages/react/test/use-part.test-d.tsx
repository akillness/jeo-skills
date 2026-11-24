// Compiled by `pnpm typecheck`, never run. Each `@ts-expect-error` fails the
// build if its line stops being an error.
import { definePrimitive } from "@ui-sdk/core"
import { usePart, usePrimitive } from "../src/primitive"

const list = definePrimitive({
  name: "list",
  options: { order: "list" },
  state: (options: { order?: string[] }) => ({ order: options.order ?? [] }),
  api: () => ({}),
  slots: (slot) => ({
    root: slot<{}, { order: string[] }>({
      state: (state) => ({ order: state.order }),
    }),
    item: slot<{ value: string }>({ props: { value: "string" } }),
  }),
})

function List() {
  const handle = usePrimitive(list, {})
  // @ts-expect-error A custom part renders through usePart, not a handle's slot.
  handle.slot("root", {})
  // @ts-expect-error Presence belongs to usePart, not the public handle.
  handle.present("root", {})
  // The state follows from the handle, without naming the primitive.
  usePart(handle, "root", {}, { children: (state) => state.order.join(", ") })
  // @ts-expect-error The state is typed, so a wrong type is caught.
  usePart(handle, "root", {}, { children: (state) => state.order.toFixed() })
  // @ts-expect-error The primitive has no such slot.
  usePart(handle, "row", {})
  // @ts-expect-error An item takes a value.
  usePart(list, "item", {})
  // The tag types the element's props.
  usePart(list, "item", { value: "a" }, { href: "#a" }, "a")
  // @ts-expect-error A button has no href.
  return usePart(list, "item", { value: "a" }, { href: "#a" }, "button")
}

export { List }
