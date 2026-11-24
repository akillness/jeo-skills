import * as React from "react"
import { checkPattern } from "@ui-sdk/core/testing"
import { Tabs, TabsList, TabsPanel, TabsTab } from "./tabs"

function Example() {
  const root = React.useRef<HTMLDivElement>(null)
  const [named, setNamed] = React.useState(true)
  const [result, setResult] = React.useState<{
    ok: boolean
    text: string
  } | null>(null)

  async function check() {
    setResult(null)
    try {
      await checkPattern(root.current!, "tabs")
      setResult({
        ok: true,
        text: "Passes: roles, states, names, one tab stop, the arrows, Home and End.",
      })
    } catch (error) {
      setResult({ ok: false, text: (error as Error).message })
    }
  }

  return (
    <div data-slot="check">
      <div data-slot="controls">
        <button type="button" data-variant="solid" onClick={check}>
          Check the Tabs Pattern
        </button>
        <label data-slot="label">
          <input
            type="checkbox"
            checked={!named}
            onChange={(event) => {
              setNamed(!event.target.checked)
              setResult(null)
            }}
          />
          Leave the tab list unnamed
        </label>
      </div>
      <Tabs ref={root} defaultValue="overview">
        <TabsList aria-label={named ? "Project" : undefined}>
          <TabsTab value="overview">Overview</TabsTab>
          <TabsTab value="activity">Activity</TabsTab>
          <TabsTab value="files">Files</TabsTab>
        </TabsList>
        <TabsPanel value="overview">
          The project plan and upcoming milestones.
        </TabsPanel>
        <TabsPanel value="activity">
          Recent updates from the project team.
        </TabsPanel>
        <TabsPanel value="files">
          Briefs, mockups and other project files.
        </TabsPanel>
      </Tabs>
      {result && (
        <p
          role="status"
          data-slot="check-result"
          data-status={result.ok ? "pass" : "fail"}
        >
          {result.text}
        </p>
      )}
    </div>
  )
}

export { Example }
