import { defineComponent, useId } from "vue"
import type { Primitive, SlotName } from "@ui-sdk/core"
import type { Feature } from "@ui-sdk/core/renderer"
import { useConnectedHandle, useConnectedPart } from "./controller-target"
import { withElement } from "./create-parts"
import {
  optionalBoolean,
  useHandle,
  usePart,
  useScope,
  type PartSlots,
} from "./use-primitive"

// The icon parts whose feature must be registered before they read their slot,
// like MenuItemIcon and SelectValueIcon. The core hides them from screen
// readers and typeahead. Icons without a feature, like TabsTabIcon, come from
// `createParts`.

/**
 * An icon part of `primitive`'s `slot`, registering `feature`, which ships the
 * part. Its item is the item part it's inside, for a list whose value shows
 * the selected item's icon.
 */
function defineItemIcon<P extends Primitive, S extends SlotName<P>>(
  name: string,
  primitive: P,
  slot: S,
  feature: Feature
) {
  return withElement(
    "span",
    defineComponent({
      name,
      inheritAttrs: false,
      props: { mirror: optionalBoolean },
      slots: Object as PartSlots<P, S>,
      setup(props) {
        const handle = useHandle(primitive)
        handle.instance.use(feature)
        const item = useScope(primitive)?.around.item
        const id = useId()
        const part = () => ({ id, mirror: props.mirror, item: item?.().value })
        return usePart(handle, slot, part as never, undefined, "span")
      },
    })
  )
}

/**
 * The selected item's icon, copied from its item's icon part. Rendered while
 * one item is selected and it has an icon. Its content is the copy the core
 * writes, so it takes no children.
 */
function defineValueIcon<P extends Primitive>(
  name: string,
  primitive: P,
  feature: Feature
) {
  return withElement(
    "span",
    defineComponent({
      name,
      inheritAttrs: false,
      slots: Object as PartSlots<P, "value-icon" & SlotName<P>>,
      setup() {
        return useConnectedPart(
          useConnectedHandle(primitive),
          (handle) => {
            handle.instance.use(feature)
            return usePart(
              handle,
              "value-icon" as never,
              undefined,
              undefined,
              {
                tag: "span",
                children: () => undefined,
              }
            )
          },
          // Inside a trigger outside its root, nothing until the root mounts.
          () => null
        )
      },
    })
  )
}

export { defineItemIcon, defineValueIcon }
