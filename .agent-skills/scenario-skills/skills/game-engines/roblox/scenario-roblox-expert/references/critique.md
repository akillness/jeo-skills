# Critique rubric (scenario-roblox-expert)

Judge an agent's Roblox work, or a sibling's handoff, with this list. Each failed line names its
fix. A **blocker** stops delivery; a **major** must be fixed or stated under Assumed; a **minor**
goes under open issues.

## 1. Safety and scope (blockers)

- Ran code only in a place the agent opened; never in the user's window, never in another agent's
  place.
- Opened its place once; closed no window; signaled no Studio process.
- Published nothing, uploaded nothing, spent no Robux, without the user's explicit go.
- Did not script the GUI to change Studio settings (MCP toggle, Beta Features, Game Settings).
- Stopped every playtest it started (`get_studio_state` reads Edit at the end).

## 2. Evidence (blockers unless stated)

- Every claim of "works" has a structured result: `rbx_run` `ok` true, `Spec` `failed == 0` with
  `total > 0`, or `Audit` `tally.error == 0`.
- At least one test went red before it went green.
- Visual work has captures from fixed camera positions, `image_checks` `ok` true, and a contact
  sheet the agent opened.
- A before and after pair shows `compare` `changed_fraction > 0` for a visible change (major).
- Performance claims cite `Stats.frames` p95 and worst against a stated budget, on the Server and
  the Client (major). Studio memory is never the evidence.

## 3. Code (majors)

- `rbx_check` passes with zero errors on every changed file, with a sourcemap when the project uses
  Rojo.
- No `api:` warning from `Audit` that the deltas mark deprecated (traps.md section 1), or each one
  is justified.
- Remotes carry intent only; the server validates type, range, rate and ownership (route to
  scenario-roblox-networking when unsure).
- Heavy chunks yield in batches of about 1,000 items; chunks are idempotent.
- Code lives in files (Rojo or Script Sync) or the handoff says it exists only in the unsaved
  session.

## 4. Honesty (majors)

- GUI-only steps are named with their GUI path and done by a human, or replaced by a programmatic
  substitute that was run.
- Verified and Assumed are separate lists; nothing not run is reported as run.
- Numbers come from a run or a cited source; none are invented.
- Feel, taste and fun are listed for a human playtest; the agent does not claim them.

## 5. Handoff packet (majors)

- Place path, window name, channel, and the brief in numbers.
- Toolkit calls in order, evidence paths, Verified, Assumed, open issues, and the fence.
- The receiver reproduced one piece of evidence before building on it.

## 6. Scoring

- Ship: no blocker, no open major.
- Fix and recheck: any major.
- Stop and ask the user: any blocker in section 1.
