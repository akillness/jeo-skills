import {
  Tabs,
  TabsIndicator,
  TabsList,
  TabsPanel,
  TabsTab,
} from "@ui-sdk/solid/tabs"

function Example() {
  return (
    <Tabs defaultValue="overview">
      <TabsList aria-label="Project">
        <TabsTab value="overview">Overview</TabsTab>
        <TabsTab value="activity">Activity</TabsTab>
        <TabsTab value="settings">Settings</TabsTab>
        <TabsIndicator />
      </TabsList>
      <div data-slot="stack">
        <TabsPanel value="overview">
          The launch is on track for Friday, with 4 of 6 tasks done.
        </TabsPanel>
        <TabsPanel value="activity">
          Inès Moreau deployed to production and Kofi Mensah left a review.
        </TabsPanel>
        <TabsPanel value="settings">
          Rename the project, transfer it to another team or archive it.
        </TabsPanel>
      </div>
    </Tabs>
  )
}

export { Example }
