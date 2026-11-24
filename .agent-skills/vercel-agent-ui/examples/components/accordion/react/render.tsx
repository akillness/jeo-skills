import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@ui-sdk/react/accordion"

const steps = [
  {
    value: "install",
    label: "Install the package",
    content: "Add it with your package manager. It has no dependencies.",
  },
  {
    value: "import",
    label: "Import the parts",
    content: "Import the accordion parts you need from the package.",
  },
  {
    value: "style",
    label: "Style it",
    content: "Every part renders its state as data attributes you can style.",
  },
]

export function Example() {
  return (
    <Accordion multiple defaultValue={["install"]}>
      {steps.map((step) => (
        <AccordionItem key={step.value} value={step.value}>
          <AccordionHeader render={<h4 />}>
            <AccordionTrigger
              render={(props, state) => (
                <button {...props}>
                  {state.index >= 0 && (
                    <span data-slot="hint" aria-hidden>
                      {String(state.index + 1).padStart(2, "0")}
                    </span>
                  )}
                  <span>{props.children}</span>
                  <span data-slot="hint" aria-hidden>
                    {state.open ? "Hide" : "Show"}
                  </span>
                </button>
              )}
            >
              {step.label}
            </AccordionTrigger>
          </AccordionHeader>
          <AccordionPanel>{step.content}</AccordionPanel>
        </AccordionItem>
      ))}
    </Accordion>
  )
}
