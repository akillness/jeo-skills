"use client"

import { createTabsController } from "@ui-sdk/core/tabs"
import {
  Tabs,
  TabsIndicator,
  TabsList,
  TabsPanel,
  TabsTab,
} from "@ui-sdk/react/tabs"
import * as React from "react"
import { useLog } from "../../../shared/react/log"

function Example() {
  const log = useLog()
  const [tabs] = React.useState(() => createTabsController())
  const [value, setValue] = React.useState<string | null>("inbox")

  return (
    <div>
      <div data-slot="controls">
        <button type="button" onClick={() => tabs.select("sent")}>
          Show Sent Mail
        </button>
      </div>
      <Tabs
        value={value}
        onValueChange={(next, details) => {
          setValue(next)
          log(`value: ${next} (${details.reason})`)
        }}
        controller={tabs}
      >
        <TabsList aria-label="Mail">
          <TabsTab value="inbox">Inbox</TabsTab>
          <TabsTab value="drafts">Drafts</TabsTab>
          <TabsTab value="sent">Sent</TabsTab>
          <TabsIndicator />
        </TabsList>
        <TabsPanel value="inbox">
          3 unread messages from Hollis Grant and Inès Moreau.
        </TabsPanel>
        <TabsPanel value="drafts">
          2 drafts, the last one edited yesterday at 4:12 PM.
        </TabsPanel>
        <TabsPanel value="sent">
          12 messages sent this week, all delivered.
        </TabsPanel>
      </Tabs>
    </div>
  )
}

export { Example }
