import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@ui-sdk/react/collapsible"
import { ChevronDownIcon } from "lucide-react"

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
            <ChevronDownIcon />
          </CollapsibleTrigger>
          <CollapsiblePanel>
            <dl>
              {details.map((detail) => (
                <div data-slot="row" key={detail.label}>
                  <dt>{detail.label}</dt>
                  <dd>{detail.value}</dd>
                </div>
              ))}
            </dl>
          </CollapsiblePanel>
        </div>
      </Collapsible>
    </div>
  )
}
