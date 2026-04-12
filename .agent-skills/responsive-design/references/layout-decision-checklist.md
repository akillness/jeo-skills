# Layout Decision Checklist for `responsive-design`

Use this checklist before adding more breakpoints or local overrides.

## 1. Problem surface
- Is this mainly a viewport layout problem, a container-driven component problem, a media-sizing problem, or a verification problem?
- Which screen sizes, zoom levels, or parent-container widths expose the failure?

## 2. Intrinsic layout first
- Can flexible widths, wrapping, `minmax()`, auto-fit grid, or sensible `max-width` solve the issue before conditional rules?
- Is the layout depending on placeholder-short content instead of real content lengths?

## 3. Viewport vs container ownership
- Does the entire page/region change with viewport size?
- Or does the component simply need to adapt to the width of its parent slot?
- If the latter, should a container query be used instead of more viewport breakpoints?

## 4. High-risk responsive surfaces
- Navigation: wrapping, menu triggers, label lengths
- Forms/toolbars: stacking, action placement, helper/error text
- Tables/data views: stack, summarize, scroll, or preserve tabular layout intentionally?
- Media: aspect ratio, `srcset`, `sizes`, crop strategy

## 5. Verification
- What happens at narrow widths and common breakpoints?
- What happens at high zoom / reflow-equivalent conditions?
- Are overflow, clipping, truncation, and two-dimensional scrolling acceptable or accidental?
- Should any follow-up be routed to `web-accessibility`?
