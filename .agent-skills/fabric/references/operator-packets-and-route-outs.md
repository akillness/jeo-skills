# Fabric operator packets and route-outs

Use this guide when the main `SKILL.md` has already selected Fabric but the response still needs a clean operator packet.

## Default packet skeleton

```text
# Fabric Workflow Packet

## Lane
- quick-transform | pattern-selection | custom-pattern | shell-pipeline | serve-api | boundary-review

## Input
- source: ...
- cleanup needed: ...
- assumptions: ...

## Recommended Fabric move
- pattern / custom pattern / server mode: ...
- why this fits: ...

## Command or artifact
- exact command(s) or `system.md` scaffold

## Output shape
- summary / extraction / rewrite / explanation / structured markdown / custom

## Friction
- provider setup / token limits / noisy input / post-editing / custom-pattern drift

## Route-outs
- next tool or workflow layer if Fabric is not the whole answer
```

## Route-out matrix
| If the real problem is... | Route to... |
|---|---|
| One-off chat prompting with no stable pattern need | current model / general LLM CLI |
| Repo-aware coding, implementation, or Git edits | coding-assistant skill |
| Scraping, OCR, transcript recovery, or conversion before text is usable | the relevant fetch/extraction/transcript tool |
| Deterministic multi-step automation around multiple commands | `workflow-automation` or a script |
| Generic provider/platform setup with no Fabric-specific workflow | relevant provider/platform skill |

## Lane-specific reminders
- **quick-transform**: one pattern, one command, one expected output shape.
- **pattern-selection**: top 1-3 patterns only; explain why each fits.
- **custom-pattern**: include `system.md` scaffold and when to fork vs reuse.
- **shell-pipeline**: state upstream input producer and downstream save/post-edit step.
- **serve-api**: mention address, auth, and whether the caller needs list/apply/CRUD endpoints.
- **boundary-review**: compare Fabric against adjacent tools by workflow shape, not by hype.
