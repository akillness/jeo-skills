"use client"

import { Listbox, ListboxItem, ListboxItemIcon } from "@ui-sdk/react/listbox"
import {
  ArchiveIcon,
  ArrowRightIcon,
  MailIcon,
  PencilIcon,
  StarIcon,
} from "lucide-react"

const views = [
  { value: "inbox", label: "Inbox", icon: MailIcon },
  { value: "starred", label: "Starred", icon: StarIcon },
  { value: "drafts", label: "Drafts", icon: PencilIcon },
  { value: "archive", label: "Archive", icon: ArchiveIcon },
  { value: "next", label: "Next page", icon: ArrowRightIcon },
]

function Example() {
  return (
    <Listbox defaultValue="inbox" aria-label="Mailbox">
      {views.map((view) => (
        <ListboxItem key={view.value} value={view.value}>
          <ListboxItemIcon mirror={view.icon === ArrowRightIcon}>
            <view.icon />
          </ListboxItemIcon>
          {view.label}
        </ListboxItem>
      ))}
    </Listbox>
  )
}

export { Example }
