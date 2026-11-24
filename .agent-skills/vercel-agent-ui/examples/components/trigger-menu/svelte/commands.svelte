<script lang="ts">
  import { Field, FieldControl, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    TriggerMenu,
    TriggerMenuHint,
    TriggerMenuInput,
  } from "@ui-sdk/svelte/trigger-menu"
  import { useLog } from "../../../shared/svelte/log"

  const commands = [
    {
      value: "status",
      label: "status",
      arguments: [
        {
          name: "status",
          hint: "<status>",
          required: true,
          items: ["available", "busy", "away"],
        },
        {
          name: "until",
          hint: "[until]",
          items: ["30m", "1h", "4h", "today"],
          allowCustomValue: false,
        },
      ],
    },
    {
      value: "search",
      label: "search",
      arguments: [{ name: "query", hint: "<query>", required: true }],
    },
    { value: "away", label: "away", after: "submit" as const },
    { value: "clear", label: "clear" },
  ]

  const log = useLog()
</script>

<form
  data-slot="stack"
  onsubmit={(event) => {
    event.preventDefault()
    log(`Sent ${new FormData(event.currentTarget).get("message")}`)
  }}
>
  <TriggerMenu
    triggers={[
      { char: "/", boundary: "start", type: "command", items: commands },
    ]}
    onSelect={(value, details) =>
      log(
        ["Chose", `/${value}`, ...Object.values(details.arguments)].join(" ")
      )}
  >
    <Field name="message">
      <FieldLabel>Message</FieldLabel>
      <FieldControl>
        {#snippet render({ props })}
          <TriggerMenuInput {...props} placeholder="Type / for commands…" />
        {/snippet}
      </FieldControl>
    </Field>
    <TriggerMenuHint />
  </TriggerMenu>
</form>
