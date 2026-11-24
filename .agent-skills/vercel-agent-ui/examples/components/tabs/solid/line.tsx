import {
  Tabs,
  TabsIndicator,
  TabsList,
  TabsPanel,
  TabsTab,
} from "@ui-sdk/solid/tabs"

export function Example() {
  return (
    <Tabs defaultValue="overview">
      <TabsList aria-label="Dashboard">
        <TabsTab value="overview">Overview</TabsTab>
        <TabsTab value="analytics">Analytics</TabsTab>
        <TabsTab value="reports">Reports</TabsTab>
        <TabsIndicator />
      </TabsList>
      <TabsPanel value="overview">
        Revenue, visitors and sign-ups for the last 30 days.
      </TabsPanel>
      <TabsPanel value="analytics">
        Where visitors come from and what they do.
      </TabsPanel>
      <TabsPanel value="reports">Monthly reports, ready to download.</TabsPanel>
    </Tabs>
  )
}
