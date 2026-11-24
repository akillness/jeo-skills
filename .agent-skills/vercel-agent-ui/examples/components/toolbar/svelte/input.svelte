<script lang="ts">
  import { MinusIcon, PlusIcon } from "@lucide/svelte"
  import {
    NumberInput,
    NumberInputControl,
    NumberInputDecrement,
    NumberInputGroup,
    NumberInputIncrement,
  } from "@ui-sdk/svelte/number-input"
  import {
    Toolbar,
    ToolbarInput,
    ToolbarSeparator,
  } from "@ui-sdk/svelte/toolbar"
</script>

<Toolbar aria-label="Text">
  <NumberInput defaultValue={14} min={8} max={72}>
    <NumberInputGroup>
      <NumberInputDecrement aria-label="Decrease font size">
        <MinusIcon aria-hidden="true" />
      </NumberInputDecrement>
      <ToolbarInput aria-label="Font size">
        {#snippet render({ props })}
          <NumberInputControl {...props} />
        {/snippet}
      </ToolbarInput>
      <NumberInputIncrement aria-label="Increase font size">
        <PlusIcon aria-hidden="true" />
      </NumberInputIncrement>
    </NumberInputGroup>
  </NumberInput>
  <ToolbarSeparator />
  <ToolbarInput aria-label="Find" placeholder="Find…" />
</Toolbar>
