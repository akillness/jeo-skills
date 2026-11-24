import { Field, FieldControl, FieldLabel } from "@ui-sdk/solid/field"
import {
  createPopoverController,
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@ui-sdk/solid/popover"
import { createSignal, For, Show } from "solid-js"
import { useLog } from "../../../shared/solid/log"

type Member = { name: string; role: string }

const roles = ["Admin", "Editor", "Viewer"]

function Example() {
  const log = useLog()
  const popover = createPopoverController<Member>()
  const [members, setMembers] = createSignal<Member[]>([
    { name: "Hollis Grant", role: "Owner" },
    { name: "Inès Moreau", role: "Editor" },
    { name: "Kofi Mensah", role: "Viewer" },
    { name: "Wren Takahashi", role: "Viewer" },
  ])
  const newest = () => members()[members().length - 1]

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button
          type="button"
          onClick={async (event) => {
            const result = await popover.open({
              payload: newest(),
              anchor: event.currentTarget,
            })
            log(
              `Closed (${result.reason}), returned ${result.returnValue ?? "nothing"}`
            )
          }}
        >
          Edit Newest Member
        </button>
      </div>
      <ul data-slot="list">
        <For each={members()} keyed={(member) => member.name}>
          {(member) => (
            <li data-slot="row">
              {member().name}
              <span data-slot="hint">{member().role}</span>
              <PopoverTrigger
                controller={popover}
                payload={member()}
                disabled={member().role === "Owner"}
                data-size="sm"
                data-variant="ghost"
                aria-label={`Edit ${member().name}`}
              >
                Edit
              </PopoverTrigger>
            </li>
          )}
        </For>
      </ul>
      <Popover
        controller={popover}
        onPayloadChange={(payload) => {
          const member = payload as Member | undefined
          if (member) {
            log(`Editing ${member.name}`)
          }
        }}
      >
        <PopoverContent<Member> align="end" sideOffset={8}>
          {(state) => {
            const member = () => state.payload
            return (
              <>
                <PopoverTitle>{member()?.name}</PopoverTitle>
                <PopoverDescription>
                  Roles decide what they can change.
                </PopoverDescription>
                <form
                  data-slot="stack"
                  method="dialog"
                  onSubmit={(event) => {
                    const submitter = event.submitter as HTMLButtonElement
                    const editing = member()
                    if (submitter.value !== "save" || !editing) {
                      return
                    }
                    const role = String(
                      new FormData(event.currentTarget).get("role")
                    )
                    setMembers((current) =>
                      current.map((entry) =>
                        entry.name === editing.name ? { ...entry, role } : entry
                      )
                    )
                  }}
                >
                  <Field>
                    <FieldLabel>Role</FieldLabel>
                    <Show when={member()?.name} keyed>
                      <FieldControl
                        name="role"
                        defaultValue={member()?.role}
                        render={(props) => (
                          <select {...props}>
                            <For each={roles}>
                              {(role) => <option>{role}</option>}
                            </For>
                          </select>
                        )}
                      />
                    </Show>
                  </Field>
                  <div data-slot="row">
                    <button type="submit" value="cancel" formnovalidate>
                      Cancel
                    </button>
                    <button type="submit" value="save" data-variant="solid">
                      Save
                    </button>
                  </div>
                </form>
              </>
            )
          }}
        </PopoverContent>
      </Popover>
    </div>
  )
}

export { Example }
