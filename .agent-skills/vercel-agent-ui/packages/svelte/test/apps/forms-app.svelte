<script lang="ts">
  import { Checkbox, CheckboxGroup } from "../../src/checkbox"
  import { Field, FieldControl, FieldLabel } from "../../src/field"
  import { Radio, RadioGroup } from "../../src/radio"
  import { Switch } from "../../src/switch"

  let {
    which,
  }: { which: "checkbox" | "switch" | "radio" | "group" | "field" } = $props()
</script>

{#if which === "checkbox"}
  <Checkbox name="terms" value="yes" defaultChecked required />
{:else if which === "switch"}
  <Switch name="wifi" defaultChecked />
{:else if which === "radio"}
  <RadioGroup name="plan">
    <Radio value="free" disabled />
    <Radio value="pro" />
    <Radio value="team" />
  </RadioGroup>
{:else if which === "group"}
  <CheckboxGroup
    name="toppings"
    defaultValue={["cheese"]}
    allValues={["cheese", "olives"]}
  >
    <Checkbox parent />
    <Checkbox value="cheese" />
    <Checkbox value="olives" />
  </CheckboxGroup>
{:else}
  <Field>
    <FieldLabel>Email</FieldLabel>
    <FieldControl type="email" />
  </Field>
{/if}
