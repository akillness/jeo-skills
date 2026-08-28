# Higgsfield game flow and approval gates

## State model

Treat a Higgsfield game as moving through explicit states:

1. `unresolved-owner`
2. `audited-owner`
3. `proposal-only`
4. `local-scaffold`
5. `local-verified`
6. `publicly-deployed`
7. `marketplace-published`

A later state never proves that earlier design, security, or test work was correct. Record the
evidence for every transition.

## Gate A: upstream and environment

Required evidence:

- upstream repository and audited commit;
- chosen current skill owner and exact command family;
- local CLI path/version or a declared missing prerequisite;
- account status without tokens or raw identity payloads;
- runtime and Git prerequisites required by the checked-in flow.

No installation or authentication is implied by an audit request.

## Gate B: game proposal

Freeze before create:

- concept and supported genre category;
- memorable DNS-safe subdomain plus collision fallback;
- player range and input methods;
- rules, turn or realtime flow, completion condition, and reconnect expectations;
- hidden information and per-player view requirements;
- authority and trust assumptions;
- asset manifest and provenance;
- paid generation jobs and credit ceiling;
- public deploy approval;
- separate marketplace publication approval.

A proposal can be reviewed without account access or project creation.

## Gate C: creation and scaffold ownership

Use only the command documented by the audited live owner. At commit
`fb18134b4aabe99c4bf7ff01c8f4883400efc80d`, the game lane is reached through:

```text
higgsfield website create --type game --category <genre> --subdomain <name>
```

The generated `app/AGENTS.md` becomes the local implementation contract. Read it before
editing. At the audited pin, the game logic boundary is described through six pure functions:

- `meta`
- `setup`
- `validateAction`
- `applyAction`
- `isGameOver`
- `viewFor`

Do not assume those names survive future upstream changes. Re-read the scaffold.

## Gate D: assets and paid jobs

For each asset, record:

- game role and runtime owner;
- output type and acceptance criteria;
- dimensions, topology, duration, loop, or compression constraints where relevant;
- source reference and user rights;
- generation model/job selected from the current catalog;
- expected credit boundary and approval;
- final provenance and license notes.

A batch may be efficient, but it can multiply paid failures. Validate one representative job
when model or format behavior is uncertain. Do not treat generated media as proof of rights.

## Gate E: local verification

Use the scaffold's documented commands. Cover:

- initial state and legal actions;
- malformed and unauthorized actions;
- deterministic rule transitions where promised;
- game completion and duplicate finish handling;
- hidden information in every player view;
- reconnect or repeated action behavior relevant to the flow;
- type/build/lint checks required by the current scaffold;
- multiplayer room behavior where applicable.

A visually working browser tab does not prove hostile-input validation or hidden-state
filtering.

## Gate F: deploy

Public deploy requires:

- explicit approval for the exact project and target;
- local verification evidence;
- current account and subdomain status;
- metadata and cover requirements from the checked-in flow;
- a post-action read-back of the live URL and status.

The deploy target is public. Do not represent it as a private preview unless current platform
evidence says so.

## Gate G: marketplace publication

Marketplace publication is separate from public deployment. Confirm:

- the exact deployed game;
- title, description, cover, tags, and public representation;
- publication approval;
- resulting listing state after the action.

A user asking to build, test, or deploy has not necessarily approved community publication.
