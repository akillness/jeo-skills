<script setup lang="ts">
import { CheckIcon, MessageSquareIcon } from "@lucide/vue"
import {
  Toolbar,
  ToolbarButton,
  ToolbarLink,
  ToolbarSeparator,
} from "@ui-sdk/vue/toolbar"
import { useLog } from "../../../shared/vue/log"

const log = useLog()

function follow(event: MouseEvent) {
  if (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return
  }
  event.preventDefault()
  log(`Opened ${(event.currentTarget as HTMLAnchorElement).textContent}`)
}
</script>

<template>
  <Toolbar aria-label="Pull request">
    <ToolbarButton aria-label="Approve" @click="log('Approved')">
      <CheckIcon aria-hidden="true" />
    </ToolbarButton>
    <ToolbarButton aria-label="Comment" @click="log('Comment')">
      <MessageSquareIcon aria-hidden="true" />
    </ToolbarButton>
    <ToolbarSeparator />
    <ToolbarLink href="#files" @click="follow">Files Changed</ToolbarLink>
    <ToolbarLink href="#checks" @click="follow">Checks</ToolbarLink>
  </Toolbar>
</template>
