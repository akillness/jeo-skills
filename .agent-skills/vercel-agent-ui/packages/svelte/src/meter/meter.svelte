<!--
@component
The root, which is the meter.
@stable
-->
<script lang="ts">
  import {
    meter as meterPrimitive,
    type MeterLabelDetails,
    type MeterState,
    type NumberFormat,
  } from "@ui-sdk/core/meter"
  import Part from "../part.svelte"
  import { provideInstance } from "../instance"
  import {
    useHandlePart,
    usePrimitive,
    type PartProps,
  } from "../use-primitive.svelte"

  let {
    value,
    min,
    max,
    format,
    locale,
    getValueLabel,
    debug,
    ...rest
  }: PartProps<"div", MeterState> & {
    /** The reading, between `min` and `max`. Values outside them are clamped. A meter always has a value, since there's no busy state. */
    value: number
    /** The lowest value. */
    min?: number
    /** The highest value. */
    max?: number
    /** How the value reads, for screen readers and the Value part: `Intl.NumberFormat` options, or a function of the value. A percent style shows where the value sits between `min` and `max`; any other style shows the value itself. */
    format?: NumberFormat
    /** The locale the value is formatted in. Defaults to the page's `lang`, or the browser's language without one, once the page is interactive. */
    locale?: string
    /** The text screen readers announce for the value, when the formatted value says too little, like "750 of 1,000 requests". */
    getValueLabel?: (value: number, details: MeterLabelDetails) => string
    /** Logs every state change with its reason. */
    debug?: boolean
  } = $props()

  const id = $props.id()
  const meter = usePrimitive(meterPrimitive, () => ({
    id,
    value,
    min,
    max,
    format,
    locale,
    getValueLabel,
    debug,
  }))
  provideInstance(meterPrimitive, meter)
  const root = useHandlePart(meter, "root")
</script>

<Part tag="div" part={root} props={rest} />
