<script lang="ts">
  import { Field, FieldControl, FieldLabel } from "@ui-sdk/svelte/field"
  import { TriggerMenu, TriggerMenuInput } from "@ui-sdk/svelte/trigger-menu"
  import { useLog } from "../../../shared/svelte/log"

  const people = [
    { value: "hollis", label: "Hollis Grant" },
    { value: "ines", label: "Inès Moreau" },
    { value: "kofi", label: "Kofi Mensah" },
    { value: "wren", label: "Wren Takahashi" },
    { value: "tomasz", label: "Tomasz Wójcik" },
  ]

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
      ],
    },
  ]

  const log = useLog()
  let open = $state(false)
</script>

<TriggerMenu
  triggers={[
    { char: "@", items: people },
    { char: "/", boundary: "start", items: commands },
  ]}
  bind:open
  onOpenChange={(next, details) =>
    log(`${next ? "Opening" : "Closing"} (${details.reason})`)}
  onOpenChangeComplete={(next) => log(next ? "Open" : "Closed")}
  onQueryChange={(query, details) =>
    log(
      `Query “${query}”${details.argument ? ` for ${details.argument}` : ""}`
    )}
  shortcut="ctrl+j"
>
  <Field>
    <FieldLabel>Message</FieldLabel>
    <FieldControl>
      {#snippet render({ props })}
        <TriggerMenuInput {...props} placeholder="Type @ or /…" />
      {/snippet}
    </FieldControl>
  </Field>
</TriggerMenu>
