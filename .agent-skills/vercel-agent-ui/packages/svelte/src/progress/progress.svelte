<!--
@component
The root, which is the progressbar.
@stable
-->
<script lang="ts">
  import {
    progress as progressPrimitive,
    type GaugeLabelDetails,
    type NumberFormat,
    type ProgressState,
  } from "@ui-sdk/core/progress"
  import Part from "../part.svelte"
  import { provideInstance } from "../instance"
  import {
    useHandlePart,
    usePrimitive,
    type PartProps,
  } from "../use-primitive.svelte"

  let {
    value = null,
    min,
    max,
    format,
    locale,
    getValueLabel,
    debug,
    ...rest
  }: PartProps<"div", ProgressState> & {
    /** How far the task has come, between `min` and `max`. Null means it's under way but how far is unknown, and the bar is indeterminate. */
    value?: number | null
    /** The lowest value. */
    min?: number
    /** The highest value. */
    max?: number
    /** How the value reads, for screen readers and the Value part: `Intl.NumberFormat` options, or a function of the value. A percent style shows where the value sits between `min` and `max`; any other style shows the value itself. */
    format?: NumberFormat
    /** The locale the value is formatted in. Defaults to the page's `lang`, or the browser's language without one, once the page is interactive. */
    locale?: string
    /** The text screen readers announce for the value, when the formatted value says too little, like "3 of 12 files". */
    getValueLabel?: (value: number | null, details: GaugeLabelDetails) => string
    /** Logs every state change with its reason. */
    debug?: boolean
  } = $props()

  const id = $props.id()
  const progress = usePrimitive(progressPrimitive, () => ({
    id,
    value,
    min,
    max,
    format,
    locale,
    getValueLabel,
    debug,
  }))
  provideInstance(progressPrimitive, progress)
  const root = useHandlePart(progress, "root")
</script>

<Part tag="div" part={root} props={rest} />
