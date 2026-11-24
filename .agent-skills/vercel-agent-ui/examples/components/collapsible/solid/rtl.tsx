import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@ui-sdk/solid/collapsible"
import { For } from "solid-js"

const details = [
  { label: "عنوان الشحن", value: "شارع الملك فهد، الرياض" },
  { label: "المنتجات", value: "قميص كتان × ٢" },
  { label: "التوصيل", value: "عادي، يصل في ٧ مارس" },
  { label: "الإجمالي", value: "٨٤٫٠٠ $" },
]

export function Example() {
  return (
    <div dir="rtl">
      <Collapsible>
        <div data-slot="row">
          <div data-slot="stack">
            <p>الطلب #4189</p>
            <p data-slot="hint">تم الطلب في ٣ مارس</p>
          </div>
          <span data-slot="row">تم الشحن</span>
        </div>
        <div>
          <CollapsibleTrigger data-variant="ghost">
            تفاصيل الطلب
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
          </CollapsibleTrigger>
          <CollapsiblePanel>
            <dl>
              <For each={details}>
                {(detail) => (
                  <div data-slot="row">
                    <dt>{detail.label}</dt>
                    <dd>{detail.value}</dd>
                  </div>
                )}
              </For>
            </dl>
          </CollapsiblePanel>
        </div>
      </Collapsible>
    </div>
  )
}
