import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@ui-sdk/react/accordion"
import { ChevronDownIcon } from "lucide-react"

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
        {items.map((item) => (
          <AccordionItem key={item.value} value={item.value}>
            <AccordionHeader>
              <AccordionTrigger>
                {item.label}
                <ChevronDownIcon />
              </AccordionTrigger>
            </AccordionHeader>
            <AccordionPanel>{item.content}</AccordionPanel>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  )
}
