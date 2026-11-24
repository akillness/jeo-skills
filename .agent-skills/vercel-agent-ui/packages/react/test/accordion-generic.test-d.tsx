import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionTrigger,
} from "../src/accordion"

// `T` comes from `value`, and reaches `onValueChange` and the root's state.
;<Accordion
  value={["shipping"]}
  onValueChange={(value) => {
    const known: "shipping"[] = value
    // @ts-expect-error `value` lists "shipping", not numbers.
    const wrong: number[] = value
    void known
    void wrong
  }}
  className={(state) => (state.value.includes("shipping") ? "open" : "closed")}
>
  <AccordionItem value="shipping">
    {/* A header and a trigger take their value from the item. */}
    <AccordionHeader>
      <AccordionTrigger>Shipping</AccordionTrigger>
    </AccordionHeader>
  </AccordionItem>
</Accordion>
// @ts-expect-error `multiple` is a boolean.
;<Accordion multiple="yes" />
