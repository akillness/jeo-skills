<script setup lang="ts">
import { CheckIcon, MinusIcon } from "@lucide/vue"
import {
  Checkbox,
  CheckboxGroup,
  CheckboxIndicator,
} from "@ui-sdk/vue/checkbox"

const backups = [
  { value: "photos", label: "Photos" },
  { value: "documents", label: "Documents" },
  { value: "messages", label: "Messages" },
]

const folders = [
  { value: "desktop", label: "Desktop", disabled: true },
  { value: "projects", label: "Projects", disabled: false },
  { value: "downloads", label: "Downloads", disabled: false },
]
</script>

<template>
  <div data-slot="stack">
    <div data-slot="stack">
      <h3 id="disabled-backups">Backups</h3>
      <p data-slot="hint">Managed by your organization.</p>
      <CheckboxGroup
        aria-labelledby="disabled-backups"
        :default-value="['photos', 'documents']"
        disabled
      >
        <label data-slot="label" v-for="item in backups" :key="item.value">
          <Checkbox :value="item.value">
            <CheckboxIndicator>
              <CheckIcon aria-hidden="true" />
            </CheckboxIndicator>
          </Checkbox>
          {{ item.label }}
        </label>
      </CheckboxGroup>
    </div>
    <div data-slot="stack">
      <h3 id="disabled-folders">Sync folders</h3>
      <CheckboxGroup
        aria-labelledby="disabled-folders"
        :default-value="['desktop']"
        :all-values="folders.map((item) => item.value)"
      >
        <label data-slot="label">
          <Checkbox parent>
            <CheckboxIndicator>
              <CheckIcon aria-hidden="true" />
              <MinusIcon aria-hidden="true" />
            </CheckboxIndicator>
          </Checkbox>
          Select all
        </label>
        <div data-slot="stack">
          <label data-slot="label" v-for="item in folders" :key="item.value">
            <Checkbox :value="item.value" :disabled="item.disabled">
              <CheckboxIndicator>
                <CheckIcon aria-hidden="true" />
              </CheckboxIndicator>
            </Checkbox>
            {{ item.label }}
          </label>
        </div>
      </CheckboxGroup>
    </div>
  </div>
</template>
