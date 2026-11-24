import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@ui-sdk/solid/accordion"

function Example() {
  return (
    <div>
      <nav data-slot="controls" aria-label="Jump to">
        <a href="#refund-timeline">Jump to the refund timeline</a>
        <a href="#return-label">Print a return label</a>
      </nav>
      <Accordion hiddenUntilFound>
        <AccordionItem value="returns">
          <AccordionHeader>
            <AccordionTrigger>
              Returns
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
            <div data-slot="stack">
              <p>
                Return any unused item in its original packaging within 30 days.
              </p>
              <p id="return-label">
                To print a return label, open the order and choose Return. The
                label is free.
              </p>
            </div>
          </AccordionPanel>
        </AccordionItem>
        <AccordionItem value="refunds">
          <AccordionHeader>
            <AccordionTrigger>
              Refunds
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
            <div data-slot="stack">
              <p>Refunds go back to the card you paid with.</p>
              <p id="refund-timeline">
                Timeline: we inspect the item within 2 days of receiving it, and
                your bank shows the refund 5 to 7 business days later.
              </p>
            </div>
          </AccordionPanel>
        </AccordionItem>
        <AccordionItem value="exchanges">
          <AccordionHeader>
            <AccordionTrigger>
              Exchanges
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
            <div data-slot="stack">
              <p>
                Start a return, choose Exchange and pick the new size. Shipping
                both ways is free.
              </p>
            </div>
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </div>
  )
}

export { Example }
