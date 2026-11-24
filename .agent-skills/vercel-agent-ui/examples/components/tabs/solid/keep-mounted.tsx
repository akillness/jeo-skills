import { Field, FieldLabel } from "@ui-sdk/solid/field"
import { Textarea } from "@ui-sdk/solid/textarea"
import {
  Tabs,
  TabsIndicator,
  TabsList,
  TabsPanel,
  TabsTab,
} from "@ui-sdk/solid/tabs"

function Example() {
  return (
    <Tabs defaultValue="reply">
      <TabsList aria-label="Comment">
        <TabsTab value="reply">Reply</TabsTab>
        <TabsTab value="formatting">Formatting</TabsTab>
        <TabsIndicator />
      </TabsList>
      <TabsPanel value="reply" keepMounted>
        <Field>
          <FieldLabel>Message</FieldLabel>
          <Textarea rows={3} placeholder="Write a reply…" />
        </Field>
      </TabsPanel>
      <TabsPanel value="formatting">
        <p>Use **bold**, _italics_ and `code` to format your reply.</p>
        <p>Paste a link on its own line to show a preview.</p>
      </TabsPanel>
    </Tabs>
  )
}

export { Example }
