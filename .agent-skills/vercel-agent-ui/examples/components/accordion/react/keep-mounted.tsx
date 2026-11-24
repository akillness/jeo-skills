"use client"

import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@ui-sdk/react/accordion"
import { Field, FieldLabel } from "@ui-sdk/react/field"
import { Textarea } from "@ui-sdk/react/textarea"
import { ChevronDownIcon } from "lucide-react"

function Example() {
  return (
    <Accordion defaultValue={["reply"]}>
      <AccordionItem value="reply">
        <AccordionHeader>
          <AccordionTrigger>
            Reply to this thread
            <ChevronDownIcon aria-hidden="true" />
          </AccordionTrigger>
        </AccordionHeader>
        <AccordionPanel keepMounted>
          <Field>
            <FieldLabel>Message</FieldLabel>
            <Textarea rows={3} placeholder="Write a reply…" />
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
  )
}

export { Example }
