import { Tabs, TabsList, TabsPanel, TabsTab } from "@ui-sdk/solid/tabs"
import { For } from "solid-js"

const policies = [
  {
    value: "shipping",
    label: "Shipping",
    text: "Orders leave our warehouse within two working days. Express delivery arrives the next morning.",
  },
  {
    value: "returns",
    label: "Returns",
    text: "Send anything back within 30 days. Opened electronics carry a restocking fee of 10 percent.",
  },
  {
    value: "warranty",
    label: "Warranty",
    text: "Every product has a two-year warranty. Batteries are covered for one year from delivery.",
  },
]

function Example() {
  return (
    <Tabs defaultValue="shipping" hiddenUntilFound>
      <TabsList aria-label="Policies">
        <For each={policies}>
          {(policy) => <TabsTab value={policy.value}>{policy.label}</TabsTab>}
        </For>
      </TabsList>
      <For each={policies}>
        {(policy) => <TabsPanel value={policy.value}>{policy.text}</TabsPanel>}
      </For>
    </Tabs>
  )
}

export { Example }
