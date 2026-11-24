<script setup lang="ts">
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import { Input } from "@ui-sdk/vue/input"
import { Tabs, TabsList, TabsPanel, TabsTab } from "@ui-sdk/vue/tabs"
</script>

<template>
  <Tabs default-value="preview" activation="manual">
    <TabsList aria-label="Snippet">
      <TabsTab value="preview">Preview</TabsTab>
      <TabsTab value="code">Code</TabsTab>
    </TabsList>
    <TabsPanel value="preview"
      >Welcome back, Hollis. You have 3 unread messages.</TabsPanel
    >
    <TabsPanel value="code">
      <Field>
        <FieldLabel>Source</FieldLabel>
        <Input default-value='<Welcome name="Hollis" unread={3} />' />
      </Field>
    </TabsPanel>
  </Tabs>
</template>
