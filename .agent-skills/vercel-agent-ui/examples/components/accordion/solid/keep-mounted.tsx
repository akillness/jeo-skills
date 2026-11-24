import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@ui-sdk/solid/accordion"
import { Field, FieldLabel } from "@ui-sdk/solid/field"
import { Textarea } from "@ui-sdk/solid/textarea"

function Example() {
  return (
    <Accordion defaultValue={["reply"]}>
      <AccordionItem value="reply">
        <AccordionHeader>
          <AccordionTrigger>
            Reply to this thread
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
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
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
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
