# Game UI/UX interface contract

## Runtime inventory before design

A complete inventory includes:

- game phases and player roles;
- persistent HUD, contextual HUD, menus, overlays, modals, tutorials, notifications, and
  system prompts;
- loading, empty, error, offline, reconnect, spectator, pause, and destructive states;
- target devices, aspect/orientation families, safe areas, input methods, locales, UI scale,
  accessibility settings, and platform overlays;
- current runtime screenshots/video and the source of each UI state.

A concept image is evidence for only the visible state. It cannot remove information,
interactions, identity, animation, or data behavior that it omits.

## Player-decision map

For each UI element, record:

- player question or decision;
- urgency and consequence;
- when it appears and disappears;
- whether it persists, expands on demand, or stays hidden;
- competing signals and priority;
- source, owner, and stale/error behavior;
- redundant channel for critical information.

Challenge decorative and duplicated elements before optimizing them.

## Navigation state machine

Model screens and transitions explicitly:

- push, replace, overlay, modal, pop/back, resume, and disconnect;
- initial focus and focus restoration;
- directional, sequential, pointer, touch, and assistive navigation;
- activation, cancel/back, tab/section change, scrolling, and pagination;
- device-switch behavior;
- modal focus containment and escape;
- destructive confirmation and safe cancellation;
- what gameplay input remains active under each overlay.

Every focusable control must be reachable, visibly focused, operable, and escapable with its
declared input path. Changing layout, locale, or UI scale must not strand focus.

## Layout and content constraints

Define constraints rather than one canvas:

- aspect and orientation families;
- safe-area/overscan handling;
- persistent anchors and content containers;
- expandable text regions and reflow;
- scroll owner and clipped-content behavior;
- text/UI scale behavior;
- split-screen and platform overlay reservations;
- target-device evidence for readability and reach.

Do not turn one reference resolution, safe inset, text size, or touch size into a universal
constant. Use current platform guidance and measured target devices.

## Localization states

Cover:

- externalized strings;
- expansion and line-break policy;
- plural, gender, number, date, and currency formatting;
- bidirectional text and logical layout;
- font and glyph coverage;
- input-glyph substitution and mixed-device prompts;
- voice/subtitle synchronization where applicable;
- truncation, marquee, tooltip, and screen-reader alternatives.

Pseudo-localization exposes structure problems, but representative real strings and fonts are
still required.

## Data-binding boundary

For each bound element, define:

- authoritative source and permission;
- initial snapshot or loading state;
- update event or query;
- rapid-change, stale, offline, reconnect, and error behavior;
- formatting and localization owner;
- presentation-only state;
- hidden multiplayer information that must never reach an unauthorized client.

Prefer explicit events for state changes and an explicit initial snapshot. Do not poll every
frame without a measured requirement.

## Verification matrix

Each row records:

- exact build and screen/state;
- device or viewport/aspect/orientation;
- input method;
- locale and text/UI scale;
- accessibility settings;
- expected focus, layout, signal, and data behavior;
- observed evidence and result.

Include peak HUD load, modal conflict, loading/error/offline, destructive action, device
switch, rapid update, and representative localized content. Screenshots support layout claims;
video or event traces support navigation and dynamic-state claims.
