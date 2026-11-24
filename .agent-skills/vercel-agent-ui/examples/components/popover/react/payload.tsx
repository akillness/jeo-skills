"use client"

import * as React from "react"
import { Field, FieldControl, FieldLabel } from "@ui-sdk/react/field"
import {
  createPopoverController,
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@ui-sdk/react/popover"
import { useLog } from "../../../shared/react/log"

type Member = { name: string; role: string }

const roles = ["Admin", "Editor", "Viewer"]

function Example() {
  const log = useLog()
  const [popover] = React.useState(() => createPopoverController<Member>())
  const [members, setMembers] = React.useState<Member[]>([
    { name: "Hollis Grant", role: "Owner" },
    { name: "Inès Moreau", role: "Editor" },
    { name: "Kofi Mensah", role: "Viewer" },
    { name: "Wren Takahashi", role: "Viewer" },
  ])
  const newest = members[members.length - 1]

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button
          type="button"
          onClick={async (event) => {
            const result = await popover.open({
              payload: newest,
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
        {members.map((member) => (
          <li data-slot="row" key={member.name}>
            {member.name}
            <span data-slot="hint">{member.role}</span>
            <PopoverTrigger
              controller={popover}
              payload={member}
              disabled={member.role === "Owner"}
              data-size="sm"
              data-variant="ghost"
              aria-label={`Edit ${member.name}`}
            >
              Edit
            </PopoverTrigger>
          </li>
        ))}
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
            const member = state.payload
            return (
              <>
                <PopoverTitle>{member?.name}</PopoverTitle>
                <PopoverDescription>
                  Roles decide what they can change.
                </PopoverDescription>
                <form
                  data-slot="stack"
                  method="dialog"
                  onSubmit={(event) => {
                    const submitter = (event.nativeEvent as SubmitEvent)
                      .submitter as HTMLButtonElement
                    if (submitter.value !== "save" || !member) {
                      return
                    }
                    const role = String(
                      new FormData(event.currentTarget).get("role")
                    )
                    setMembers((current) =>
                      current.map((entry) =>
                        entry.name === member.name ? { ...entry, role } : entry
                      )
                    )
                  }}
                >
                  <Field>
                    <FieldLabel>Role</FieldLabel>
                    <FieldControl
                      key={member?.name}
                      name="role"
                      defaultValue={member?.role}
                      render={
                        <select>
                          {roles.map((role) => (
                            <option key={role}>{role}</option>
                          ))}
                        </select>
                      }
                    />
                  </Field>
                  <div data-slot="row">
                    <button type="submit" value="cancel" formNoValidate>
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
