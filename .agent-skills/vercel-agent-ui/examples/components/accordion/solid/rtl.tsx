import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@ui-sdk/solid/accordion"
import { For } from "solid-js"

const items = [
  {
    value: "shipping",
    label: "ما هي خيارات الشحن؟",
    content: "نقدم الشحن العادي والسريع والشحن في اليوم التالي.",
  },
  {
    value: "returns",
    label: "ما هي سياسة الإرجاع؟",
    content: "يمكنك إرجاع أي منتج غير مستخدم خلال ٣٠ يومًا.",
  },
  {
    value: "support",
    label: "كيف أتواصل مع الدعم؟",
    content: "راسلنا عبر البريد أو الدردشة، ونرد خلال ٢٤ ساعة.",
  },
]

export function Example() {
  return (
    <div dir="rtl">
      <Accordion defaultValue={["shipping"]}>
        <For each={items}>
          {(item) => (
            <AccordionItem value={item.value}>
              <AccordionHeader>
                <AccordionTrigger>
                  {item.label}
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
              <AccordionPanel>{item.content}</AccordionPanel>
            </AccordionItem>
          )}
        </For>
      </Accordion>
    </div>
  )
}
