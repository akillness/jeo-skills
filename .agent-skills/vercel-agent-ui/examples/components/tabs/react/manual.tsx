"use client"

import { Field, FieldLabel } from "@ui-sdk/react/field"
import { Input } from "@ui-sdk/react/input"
import { Tabs, TabsList, TabsPanel, TabsTab } from "@ui-sdk/react/tabs"

function Example() {
  return (
    <Tabs defaultValue="preview" activation="manual">
      <TabsList aria-label="Snippet">
        <TabsTab value="preview">Preview</TabsTab>
        <TabsTab value="code">Code</TabsTab>
      </TabsList>
      <TabsPanel value="preview">
        Welcome back, Hollis. You have 3 unread messages.
      </TabsPanel>
      <TabsPanel value="code">
        <Field>
          <FieldLabel>Source</FieldLabel>
          <Input defaultValue='<Welcome name="Hollis" unread={3} />' />
        </Field>
      </TabsPanel>
    </Tabs>
  )
}

export { Example }
