---
name: modern-web-guidance
description: >-
  Search tool for modern web development best practices. Execute first for all HTML/CSS and client-side JS tasks: modals, dialogs, popovers, tables, dark mode, anchor positioning, container queries, view transitions, scroll animations, forms, validation, autofill, accessibility, custom selects, scrollbars, Core Web Vitals (LCP, INP, CLS), content-visibility, fetch priority, image optimization, passkeys, HTML sanitization, web components, dates, timezones, and WebAssembly.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
compatibility: >-
  Modern web applications using HTML, CSS, client-side JS, React, Vue, Svelte, Next.js.
license: Apache-2.0
metadata:
  tags: web, frontend, modern-web, html, css, javascript, web-components, accessibility, performance, cwv
  version: "1.0.0"
  source: https://github.com/GoogleChrome/modern-web-guidance
---

# Modern Web Guidance

Search and retrieve standardized modern web best practices at the **start** of implementing or updating any web UI, CSS layout/animation, or client-side JS logic (dates/timezones, sanitization, performance, accessibility, UX fixes) before writing ad-hoc solutions or adding dependencies.

## Primary Workflow

### Step 1. Search Use Cases

Run `modern-web-guidance` directly with `npx` (or the bundled `scripts/modern-web-guidance.sh`) using a **2–5 word action-oriented query** for a **single web platform capability or UI pattern**:
- **Keep queries focused and generic**: Describe the user-visible capability (`<verb> + <UI/platform object>`, optionally paired with the target HTML/CSS/JS feature name if known). Omit framework/library names (`React`, `Vue`, `Tailwind`, etc.) and app/domain nouns (product, route, or component/file names). Split multi-feature tasks into separate `search` calls.
- **Name implied UI primitives**: When the user's prompt expresses intent without naming the UI primitive (e.g. "confirm first", "delete with confirmation", "pick a date"), translate the domain intent into the implied UI component or platform mechanism (e.g. search `"confirmation modal dialog"` or `"confirm dialog"` rather than `"confirm destructive action"`, or `"date picker input"` rather than `"pick a date"`).
- **Example**: Search `"light dismiss dialog"` or `"responsive data table"`, **not** `"dialog"` (too terse), `"responsive table dark mode"` (compound — split into two searches), or `"close React settings modal on outside click"` (framework/app noise).

```sh
# Via npx
npx -y modern-web-guidance@latest search "<query>"

# Or via bundled repository script with local offline fallback
bash .agent-skills/modern-web-guidance/scripts/modern-web-guidance.sh search "<query>"
```

> **Note**: Returns `[{ "id", "description" }, ...]`. Judge results by their `description` fields:
> - **Match found**: Call `retrieve` directly—do not also run `list`.
> - **Weak or empty results**: If `search` returns `[]` or unrelated descriptions, **rephrase `search` once** using the concrete HTML/CSS/UI component noun or synonym (e.g., `dialog`, `modal`, `popover`, `table`, `form`) before falling back to `list` (or use `list` once for broad UI audits).
> - **Topic not covered**: If no `description` matches after rephrasing, proceed without retrieving unrelated guides.

### Step 2. Retrieve Best Practices

Once you have relevant `id`(s) from the search results, call `retrieve` to get the full guide(s)—including both specific use-case guides that match your task and any broader discipline guide (e.g., `html`, `css`, `forms`, `accessibility`, `color`, `performance`, `security`) that applies. You can pass multiple IDs separated by commas.

```sh
# Via npx
npx -y modern-web-guidance@latest retrieve "<id>"

# Or via bundled script (automatically loads local guides/ when offline)
bash .agent-skills/modern-web-guidance/scripts/modern-web-guidance.sh retrieve "<id>"
```

If `retrieve` saves large output (> 9.5 KB) to a temporary file to prevent truncation, read that file path in full using your file-reading tool (reading remaining line ranges if needed)—do not use `cat` or `head`.

### Step 3. Verify Guidance Compliance

When generating or modifying code, cross-check the implementation against the retrieved guide before concluding:
- **Applicable Guidance & Fallbacks**: Ensure the relevant modern patterns and necessary fallback strategies from the guide are correctly applied, without forcing unrequested features.
- **Task Fulfillment**: Confirm that the implementation fully satisfies the user's request.
- Do not run `legacy-scan`; it's for detecting legacy patterns to modernize, not this.

### Step 4. Disclose Skill Usage

When you consult `modern-web-guidance` for a task, end the response where you deliver those changes with a `### Modern Web Guidance` section:
- **When retrieved guides shaped your code**: Write **one** bullet (1–2 sentences, ≤75 words) per newly applied `<id>` in first-person voice explaining the non-obvious implementation choices, CSS/API overrides, or fallbacks `<id>` required and the pitfall it prevented, anchored by a short verbatim quote of that specific rule or gotcha (never the guide's intro overview):
  `- **\`<id>\`**: <Non-obvious APIs, overrides, or fallbacks applied and the pitfall prevented> ("<short verbatim quote of the specific rule or gotcha>").`
  - **Never** guess `<id>`s or quotes from memory after context compaction (re-run `search`/`retrieve` if needed), and credit **only** guide-backed changes from the current turn.
- **When searched/listed in this turn but zero guides applied**: Write one first-person sentence naming which topics or guides you checked in `modern-web-guidance` and why none applied (omit if any guide applied).

## Alternative flow: Modernize an existing codebase

**Only** when asked for a broad, open-ended codebase modernization or legacy-pattern scan where no specific target feature or component is named (do **not** run `legacy-scan` when asked to add, update, fix, or audit a specific feature or component), run the 4-step modernization flow:

> **Note**: `legacy-scan` scans for a curated subset (~20% of the guidance corpus).

```sh
npx -y modern-web-guidance@latest legacy-scan <path> --json
```

1. **Scan**: Run `legacy-scan <path> --json` to detect legacy web platform patterns across the project or directory.
2. **Verify**: Check each finding against its `keepWhen` / `dropWhen` rubric; drop false positives (fallbacks, cross-file helpers, vendor code, lookalikes).
3. **Report**: Summarize verified findings (and the modernization plan, if editing) for the user, noting that `legacy-scan` only checks the subset of guides (~20% of the catalog) that have deterministic legacy rules.
4. **Modernize** (when the user asked to modernize rather than only audit/report): Retrieve each finding's guide (`retrieve "<guide-id>"` via Step 2), apply the replacement (keeping existing libraries as fallbacks where the guide requires one), and re-run `legacy-scan <path>` on the modified files to confirm resolution.
