<script setup lang="ts">
import { ChevronDownIcon } from "@lucide/vue"
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@ui-sdk/vue/accordion"
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import { Textarea } from "@ui-sdk/vue/textarea"
</script>

<template>
  <Accordion :default-value="['reply']">
    <AccordionItem value="reply">
      <AccordionHeader>
        <AccordionTrigger>
          Reply to this thread
          <ChevronDownIcon aria-hidden="true" />
        </AccordionTrigger>
      </AccordionHeader>
      <AccordionPanel keep-mounted>
        <Field>
          <FieldLabel>Message</FieldLabel>
          <Textarea rows="3" placeholder="Write a reply…" />
        </Field>
      </AccordionPanel>
    </AccordionItem>
    <AccordionItem value="formatting">
      <AccordionHeader>
        <AccordionTrigger>
          Formatting
          <ChevronDownIcon aria-hidden="true" />
        </AccordionTrigger>
      </AccordionHeader>
      <AccordionPanel>
        <p>Use **bold**, _italics_ and `code`. Links paste as previews.</p>
      </AccordionPanel>
    </AccordionItem>
  </Accordion>
</template>
