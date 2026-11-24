<script setup lang="ts">
import { ChevronDownIcon } from "@lucide/vue"
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@ui-sdk/vue/collapsible"

const details = [
  { label: "عنوان الشحن", value: "شارع الملك فهد، الرياض" },
  { label: "المنتجات", value: "قميص كتان × ٢" },
  { label: "التوصيل", value: "عادي، يصل في ٧ مارس" },
  { label: "الإجمالي", value: "٨٤٫٠٠ $" },
]
</script>

<template>
  <div dir="rtl">
    <Collapsible>
      <div data-slot="row">
        <div data-slot="stack">
          <p>الطلب #4189</p>
          <p data-slot="hint">تم الطلب في ٣ مارس</p>
        </div>
        <span data-slot="row"> تم الشحن </span>
      </div>
      <div>
        <CollapsibleTrigger data-variant="ghost">
          تفاصيل الطلب
          <ChevronDownIcon />
        </CollapsibleTrigger>
        <CollapsiblePanel>
          <dl>
            <div data-slot="row" v-for="detail in details" :key="detail.label">
              <dt>{{ detail.label }}</dt>
              <dd>{{ detail.value }}</dd>
            </div>
          </dl>
        </CollapsiblePanel>
      </div>
    </Collapsible>
  </div>
</template>
