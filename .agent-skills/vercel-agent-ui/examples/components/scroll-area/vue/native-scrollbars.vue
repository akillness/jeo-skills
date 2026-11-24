<script setup lang="ts">
import {
  ScrollArea,
  ScrollAreaContent,
  ScrollAreaViewport,
} from "@ui-sdk/vue/scroll-area"

const messages = [
  { from: "Hollis Grant", subject: "Launch checklist for Thursday" },
  { from: "Inès Moreau", subject: "Updated pricing page copy" },
  { from: "Kofi Mensah", subject: "Design review notes" },
  { from: "Wren Takahashi", subject: "Q4 roadmap draft" },
  { from: "Tomasz Wójcik", subject: "Re: Staging deploy failed" },
  { from: "Hollis Grant", subject: "Invoices for October" },
  { from: "Inès Moreau", subject: "Customer interview recordings" },
  { from: "Kofi Mensah", subject: "New icons for the dashboard" },
  { from: "Wren Takahashi", subject: "Offsite agenda" },
  { from: "Tomasz Wójcik", subject: "Database migration plan" },
]
</script>

<template>
  <ScrollArea>
    <ScrollAreaViewport role="region" aria-label="Inbox">
      <ScrollAreaContent>
        <ul>
          <li v-for="message in messages" :key="message.subject">
            {{ message.from }}
            <span data-slot="hint">{{ message.subject }}</span>
          </li>
        </ul>
      </ScrollAreaContent>
    </ScrollAreaViewport>
  </ScrollArea>
</template>
