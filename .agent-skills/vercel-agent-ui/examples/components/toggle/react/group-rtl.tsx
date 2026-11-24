import { Toggle, ToggleGroup } from "@ui-sdk/react/toggle"

const views = [
  { value: "list", label: "قائمة" },
  { value: "grid", label: "شبكة" },
  { value: "cards", label: "بطاقات" },
]

function Example() {
  return (
    <div dir="rtl">
      <ToggleGroup defaultValue={["list"]} aria-label="العرض">
        {views.map((item) => (
          <Toggle key={item.value} value={item.value}>
            {item.label}
          </Toggle>
        ))}
      </ToggleGroup>
    </div>
  )
}

export { Example }
