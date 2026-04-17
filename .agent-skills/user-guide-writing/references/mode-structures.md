# User Guide Writing Mode Structures

Use these as default section skeletons after `user-guide-writing` chooses the primary mode.

## Getting-started guide
```markdown
# Get Started with <Product / Feature>

## Who this is for
## What you will accomplish
## Prerequisites
## Step 1: <first action>
## Step 2: <next action>
## Step 3: <first success state>
## Common mistakes
## Next steps
## Where to get help
```

## Tutorial
```markdown
# Tutorial: <Outcome>

## What you will learn
## Time and prerequisites
## Before you start
## Step 1
## Step 2
## Step 3
## Check your result
## Why it matters
## Related guides / next steps
```

## How-to guide
```markdown
# How to <Task>

## Before you begin
## Step 1
## Step 2
## Step 3
## Verify success
## Troubleshooting
## Related tasks
```

## FAQ
```markdown
# Frequently Asked Questions

## <Category>
### <Question>
Short answer
Longer answer if needed
Link to the deeper guide if one exists
```

## Release-help update / refresh packet
```markdown
# <Feature / Workflow> help update

## What changed
## Who is affected
## Updated steps or UI callouts
## Screenshot refreshes needed
## Related guides to patch
## Assumptions to verify
```

## Output-shape reminders
- Prefer a **single-page** artifact when the user only needs one guide.
- Use **guide plus FAQ** when the same blockers recur but the main task is still one page.
- Use a **refresh packet** when existing docs are stale after a release and the task is primarily patching, not rewriting.
- Use a **guide set** only when one page cannot honestly serve the onboarding, task, and follow-up jobs without becoming a blob.
