"use client"

import {
  Menu,
  MenuContent,
  MenuItem,
  MenuItemIcon,
  MenuSeparator,
  MenuTrigger,
} from "@ui-sdk/react/menu"
import {
  CodeIcon,
  DownloadIcon,
  LinkIcon,
  MailIcon,
  ReplyIcon,
  ShareIcon,
} from "lucide-react"
import { useLog } from "../../../shared/react/log"

function Example() {
  const log = useLog()

  return (
    <Menu onAction={(value) => log(`Chose ${value}`)}>
      <MenuTrigger>
        <ShareIcon />
        Share
      </MenuTrigger>
      <MenuContent>
        <MenuItem value="copy-link">
          <MenuItemIcon>
            <LinkIcon />
          </MenuItemIcon>
          Copy link
        </MenuItem>
        <MenuItem value="email">
          <MenuItemIcon>
            <MailIcon />
          </MenuItemIcon>
          Email
        </MenuItem>
        <MenuItem value="reply">
          <MenuItemIcon mirror>
            <ReplyIcon />
          </MenuItemIcon>
          Reply
        </MenuItem>
        <MenuSeparator />
        <MenuItem value="download">
          <MenuItemIcon>
            <DownloadIcon />
          </MenuItemIcon>
          Download
        </MenuItem>
        <MenuItem value="embed">
          <MenuItemIcon>
            <CodeIcon />
          </MenuItemIcon>
          Embed
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}

export { Example }
