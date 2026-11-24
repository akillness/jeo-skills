<script lang="ts">
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import { Input } from "@ui-sdk/svelte/input"
  import { Tabs, TabsList, TabsPanel, TabsTab } from "@ui-sdk/svelte/tabs"
</script>

<Tabs defaultValue="preview" activation="manual">
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
      <Input defaultValue={'<Welcome name="Hollis" unread={3} />'} />
    </Field>
  </TabsPanel>
</Tabs>
