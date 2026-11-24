import { Field, FieldControl, FieldLabel } from "@ui-sdk/solid/field"
import { TriggerMenu, TriggerMenuInput } from "@ui-sdk/solid/trigger-menu"
import { createSignal } from "solid-js"
import { useLog } from "../../../shared/solid/log"

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

function Example() {
  const log = useLog()
  const [open, setOpen] = createSignal(false)

  return (
    <TriggerMenu
      triggers={[
        { char: "@", items: people },
        { char: "/", boundary: "start", items: commands },
      ]}
      open={open()}
      onOpenChange={(next, details) => {
        setOpen(next)
        log(`${next ? "Opening" : "Closing"} (${details.reason})`)
      }}
      onOpenChangeComplete={(next) => log(next ? "Open" : "Closed")}
      onQueryChange={(query, details) =>
        log(
          `Query “${query}”${details.argument ? ` for ${details.argument}` : ""}`
        )
      }
      shortcut="ctrl+j"
    >
      <Field>
        <FieldLabel>Message</FieldLabel>
        <FieldControl
          render={(props) => (
            <TriggerMenuInput {...props} placeholder="Type @ or /…" />
          )}
        />
      </Field>
    </TriggerMenu>
  )
}

export { Example }
