# Design System Modes

Use this file before answering so `design-system` stays a shared-system skill rather than a page mock or component-API dump.

## 1. Foundations mode
Choose this when the team needs shared token and policy decisions:
- color / semantic token naming
- typography scale
- spacing, radius, elevation, density, and motion rules
- breakpoint policy that multiple products or surfaces should inherit

Good output: a concise foundations section inside the final Design System Packet.

## 2. Cross-surface alignment mode
Choose this when multiple surfaces must feel coherent without becoming identical:
- marketing site + app shell
- dashboard + settings + form flows
- public product pages + logged-in workspace

Good output: shared rules plus surface-specific differences.

## 3. Primitive governance mode
Choose this when the real question is policy around shared primitives:
- what should become a primitive
- naming rules for shared primitives
- when to promote product-local UI into the system
- ownership/review process for system changes

Route actual prop/slot/variant API design to `ui-component-patterns`.

## 4. System handoff mode
Choose this when the system direction is mostly settled and the job is to leave a clean packet for design/dev execution.

Good output: the Design System Packet with scope, foundations, primitive policy, surface guidance, accessibility baseline, and route-outs.

## 5. System review mode
Choose this when inconsistency is suspected but the owning skill is unclear.

Questions to ask:
- is the problem really shared-system governance?
- is it actually a component-API issue?
- is it a responsive-layout issue?
- is it an accessibility remediation issue?
- is it a broad UI/UX audit problem?

If most answers point elsewhere, route out early.
