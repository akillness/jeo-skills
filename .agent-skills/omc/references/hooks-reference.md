# OMC Hooks Reference

OMC uses Claude Code's hooks system to inject context and control execution flow.

---

## Hook Events

| Event | When | OMC Usage |
|-------|------|----------|
| `UserPromptSubmit` | Prompt submitted | Magic keyword detection, skill injection |
| `SessionStart` | Session begins | Setup, memory load, state restore |
| `PreToolUse` | Before tool use | Permission hints, parallel hints |
| `PostToolUse` | After tool use | Result validation, memory update |
| `PostToolUseFailure` | Tool failed | Error recovery, retry hints |
| `SubagentStart` | Agent starts | Agent tracking |
| `SubagentStop` | Agent stops | Output verification |
| `PreCompact` | Before context compaction | Preserve critical info, save memory |
| `Stop` | Claude stopping | Persistence enforcement, code simplification |
| `SessionEnd` | Session ends | Cleanup, state flush |

---

## Injection Patterns

Hooks inject `<system-reminder>` tags with context:

```
hook success: Success          → proceed normally
[MAGIC KEYWORD: ...]           → invoke the matched skill
The boulder never stops        → ralph/ultrawork mode active
```

### Memory Persistence
```
<remember>text</remember>           → 7-day persistence
<remember priority>text</remember>  → permanent persistence
```

### Kill Switches
```
DISABLE_OMC                    → disable all OMC hooks
OMC_SKIP_HOOKS=hook1,hook2     → skip specific hooks (comma-separated)
```

---

## Hook Registration

OMC registers hooks via `hooks.json` in the plugin directory. After installation:

```bash
# Verify hook registration
cat ~/.claude/settings.json | grep -A5 "hooks"

# Re-register via setup
/oh-my-claudecode:omc-setup
```

---

## Common Hook Behaviors

### UserPromptSubmit (Magic Keyword Detection)
- Scans incoming prompt for keywords: `autopilot`, `ralph`, `ulw`, `ccg`, etc.
- Injects skill invocation context if keyword matched
- Prevents duplicate skill activation

### Stop Hook (Persistence)
- Checks if ralph/ultrawork mode is active
- If active and task not verified complete: re-injects continuation signal
- "The boulder never stops" = ralph mode enforcement

### PreCompact Hook
- Saves current `.omc/notepad.md` state
- Extracts critical plan/task info to project memory
- Ensures continuity after context compression

### PostToolUse Hook
- Validates tool results against expected patterns
- Updates working memory with new findings
- Hints parallel execution opportunities

---

## Cancellation

```bash
cancelomc       # Magic keyword — cancel active execution mode
stopomc         # Alias for cancelomc

/oh-my-claudecode:cancel    # Slash command cancel
```

State is preserved on cancel for potential resume.
