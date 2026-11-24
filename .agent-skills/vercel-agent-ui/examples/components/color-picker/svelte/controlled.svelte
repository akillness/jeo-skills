<script lang="ts">
  import {
    ColorPicker,
    ColorPickerArea,
    ColorPickerAreaThumb,
    ColorPickerInput,
    ColorPickerSlider,
    ColorPickerSliderThumb,
    createColorPickerController,
  } from "@ui-sdk/svelte/color-picker"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()
  const picker = createColorPickerController()
  let value = $state("#0ea5e9")
</script>

<div>
  <div data-slot="controls">
    <button type="button" onclick={() => picker.setValue("#663399")}
      >Use Purple</button
    >
  </div>
  <ColorPicker
    aria-label="Theme color"
    bind:value
    onValueCommit={(next, details) =>
      log(`committed: ${next} (${details.reason})`)}
    controller={picker}
  >
    <ColorPickerArea>
      <ColorPickerAreaThumb />
    </ColorPickerArea>
    <ColorPickerSlider channel="hue">
      <ColorPickerSliderThumb />
    </ColorPickerSlider>
    <ColorPickerInput aria-label="Hex" />
  </ColorPicker>
</div>
