<!--
@component
Layered sections of content, one shown at a time.
@stable
-->
<script lang="ts">
  import type { ChangeDetails } from "@ui-sdk/core"
  import {
    tabs as tabsPrimitive,
    type TabsController,
    type TabsState,
    type TabsValueChangeReason,
  } from "@ui-sdk/core/tabs"
  import Part from "../part.svelte"
  import { provideInstance } from "../instance"
  import {
    useHandlePart,
    usePrimitive,
    type PartProps,
  } from "../use-primitive.svelte"

  type Details = ChangeDetails<TabsValueChangeReason>

  let {
    value = $bindable(),
    defaultValue,
    orientation,
    activation,
    loop,
    hiddenUntilFound,
    controller,
    debug,
    onValueChange,
    ...rest
  }: PartProps<"div", TabsState> & {
    /** The selected tab's value. Bind it with `bind:value` to control the tabs. `null` selects nothing. */
    value?: string | null
    /** The tab selected at first, when uncontrolled. Defaults to the first enabled tab. */
    defaultValue?: string | null
    /** Which arrow keys move between tabs: left and right, or up and down. */
    orientation?: "horizontal" | "vertical"
    /** `"automatic"` selects a tab as soon as arrow keys focus it. `"manual"` waits for Enter or Space. */
    activation?: "automatic" | "manual"
    /** Whether arrow keys wrap from the last tab to the first. */
    loop?: boolean
    /** Keeps hidden panels in the page as `hidden="until-found"`, so find in page can select their tab. */
    hiddenUntilFound?: boolean
    /** Selects tabs from anywhere. Create one with `createTabsController()`. */
    controller?: TabsController
    /** Logs every state change with its reason. */
    debug?: boolean
    /** Runs when the selection wants to change. `details.reason` says why, and `details.cancel()` stops it. */
    onValueChange?: (value: string | null, details: Details) => void
  } = $props()

  const id = $props.id()
  const tabs = usePrimitive(tabsPrimitive, () => ({
    id,
    get value() {
      return value
    },
    defaultValue,
    orientation,
    activation,
    loop,
    hiddenUntilFound,
    controller,
    debug,
    onValueChange: (next: string | null, details: Details) => {
      // The callback runs first, so canceling there also keeps a bound `value` as it was.
      onValueChange?.(next, details)
      if (!details.canceled) {
        value = next
      }
    },
  }))
  provideInstance(tabsPrimitive, tabs)
  const root = useHandlePart(tabs, "root")
</script>

<Part tag="div" part={root} props={rest} />
