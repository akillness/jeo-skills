import type { ListData } from "@ui-sdk/core/listbox"
import "@ui-sdk/web/listbox"
import { Check, createElement } from "lucide"
import { log } from "../../../shared/web/log"

const plans: ListData<{ id: string; price: number }> = [
  { value: { id: "hobby", price: 0 }, label: "Hobby" },
  { value: { id: "pro", price: 20 }, label: "Pro" },
  { value: { id: "team", price: 50 }, label: "Team" },
  {
    value: { id: "enterprise", price: 200 },
    label: "Enterprise",
    disabled: true,
  },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-listbox default-value="pro" aria-label="Plan">
      <template>
        <ui-listbox-item>
          <ui-listbox-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-listbox-item-indicator>
        </ui-listbox-item>
      </template>
    </ui-listbox>
  `
  const listbox = root.querySelector("ui-listbox")!
  listbox.itemToValue = (plan) => (plan as { id: string }).id
  listbox.isItemEqualToValue = (plan, selected) =>
    (plan as { id: string }).id === (selected as { id: string }).id
  listbox.items = plans
  listbox.addEventListener("valuechange", (event) => {
    const plan = event.detail.value as { id: string; price: number } | null
    log(root, plan ? `${plan.id}, $${plan.price} a month` : "No plan")
  })
}

export { mount }
