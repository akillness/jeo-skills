# Standup Intake Packets and Route-outs

Use this reference when the user has a standup-shaped complaint but the best answer depends on **which daily coordination packet is actually needed**.

## Quick chooser

| Cadence / mode | Smallest useful packet | Best when | Watch out for |
|---|---|---|---|
| `less-frequent-sync` | current board/doc + top risks + next checkpoint + escalation rule | a recurring checkpoint still helps, but daily is overkill | turning "lighter cadence" into vague drift with no real owner |
| `no-recurring-standup` | source-of-truth artifact + blocker channel + response expectation + cadence review trigger | daily ritual is unjustified and blockers should escalate ad hoc | hiding risk behind weak boards or no escalation rule |
| `board-walk` | board link + blocked/in-progress/review items + sprint or delivery goal | the board is trusted and work movement should drive the sync | stale boards, reading every ticket aloud |
| `blocker-first` | blocked items + owners + missing input + next decision point | the team is under delivery pressure or dependency drag | solving the blocker in the room |
| `async-check-in` | written updates + blocker prompt + escalation rule + response window | timezone spread or maker-time protection dominates | hidden urgency and silent blockers |
| `hybrid-async-plus-live` | written updates + exceptions list + short live escalation slot | written visibility helps but some live coordination is still needed | re-reading written updates in the meeting |
| `classic-three-questions` | yesterday/today/blockers prompts + tight timebox | a small team still gets real signal from a lightweight round-robin | status theater and repetitive diary entries |

## Packet details

### 0. `less-frequent-sync`
**Collect:**
- current board or status doc
- top two or three risks since the last checkpoint
- next checkpoint date / owner
- escalation rule for blockers that cannot wait

**Good brief shape:**
- keep the recurring checkpoint intentional and light
- preserve an immediate unblock path between checkpoints
- say when the team should temporarily raise cadence again

### 0b. `no-recurring-standup`
**Collect:**
- board/doc/tool that now replaces the ritual
- blocker channel or escalation path
- response expectation
- condition that would justify temporary daily cadence again

**Good brief shape:**
- remove the recurring meeting explicitly instead of letting it fade ambiguously
- keep blockers out of the ritual by escalating them when they happen
- set a review trigger so the team can raise cadence again if risk changes

### 1. `board-walk`
**Collect:**
- board or ticket view
- blocked / aging / in-progress / ready-for-review items
- today’s delivery or sprint goal
- obvious review or dependency waits

**Good brief shape:**
- start at blocked or aging work
- ask what moves next and who owns the next move
- note which items need a follow-up huddle after the sync

### 2. `blocker-first`
**Collect:**
- blocked items
- owner
- missing input / external dependency
- urgency and next checkpoint

**Good brief shape:**
- blockers first
- each blocker gets triage only: owner, unblock path, follow-up group
- normal updates stay short after the blocker sweep

### 3. `async-check-in`
**Collect:**
- update prompt
- post window / expected response time
- escalation trigger for anything that cannot wait
- source of truth for handoffs or review queues

**Good prompt family:**
- What moved?
- What is stuck?
- What needs help today?

### 4. `hybrid-async-plus-live`
**Collect:**
- written update prompt
- short live escalation slot
- criteria for what must move from thread/doc into live discussion
- owner for after-meeting follow-up

**Good brief shape:**
- written updates are the base layer
- live call only handles blockers, handoffs, and sprint-goal risk
- anything else stays async

### 5. `classic-three-questions`
Use only when the team is small, colocated or tightly connected, and the answers remain concise.

**Collect:**
- yesterday / today / blockers prompts
- timebox
- explicit reminder that this is for peer coordination, not manager reporting

## Route-outs

Use these boundaries aggressively.

### Route to `task-planning` when
- the team keeps discovering work that is not ready
- the real problem is scope slicing, acceptance criteria, backlog cleanup, or sprint prep
- the standup request is covering for poor task definition

### Route to `task-estimation` when
- people are arguing about size, confidence, or capacity
- the request drifts into “how much fits this sprint?” or “how big is this really?”
- uncertainty is causing daily churn because the work was never sized honestly

### Route to `sprint-retrospective` when
- the same standup pain repeats for multiple cycles
- stale action items, meeting drift, or low participation are now process-level problems
- the team needs durable habit change rather than another morning reset

### Route away from the PM cluster entirely when
- the team is in outage / incident command mode
- launch-day or release-war-room coordination dominates
- the request is really people-performance reporting or executive visibility rather than peer coordination

## Anti-pattern checks
- **Status theater:** people report upward instead of coordinating laterally
- **Board blindness:** nobody trusts the source of truth, so the meeting becomes guesswork
- **Deep-dive hijacking:** one blocker consumes the whole sync
- **Mode inertia:** the team keeps a format that no longer fits its shape or risk level
- **Async without escalation:** written updates exist, but nobody knows when to pull a live huddle
