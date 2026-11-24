import {
  Tabs,
  TabsList,
  TabsPanel,
  TabsTab,
  TabsTabIcon,
} from "@ui-sdk/solid/tabs"

function Example() {
  return (
    <Tabs defaultValue="inbox">
      <TabsList aria-label="Mail">
        <TabsTab value="inbox">
          <TabsTabIcon>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7" />
              <rect x="2" y="4" width="20" height="16" rx="2" />
            </svg>
          </TabsTabIcon>
          Inbox
        </TabsTab>
        <TabsTab value="replies">
          <TabsTabIcon mirror>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
              <path d="m9 17-5-5 5-5" />
            </svg>
          </TabsTabIcon>
          Replies
        </TabsTab>
        <TabsTab value="archive">
          <TabsTabIcon>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <rect width="20" height="5" x="2" y="3" rx="1" />
              <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
              <path d="M10 12h4" />
            </svg>
          </TabsTabIcon>
          Archive
        </TabsTab>
      </TabsList>
      <TabsPanel value="inbox">
        3 new messages from Inès Moreau and Kofi Mensah.
      </TabsPanel>
      <TabsPanel value="replies">
        Wren Takahashi replied to your message about the launch.
      </TabsPanel>
      <TabsPanel value="archive">
        Messages you archived stay here and in search.
      </TabsPanel>
    </Tabs>
  )
}

export { Example }
