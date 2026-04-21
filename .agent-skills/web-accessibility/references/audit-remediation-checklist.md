# Accessibility Audit → Remediation Checklist

Use this when the user asks for an accessibility audit, remediation plan, or post-scan manual verification checklist.

## 1. Frame the surface
- Page / flow / component:
- Critical user task:
- Buckets involved: structure, keyboard/focus, name/role/value, content/feedback, visual perception, media

## 2. Automated pass
Capture issues from tools such as axe, Lighthouse, Pa11y, or Accessibility Insights.

Typical automated-friendly findings:
- missing labels or accessible names
- duplicate IDs
- invalid ARIA usage
- contrast issues on simple cases
- missing landmark / heading / form relationships

## 3. Manual verification
Always check what automated tools cannot fully prove:
- tab order is logical
- focus indicator stays visible
- overlays move focus in and return it correctly
- Escape / Enter / Space / arrow-key behavior matches the widget type
- error messages are understandable and announced
- screen-reader output is useful, not just technically present
- zoom/reflow and reduced-motion behavior still work for the task

## 4. Fix order
1. Blockers: keyboard trap, inaccessible primary controls, broken form submission paths
2. Meaning: missing labels, unclear instructions, bad announcements, poor error text
3. Robustness: semantic cleanup, ARIA simplification, consistency across widgets
4. Visual follow-up: contrast, motion, visible states, zoom/reflow edge cases

## 5. Route-outs
- broader UI/polish audit → `web-design-guidelines`
- reusable primitive API work → `ui-component-patterns`
- system-level token/pattern ownership → `design-system`
- viewport/layout adaptation → `responsive-design`

## 6. Packet template
```markdown
## Findings
1. ...

## Recommended fixes
- ...

## Verification
- Automated:
- Manual keyboard:
- Manual screen-reader / AT:

## Route-outs
- ...
```
