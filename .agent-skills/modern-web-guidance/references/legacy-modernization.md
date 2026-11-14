# Legacy Modernization Rubric

## 4-Step Modernization Flow

Run this flow **only** when conducting a general, open-ended codebase audit or modernization sweep:

1. **Scan**: Run `legacy-scan <path> --json` to detect candidate legacy patterns.
2. **Verify**: Apply the `keepWhen` / `dropWhen` rubric:
   - **Drop**: Existing polyfills or fallbacks supporting older browser matrix.
   - **Drop**: Vendor or node_modules code accidentally matched.
   - **Keep**: User-authored code using obsolete APIs when a native platform equivalent exists in baseline.
3. **Report**: Summarize findings clearly by category, citing the relevant guide ID.
4. **Modernize**: Replace with the recommended modern platform solution, retaining necessary fallbacks.

## Common Replacements

| Legacy Pattern | Modern Platform Replacement | Guide ID |
|---|---|---|
| JS-calculated popovers / popper.js | CSS Anchor Positioning / Popover API | `css/anchor-positioning` |
| Custom `<div>` modal with overlay | Native HTML `<dialog>` element | `ui-components/modal-dialog` |
| JavaScript scroll animations | CSS Scroll-Driven Animations (`animation-timeline`) | `css/scroll-driven-animations` |
| Heavy moment.js / date-fns | JavaScript `Temporal` API / `Intl.DateTimeFormat` | `js/temporal-dates` |
| Manual DOM sanitization regex | Native `Sanitizer` API | `security/html-sanitization` |
| JS-based element resizing observers | CSS Container Queries (`@container`) | `css/container-queries` |
