import { Field, FieldControl, FieldLabel } from "@ui-sdk/solid/field"
import {
  TriggerMenu,
  TriggerMenuHint,
  TriggerMenuInput,
} from "@ui-sdk/solid/trigger-menu"
import { useLog } from "../../../shared/solid/log"

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

function Example() {
  const log = useLog()

  return (
    <form
      data-slot="stack"
      onSubmit={(event) => {
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
            ["Chose", `/${value}`, ...Object.values(details.arguments)].join(
              " "
            )
          )
        }
      >
        <Field name="message">
          <FieldLabel>Message</FieldLabel>
          <FieldControl
            render={(props) => (
              <TriggerMenuInput {...props} placeholder="Type / for commands…" />
            )}
          />
        </Field>
        <TriggerMenuHint />
      </TriggerMenu>
    </form>
  )
}

export { Example }
