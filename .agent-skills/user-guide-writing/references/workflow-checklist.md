# Workflow checklist for user-facing docs

Use this checklist before drafting or revising a guide.

## 1. Audience and task
- Who is the reader? End user, admin, manager, or mixed?
- What exact task are they trying to complete?
- Is this first-time onboarding or a repeat task?
- What would success look like from the user's point of view?

## 2. Preconditions
Collect the assumptions that most often break a guide:
- account role / permissions
- plan / edition limits
- required setup already completed
- browser / app / device constraints
- data or files the user needs beforehand

## 3. Source-of-truth inputs
Before drafting, gather the smallest credible evidence set:
- current UI labels and navigation
- working step order
- expected success state
- likely error or blocker states
- existing support replies / recurring questions
- release changes that made the old doc stale

## 4. Structural choice
Choose only one primary doc shape:
- getting started
- tutorial
- how-to
- FAQ
- release-help update

If the content needs more than one, split it into multiple pages.

## 5. Writing rules
- Put the user goal near the top.
- Keep steps observable and action-oriented.
- Mention warnings before the risky step.
- Prefer exact UI text when it reduces confusion.
- Use short paragraphs and bullets.
- Give the user a success check.

## 6. Screenshot discipline
Screenshots are useful when:
- the transition is visually confusing
- a menu or setting is easy to miss
- the user needs to confirm they are in the right place

Avoid screenshots when:
- the same point is obvious from the text
- the UI changes often and the image will rot quickly
- the image does not add new information

Track:
- screenshot needed
- screenshot to refresh
- screenshot intentionally omitted

## 7. Maintenance notes
Add or update:
- related guides that need syncing
- release/version note if the flow recently changed
- owner/reviewer if the doc is launch-critical
- assumptions still awaiting verification

## 8. Final ship check
- Can a new reader complete the task without private context?
- Are prerequisites and blockers visible early?
- Is the guide scoped to one main outcome?
- Are route-outs to adjacent docs types clear?
- Would support or success teams be comfortable linking this doc directly?
