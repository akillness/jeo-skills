import { Toggle, ToggleGroup } from "@ui-sdk/solid/toggle"
import { For } from "solid-js"

const views = [
  { value: "list", label: "قائمة" },
  { value: "grid", label: "شبكة" },
  { value: "cards", label: "بطاقات" },
]

function Example() {
  return (
    <div dir="rtl">
      <ToggleGroup defaultValue={["list"]} aria-label="العرض">
        <For each={views}>
          {(item) => <Toggle value={item.value}>{item.label}</Toggle>}
        </For>
      </ToggleGroup>
    </div>
  )
}

export { Example }
