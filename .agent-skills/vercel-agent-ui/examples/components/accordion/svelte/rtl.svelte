<script lang="ts">
  import { ChevronDownIcon } from "@lucide/svelte"
  import {
    Accordion,
    AccordionHeader,
    AccordionItem,
    AccordionPanel,
    AccordionTrigger,
  } from "@ui-sdk/svelte/accordion"

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
</script>

<div dir="rtl">
  <Accordion defaultValue={["shipping"]}>
    {#each items as item (item.value)}
      <AccordionItem value={item.value}>
        <AccordionHeader>
          <AccordionTrigger>
            {item.label}
            <ChevronDownIcon />
          </AccordionTrigger>
        </AccordionHeader>
        <AccordionPanel>
          {item.content}
        </AccordionPanel>
      </AccordionItem>
    {/each}
  </Accordion>
</div>
