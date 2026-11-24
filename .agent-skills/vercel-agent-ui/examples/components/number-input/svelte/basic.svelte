<script lang="ts">
  import { MinusIcon, MoveHorizontalIcon, PlusIcon } from "@lucide/svelte"
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    NumberInput,
    NumberInputControl,
    NumberInputDecrement,
    NumberInputGroup,
    NumberInputIncrement,
    NumberInputScrubArea,
    NumberInputScrubAreaCursor,
  } from "@ui-sdk/svelte/number-input"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()
</script>

<Field>
  <NumberInput
    defaultValue={1}
    min={1}
    onValueCommit={(value) => log(`Quantity ${value ?? "empty"}`)}
  >
    <NumberInputScrubArea pixelsPerStep={4}>
      <FieldLabel>Quantity</FieldLabel>
      <NumberInputScrubAreaCursor>
        <MoveHorizontalIcon aria-hidden="true" />
      </NumberInputScrubAreaCursor>
    </NumberInputScrubArea>
    <NumberInputGroup>
      <NumberInputDecrement aria-label="Decrease">
        <MinusIcon aria-hidden="true" />
      </NumberInputDecrement>
      <NumberInputControl />
      <NumberInputIncrement aria-label="Increase">
        <PlusIcon aria-hidden="true" />
      </NumberInputIncrement>
    </NumberInputGroup>
  </NumberInput>
</Field>
