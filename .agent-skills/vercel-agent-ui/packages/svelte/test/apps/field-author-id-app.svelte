<script lang="ts">
  import { Checkbox, CheckboxGroup } from "../../src/checkbox"
  import { ColorPicker } from "../../src/color-picker"
  import { Field, FieldLabel } from "../../src/field"
  import { FileInput, FileInputTrigger } from "../../src/file-input"
  import {
    NumberInput,
    NumberInputControl,
    NumberInputDecrement,
    NumberInputIncrement,
  } from "../../src/number-input"
  import { Radio, RadioGroup } from "../../src/radio"
  import { Rating, RatingItem } from "../../src/rating"
  import {
    SegmentedControl,
    SegmentedControlItem,
  } from "../../src/segmented-control"
  import { Slider, SliderControl, SliderThumb } from "../../src/slider"
  import { Switch } from "../../src/switch"

  let {
    kind,
  }: {
    kind:
      | "number-input"
      | "file-input"
      | "checkbox"
      | "switch"
      | "radio-group"
      | "checkbox-group"
      | "rating"
      | "segmented-control"
      | "color-picker"
      | "range-slider"
  } = $props()
</script>

<Field>
  <FieldLabel>Label</FieldLabel>
  {#if kind === "number-input"}
    <NumberInput>
      <NumberInputDecrement />
      <NumberInputControl id="mine" />
      <NumberInputIncrement />
    </NumberInput>
  {:else if kind === "file-input"}
    <FileInput><FileInputTrigger id="mine">Browse</FileInputTrigger></FileInput>
  {:else if kind === "checkbox"}
    <Checkbox id="mine" />
  {:else if kind === "switch"}
    <Switch id="mine" />
  {:else if kind === "radio-group"}
    <RadioGroup id="mine"><Radio value="a" /></RadioGroup>
  {:else if kind === "checkbox-group"}
    <CheckboxGroup id="mine"><Checkbox value="a" /></CheckboxGroup>
  {:else if kind === "rating"}
    <Rating id="mine"><RatingItem value={1} /></Rating>
  {:else if kind === "segmented-control"}
    <SegmentedControl id="mine"
      ><SegmentedControlItem value="a">A</SegmentedControlItem
      ></SegmentedControl
    >
  {:else if kind === "color-picker"}
    <ColorPicker id="mine" />
  {:else}
    <Slider defaultValue={[1, 5]} id="mine">
      <SliderControl
        ><SliderThumb index={0} /><SliderThumb index={1} /></SliderControl
      >
    </Slider>
  {/if}
</Field>
