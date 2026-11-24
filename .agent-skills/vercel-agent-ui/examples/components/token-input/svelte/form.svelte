<script lang="ts">
  import { CheckIcon } from "@lucide/svelte"
  import { Checkbox, CheckboxIndicator } from "@ui-sdk/svelte/checkbox"
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    TokenInput,
    TokenInputEditor,
    type TokenInputValue,
  } from "@ui-sdk/svelte/token-input"
  import { useLog } from "../../../shared/svelte/log"

  const draft: TokenInputValue = [
    "Explain ",
    { type: "file", value: "src/routes.ts", label: "routes.ts" },
    " in two sentences.",
  ]

  const log = useLog()
  let disabled = $state(false)
  let readOnly = $state(false)
  const formId = $props.id()

  function onSubmit(event: SubmitEvent & { currentTarget: HTMLFormElement }) {
    event.preventDefault()
    log(`Submitted ${new FormData(event.currentTarget).get("prompt") ?? ""}`)
  }
</script>

<div data-slot="stack">
  <div data-slot="controls">
    <label data-slot="label">
      <Checkbox
        checked={disabled}
        onCheckedChange={(next) => (disabled = next === true)}
      >
        <CheckboxIndicator>
          <CheckIcon aria-hidden="true" />
        </CheckboxIndicator>
      </Checkbox>
      Disabled
    </label>
    <label data-slot="label">
      <Checkbox
        checked={readOnly}
        onCheckedChange={(next) => (readOnly = next === true)}
      >
        <CheckboxIndicator>
          <CheckIcon aria-hidden="true" />
        </CheckboxIndicator>
      </Checkbox>
      Read-only
    </label>
  </div>
  <div data-slot="stack">
    <Field {disabled}>
      <FieldLabel>Prompt</FieldLabel>
      <TokenInput
        form={formId}
        name="prompt"
        required
        defaultValue={draft}
        {readOnly}
      >
        <TokenInputEditor />
      </TokenInput>
    </Field>
    <form id={formId} data-slot="row" onsubmit={onSubmit}>
      <button type="submit" data-variant="solid">Submit</button>
      <button type="reset">Reset</button>
    </form>
  </div>
</div>
