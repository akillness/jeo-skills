# Fabric routing and mode selection

Use this guide to keep `fabric` narrow and useful.

## Choose Fabric when
- the job is a **repeatable named prompt transform** over text the user already has,
- stdin/files/clipboard/transcripts/logs/articles are the main input shape,
- the user wants a reusable pattern or custom pattern pack,
- shell composition is part of the workflow.

## Do not choose Fabric when
- the user just wants a one-off answer from the current model,
- the job is repo-aware coding or implementation,
- the hard part is still scraping, OCR, transcript recovery, or file conversion,
- the workflow needs deterministic batching/app logic more than prompt transforms.

## Mode chooser

| Mode | Use when | Output |
|------|----------|--------|
| `quick-transform` | text is already available and one transform is enough | exact command + pattern |
| `pattern-selection` | user needs the right built-in pattern | top 1-3 pattern choices + why |
| `custom-pattern` | workflow repeats or needs stable output | `system.md` scaffold + invocation |
| `shell-pipeline` | Fabric is one step in a terminal chain | staged pipeline packet |
| `serve-api` | another app/script should call Fabric over HTTP | server/auth/endpoint packet |
| `migration-review` | deciding among Fabric, a general LLM CLI, or a coding assistant | boundary comparison |

## Nearby tool boundaries
- **Fabric** = reusable prompt/pattern operations over external text/content.
- **General LLM CLI** = ad hoc prompting with lighter pattern expectations.
- **Coding assistant** = repo-aware implementation, code edits, and git workflows.
- **Workflow automation / scripts** = deterministic multi-step logic that may call Fabric as one step.

## Friction checklist
Call these out early when they apply:
- provider/vendor config is not ready,
- input text is still noisy or unavailable,
- the chosen pattern is too broad or too specialized,
- the output still needs human review or post-editing,
- a custom pattern is more appropriate than another stock-pattern search.
