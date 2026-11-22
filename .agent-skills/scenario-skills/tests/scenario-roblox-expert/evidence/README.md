# Roblox Studio Expert Skills: live evidence

What the [Roblox Studio expert skills](../../../skills/game-engines/roblox/README.md) did when they
ran in Roblox Studio 0.743 on macOS (Apple Silicon), on 2026-10-18 and 2026-10-19. Every place was
local and never published. The screenshots and videos are the skills' own test runs: Luau executed
through Studio's built-in MCP server, playtests with simulated keys and walking, and captures the
tests checked. The one-page PDFs summarize each skill.

Contents: [videos](#videos), [screenshots per skill](#screenshots-per-skill),
[one-page summaries](#one-page-summaries), [blind test](#blind-test), [not run](#not-run).

## How the tests ran

- Each skill has a live suite and an offline suite, run by its own driver in the build project.
- Live: `execute_luau` in the Edit, Server and Client data models, `start_stop_play` playtests,
  `user_keyboard_input` and `character_navigation` for input, `screen_capture` for the captures.
- Offline: `luau` and Lune with both Luau type solvers, Rojo builds, Selene and StyLua, Python
  units.
- A guard kept at most 4 place windows open and waited above 85 % GPU or 75 % RAM.
- A step passed only on parsed numbers or a capture that was looked at, never on tool text alone.

## Videos

Screen recordings of the Studio viewport while a skill's procedure runs. Each GIF links to its MP4.

### Agent-driven playtest (`scenario-roblox-expert`)

[![Agent-driven playtest](videos/scenario-roblox-expert-agent-playtest.gif)](videos/scenario-roblox-expert-agent-playtest.mp4)

In a playtest started over the Studio MCP server, the avatar walks by character_navigation to four
pads, and each pad lights up when the avatar steps on it. 13 s, recorded 2026-10-19 04:52.

### NPC crowd chase (`scenario-roblox-gameplay`)

[![NPC crowd chase](videos/scenario-roblox-gameplay-npc-chase.gif)](videos/scenario-roblox-gameplay-npc-chase.mp4)

48 NPCs from the gameplay kit spawn in a ring around the avatar, detect it and close in; the agent
walks the avatar out by character_navigation and the crowd follows and surrounds it again. 12 s,
recorded 2026-10-19 05:01.

### Lighting moods flythrough (`scenario-roblox-environment`)

[![Lighting moods flythrough](videos/scenario-roblox-environment-lighting-moods.gif)](videos/scenario-roblox-environment-lighting-moods.mp4)

An Edit-mode camera flies from the spawn path over the graybox village and terrain bowl while the
Looks kit switches the lighting from neutral to day, sunset and outdoor night. 15 s, recorded
2026-10-19 05:06.

### Effect library in action (`scenario-roblox-vfx-audio`)

[![Effect library in action](videos/scenario-roblox-vfx-audio-effects.gif)](videos/scenario-roblox-vfx-audio-effects.mp4)

Effects built from data by the vfx-audio kit play in Studio on a dark stage: an explosion, two sword
slashes, a fireball with its trail crossing the frame and exploding on impact, then three chained
blasts. 10 s, recorded 2026-10-19 05:10.

## Screenshots per skill

### Technical Direction (`scenario-roblox-expert`)

Drives Roblox Studio without a mouse through its built-in MCP server, passes each step only on
parsed results, frame budgets and captures, and routes each domain to its specialist. Tests: 36 live
in Studio 0.743; offline suite passes, both Luau type solvers clean.

![L12d](screenshots/expert-1.jpg)

_L12d: the same fixed Edit camera before and after an agent edit through the Studio MCP server; the
compare check sees 4.4% of pixels change._

![L22](screenshots/expert-2.jpg)

_L22: capture from the playtest client after the agent starts play over MCP; passes the image checks
(no blank or frozen frame), server and client at 60 fps._

### Code Architecture (`scenario-roblox-architecture`)

Lays out Roblox game code so each script runs once on the right side, boots in two phases, and every
connection is cleaned up, proven in live playtests. Tests: 14 live in Studio 0.743; 8 offline checks
pass.

![L6](screenshots/architecture-1.jpg)

_L6: the round HUD on the client reads Round 0:16, mirrored from the server's round attributes, with
one tag-bound sword for the player's team._

![L11](screenshots/architecture-2.jpg)

_L11: the round map cloned from ServerStorage for the round; 3 loads and 3 unloads, 0 maps left in
Workspace in the Lobby, server p95 frame 17.3 ms._

### Luau Engineering (`scenario-roblox-luau`)

Writes and reviews Luau that stays correct under Deferred events, type-checks on both solvers, frees
what it creates, and keeps an optimization only when measured. Tests: 17 live in Studio 0.743;
offline suite passes, both type solvers clean.

![play-mode run](screenshots/luau-1.jpg)

_Playtest client view of the Luau test place, captured after the play-mode tests (deferred signals,
leak retention, parallel Luau); 17 of 17 live tests pass._

### Networking and Security (`scenario-roblox-networking`)

Treats every client call as attacker input: the server owns state, checks each remote in a fixed
order, and proves it by firing hostile arguments from a playtest client. Tests: 24 live, 1 skipped
in Studio 0.743; 8 offline checks pass.

![CAP1, CAP2](screenshots/networking-1.jpg)

_CAP1 and CAP2: the exploit test arena in Edit and from the playtest client; in it the server
rejects far melee, fake-origin shots and teleports (24 live tests pass)._

### Player Data (`scenario-roblox-data`)

Builds a player data layer that survives crashes, failed writes and server hops: session-locked
profiles, safe migrations, one grant per purchase, proven against a simulated multi-server backend.
Tests: 26 live in Studio 0.743; 70 Lune tests pass.

No screenshot: this skill's proof is numeric. Key numbers measured or cited:

- **Server read or write budget**: 60 + 40 x players per minute
- **Experience budget per minute**: read 300 + 40 x CCU, write 300 + 20 x CCU
- **Value size per key**: 4,194,304 characters; key, name and scope 50
- **ProfileStore autosave, lock steal, assume dead**: 300 s, 40 s, 630 s
- **Naive retries, 30% of writes landing**: 39 stored for 30 operations (mock run)
- **Versions kept per key**: one per UTC hour, for 30 days after overwrite

### Tooling and build pipeline (`scenario-roblox-tooling`)

Sets up a Roblox team repository that rebuilds every place from files, gates every pull request with
types, lint and tests, and publishes only through CI. Tests: 14 live, 27 offline in Studio 0.743; 27
offline checks pass.

No screenshot: this skill's proof is numeric. Key numbers measured or cited:

- **Pinned toolchain, all installed and run**: Rojo 7.7.1, Wally 0.3.2, Lune 0.11.0, luau-lsp
  1.70.1, Selene 0.32.0
- **Local gate on the template**: 1.9 s: old solver 1.2 s, new solver 0.7 s
- **Engine tests in Edit**: 0.07 s for 5 tests in Studio 0.743
- **Luau Execution unfinished tasks per place**: 10; the 11th create gets HTTP 429
- **Luau Execution rate per key owner**: 5 creates, 200 gets, 45 log reads per minute
- **Unused Open Cloud API key**: expires after 60 days, even without an expiry date

### Environment and lighting (`scenario-roblox-environment`)

Builds and lights Roblox maps from code: graybox, terrain, materials, foliage and moods, each
checked by probes, voxel reads, image metrics and captures from fixed cameras. Tests: 17 live in
Studio 0.743; 9 offline checks pass, 26 Lune tests.

![L14](screenshots/environment-1.jpg)

_L14: the village from three fixed cameras before (top) and after (bottom) the foliage scatter;
1,174 trees, bushes and rocks placed in 71 cells, none off the ground._

![L7](screenshots/environment-2.jpg)

_L7: the spawn camera in four looks (neutral, day, sunset, outdoor night); sun aimed within 0.27
degrees, at most 3.1% crushed pixels, even at night._

![L9](screenshots/environment-3.jpg)

_L9: one room four ways: neutral, sun patch through a glass window, the patch gone once the glass
casts shadows, and fake bounce light lifting the room (mean luma 0.17 to 0.61)._

![L15](screenshots/environment-4.jpg)

_L15: collision debug view off (top) and on (bottom): an invisible blocker is found and boxed, and
the Hull door shows its opening filled; overlay cleared after._

### VFX and audio (`scenario-roblox-vfx-audio`)

Builds layered Roblox effects that the server decides and each client draws, and wires Audio API
graphs proven connected and measured, leaving only the listening to a person. Tests: 17 live in
Studio 0.743; 5 offline checks pass.

![L2](screenshots/vfx-audio-1.jpg)

_L2: the Boom effect frozen at 50, 150, 350, 700, 1,200 and 1,600 ms: flash, burst, fire, smoke,
then empty by 1.2 s; a re-captured frozen frame matches exactly._

![L15](screenshots/vfx-audio-2.jpg)

_L15: the copy-ready Camera post effect off and on in a playtest; BlurEffect size 16 under this
client's Camera only, none on the server or under Lighting._

![L4](screenshots/vfx-audio-3.jpg)

_L4: a Beam bent into a semicircle arc from its two attachments (apex 10 studs), with Stretch
texture length tested at 1 and 4._

### UI and input (`scenario-roblox-ui`)

Builds one Roblox UI tree with StyleSheets and Input Action System contexts, then proves it on nine
device presets with layout numbers, real clicks and keys. Tests: 16 live in Studio 0.743; 3 offline
checks pass.

![L2](screenshots/ui-1.jpg)

_L2: HUD and shop on the iPhone 14 preset, landscape and portrait, through the device simulator; one
of 9 presets, 18 layout checks, 0 problems._

![L5](screenshots/ui-2.jpg)

_L5: gamepad navigation in the shop: Select, arrows and Return move the focus frame from item 1 to
item 9 and the grid scrolls to the selection._

![L9](screenshots/ui-3.jpg)

_L9: settings panel in German (left) and pseudo-localized at +40% length (right) on the iPhone 7
preset; 12 checks, 0 clipped labels._

### Animation and Characters (`scenario-roblox-animation`)

Builds, layers and plays Roblox character, NPC and creature animation in code, then proves each
clip, IK chain and face by measured joints on server and client. Tests: 23 live in Studio 0.743;
offline O1 to O5 pass.

![L5](screenshots/animation-1.jpg)

_L5: Edit preview of a KeyframeSequence stepped with StepAnimations, arm raised 0 to 90 degrees in
five poses; 0 blank captures and the rig back at rest after reset._

![L12](screenshots/animation-2.jpg)

_L12: a Blender animation sampled onto a 10-bone part rig and played as a KeyframeSequence at t 0,
0.25, 0.5 and 0.75; bone tails within 0.0002 studs of the Blender pose._

![L9](screenshots/animation-3.jpg)

_L9: IKControl set on the server reaches the red target in a playtest and replicates to the client;
hand gap 0.22 studs, no chain problems._

### Gameplay Systems (`scenario-roblox-gameplay`)

Builds NPC AI, melee and projectile combat and constraint cars for Roblox, with the server deciding
every hit, rules tested in Lune and server cost measured in a playtest. Tests: 23 live in Studio
0.743; 20 Lune tests and 3 audit specs pass.

![A1](screenshots/gameplay-1.jpg)

_A1: 100 R15 NPCs patrolling on one scheduler; server holds 60 fps (p95 17.7 ms) with AI at 0.22 ms
per frame._

![A5](screenshots/gameplay-2.jpg)

_A5: the NPC's path around the wall (22 waypoints) and its query box drawn as debug adornments,
visible on the client._

![A4](screenshots/gameplay-3.jpg)

_A4: the hunting NPC detects the player, paths around the wall and lands 6 of 6 melee hits; reached
the player behind the wall after 4.6 s._

![B4](screenshots/gameplay-4.jpg)

_B4: constraint car driven with W for 3 s through the MCP keyboard; 177.8 studs straight, top speed
51 studs/s, chassis level (up 0.997)._

### Asset pipeline and UGC (`scenario-roblox-assets`)

Turns AI-generated or Blender meshes into Roblox assets at true stud size, facing -Z, under budget
and watertight, then previews, audits and validates them locally without uploading. Tests: 12 live
in Studio 0.743; 12 offline checks pass.

![L3, L4](screenshots/assets-1.jpg)

_L3 and L4 inputs: two image-to-3D GLBs as imported (top: chest facing backwards, hat tipped over)
and after Blender prep (bottom); hat 15,575 to 3,686 triangles, watertight._

![L5](screenshots/assets-2.jpg)

_L5: fit render from the measured wear test on an R15 head; crown opening 1.24 x 1.28 studs over a
1.16-stud head, attachment error 0, gap -0.296 stud._

![L12](screenshots/assets-3.jpg)

_L12: the hat attached on the server, seen from the client before the mesh fill (placeholder cube,
left) and after ApplyMesh (right); attachment error 0 on 10 samples._

![L12](screenshots/assets-4.jpg)

_L12: playtest client view with the client-built chest and the prepared hat seated on the avatar's
HatAttachment; attachment error 0, gap -0.295 stud._

### Performance and Release (`scenario-roblox-performance`)

Finds what makes a Roblox game slow, leaky or crash-prone, proves each fix with before and after
numbers against low-end phone budgets, and prepares safe releases. Tests: 25 live, 4 skipped in
Studio 0.743; 12 Lune tests pass.

![V0, V7, C8](screenshots/performance-1.jpg)

_V0 and V7: the lab before and after all fixes (2,000 coins, 1,200-cell HUD cut to 60); server
script 12.1 to 0.35 ms per frame, both sides back to 60 fps._

### Monetization and Live Ops (`scenario-roblox-monetization`)

Builds Roblox shops, receipts, passes, odds disclosures, analytics and live config so every purchase
grants exactly once after a save and every live change is decided by data. Tests: 16 live in Studio
0.743; 8 offline checks pass.

![L10, L11](screenshots/monetization-1.jpg)

_L10 and L11: the Mystery Egg odds shown before purchase (left); a player under the paid-random
policy gets a direct-price item and no egg (right)._

![L14](screenshots/monetization-2.jpg)

_L14: store art check on a game pass image: clean corners pass (left); detail in a corner is flagged
because the store crops it to a circle (right)._

## One-page summaries

[Overview (3 pages)](docs/overview.pdf):

[![Overview page 1](docs/previews/overview-1.jpg)](docs/overview.pdf)
[![Overview page 2](docs/previews/overview-2.jpg)](docs/overview.pdf)
[![Overview page 3](docs/previews/overview-3.jpg)](docs/overview.pdf)

One page per skill, each linking to its PDF:

[![Technical Direction](docs/previews/scenario-roblox-expert.jpg)](docs/scenario-roblox-expert.pdf)
[![Code Architecture](docs/previews/scenario-roblox-architecture.jpg)](docs/scenario-roblox-architecture.pdf)
[![Luau Engineering](docs/previews/scenario-roblox-luau.jpg)](docs/scenario-roblox-luau.pdf)
[![Networking and Security](docs/previews/scenario-roblox-networking.jpg)](docs/scenario-roblox-networking.pdf)
[![Player Data](docs/previews/scenario-roblox-data.jpg)](docs/scenario-roblox-data.pdf)
[![Tooling and build pipeline](docs/previews/scenario-roblox-tooling.jpg)](docs/scenario-roblox-tooling.pdf)
[![Environment and lighting](docs/previews/scenario-roblox-environment.jpg)](docs/scenario-roblox-environment.pdf)
[![VFX and audio](docs/previews/scenario-roblox-vfx-audio.jpg)](docs/scenario-roblox-vfx-audio.pdf)
[![UI and input](docs/previews/scenario-roblox-ui.jpg)](docs/scenario-roblox-ui.pdf)
[![Animation and Characters](docs/previews/scenario-roblox-animation.jpg)](docs/scenario-roblox-animation.pdf)
[![Gameplay Systems](docs/previews/scenario-roblox-gameplay.jpg)](docs/scenario-roblox-gameplay.pdf)
[![Asset pipeline and UGC](docs/previews/scenario-roblox-assets.jpg)](docs/scenario-roblox-assets.pdf)
[![Performance and Release](docs/previews/scenario-roblox-performance.jpg)](docs/scenario-roblox-performance.pdf)
[![Monetization and Live Ops](docs/previews/scenario-roblox-monetization.jpg)](docs/scenario-roblox-monetization.pdf)

## Blind test

Twelve briefs were answered by two fresh agents, one without skills and one with them, then graded
blind (order shuffled) against the expert notes on five 3-point criteria. Both wrote plans without
driving Studio.

| Brief                         | Without skills | With skills    |
| ----------------------------- | -------------- | -------------- |
| G1 Code architecture          | 10/15          | 15/15          |
| G2 Networking and security    | 11/15          | 15/15          |
| G3 Data                       | 9/15           | 15/15          |
| G4 Building and environment   | 8/15           | 15/15          |
| G5 Lighting, VFX and audio    | 9/15           | 14/15          |
| G6 UI                         | 9/15           | 14/15          |
| G7 Animation and characters   | 8/15           | 14/15          |
| G8 Gameplay systems           | 9/15           | 15/15          |
| G9 UGC and asset pipeline     | 7/15           | 14/15          |
| G10 Tooling and automation    | 9/15           | 14/15          |
| G11 Performance               | 10/15          | 15/15          |
| G12 Monetization and live ops | 9/15           | 14/15          |
| Total                         | 108/180 (60 %) | 174/180 (97 %) |

Graded answers are written plans; the skills behind them ran live in Studio first. One grader per
scenario: a direction, not a statistic. G1 and G8 were regraded once after fixes (13 to 15 each);
G10 was graded four times and scored 14 each time; the rest had one pass.

## Not run

Publishing, Open Cloud calls against a live experience, Marketplace and UGC uploads (avatar items
went up to Roblox's validation only), real purchases, ads, analytics and configs on a published
experience, live DataStores (the data layer ran against a simulated multi-server backend),
multi-client tests (each MCP playtest is one client), Team Create, phones, consoles and VR, and
Windows.
