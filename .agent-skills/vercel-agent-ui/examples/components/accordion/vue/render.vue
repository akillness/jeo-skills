<script setup lang="ts">
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@ui-sdk/vue/accordion"

const steps = [
  {
    value: "install",
    label: "Install the package",
    content: "Add it with your package manager. It has no dependencies.",
  },
  {
    value: "import",
    label: "Import the parts",
    content: "Import the accordion parts you need from the package.",
  },
  {
    value: "style",
    label: "Style it",
    content: "Every part renders its state as data attributes you can style.",
  },
]
</script>

<template>
  <Accordion multiple :default-value="['install']">
    <AccordionItem v-for="step in steps" :key="step.value" :value="step.value">
      <AccordionHeader>
        <template #render="{ props }">
          <h4 v-bind="props">
            <AccordionTrigger>
              <template #render="{ props: triggerProps, state: triggerState }">
                <button v-bind="triggerProps">
                  <span
                    data-slot="hint"
                    v-if="triggerState.index >= 0"
                    aria-hidden="true"
                  >
                    {{ String(triggerState.index + 1).padStart(2, "0") }}
                  </span>
                  <span>{{ step.label }}</span>
                  <span data-slot="hint" aria-hidden="true">
                    {{ triggerState.open ? "Hide" : "Show" }}
                  </span>
                </button>
              </template>
            </AccordionTrigger>
          </h4>
        </template>
      </AccordionHeader>
      <AccordionPanel>
        {{ step.content }}
      </AccordionPanel>
    </AccordionItem>
  </Accordion>
</template>
