<script setup lang="ts">
import {
  CodeIcon,
  DownloadIcon,
  LinkIcon,
  MailIcon,
  ReplyIcon,
  ShareIcon,
} from "@lucide/vue"
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuItemIcon,
  MenuSeparator,
  MenuTrigger,
} from "@ui-sdk/vue/menu"
import { useLog } from "../../../shared/vue/log"

const log = useLog()
</script>

<template>
  <Menu @action="(value) => log(`Chose ${value}`)">
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
</template>
