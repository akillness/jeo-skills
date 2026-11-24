<script lang="ts">
  import type { MenuTriggerProps, MenuTriggerState } from "@ui-sdk/core/menu"
  import { untrack, type Snippet } from "svelte"
  import Part from "../part.svelte"
  import { useHandlePart, type SlotAttributes } from "../use-primitive.svelte"
  import type { Feature } from "@ui-sdk/core/renderer"
  import type { MenuContext } from "./context"

  // The bound part of a trigger, a button, or a context area, a div, once its
  // menu is known. The public parts type the element's attributes; here they
  // are whatever the user put on it. It follows `owner`, so a trigger given
  // another controller keeps its element and focus. `partName` is read once.
  let {
    owner,
    partName,
    tag,
    disabled,
    focusableWhenDisabled,
    payload,
    shortcut,
    feature,
    ...rest
  }: MenuTriggerProps & {
    owner: MenuContext
    // The feature that ships the part, like the context area's.
    feature?: Feature
    partName: "trigger" | "context-trigger"
    tag: string
    render?: Snippet<
      [
        {
          props: SlotAttributes
          state: MenuTriggerState
          children?: Snippet<[MenuTriggerState]>
        },
      ]
    >
    children?: Snippet<[MenuTriggerState]>
    [attribute: string]: unknown
  } = $props()

  const id = $props.id()
  // Each menu the part binds to gets the feature that ships it, before the part reads its slot.
  const menu = $derived.by(() => {
    if (feature) {
      owner.instance.use(feature)
    }
    return owner
  })
  // Both parts take the trigger's props. The context area ignores `shortcut`.
  const trigger = useHandlePart(
    () => menu,
    untrack(() => partName) as "trigger",
    () => ({ id, disabled, focusableWhenDisabled, payload, shortcut })
  )
</script>

<Part {tag} part={trigger} props={rest} />
