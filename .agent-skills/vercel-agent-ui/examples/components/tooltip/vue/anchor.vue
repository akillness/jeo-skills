<script setup lang="ts">
import { InfoIcon } from "@lucide/vue"
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import { Input } from "@ui-sdk/vue/input"
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui-sdk/vue/tooltip"
import { useTemplateRef } from "vue"

const field = useTemplateRef<HTMLDivElement>("field")
</script>

<template>
  <Field>
    <FieldLabel>Webhook URL</FieldLabel>
    <div ref="field" data-slot="row">
      <Input placeholder="https://" />
      <Tooltip>
        <TooltipTrigger aria-label="About webhooks">
          <InfoIcon aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent :anchor="field" side="bottom" align="start">
          We send a POST request here for every new order.
        </TooltipContent>
      </Tooltip>
    </div>
  </Field>
</template>
