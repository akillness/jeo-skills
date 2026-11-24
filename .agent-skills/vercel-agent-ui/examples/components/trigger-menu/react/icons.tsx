"use client"

import { Field, FieldControl, FieldLabel } from "@ui-sdk/react/field"
import {
  TriggerMenu,
  TriggerMenuContent,
  TriggerMenuInput,
  TriggerMenuItem,
  TriggerMenuItemIcon,
  TriggerMenuList,
} from "@ui-sdk/react/trigger-menu"
import {
  ClockIcon,
  ReplyIcon,
  SearchIcon,
  ShareIcon,
  TrashIcon,
} from "lucide-react"

const commands = [
  { value: "reply", icon: ReplyIcon, mirror: true },
  { value: "remind", icon: ClockIcon },
  { value: "search", icon: SearchIcon },
  { value: "share", icon: ShareIcon },
  { value: "clear", icon: TrashIcon },
]

function Example() {
  return (
    <TriggerMenu triggers={[{ char: "/", boundary: "start", type: "command" }]}>
      <Field>
        <FieldLabel>Message</FieldLabel>
        <FieldControl
          render={<TriggerMenuInput placeholder="Type / for commands…" />}
        />
      </Field>
      <TriggerMenuContent>
        <TriggerMenuList>
          {commands.map((command) => (
            <TriggerMenuItem key={command.value} value={command.value}>
              <TriggerMenuItemIcon mirror={command.mirror}>
                <command.icon />
              </TriggerMenuItemIcon>
              {command.value}
            </TriggerMenuItem>
          ))}
        </TriggerMenuList>
      </TriggerMenuContent>
    </TriggerMenu>
  )
}

export { Example }
