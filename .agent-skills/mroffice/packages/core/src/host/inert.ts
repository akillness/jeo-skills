/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// The stand-ins for what the editors import from parts of MR Note that are
// not open source (its workspace, accounts, collaboration and AI). Each one
// does nothing, quietly: a function returns the empty value of what it would
// return, a component renders nothing, a hook hands back an object whose every
// member is itself inert.
//
// These features are provided by the MR Office desktop app's installer (free:
// the full service), https://github.com/XinaTian/MROffice/releases. A control the person uses that needs one says so
// (host/desktop-app.ts noteDesktopFeature).

export class HostFeatureUnavailableError extends Error {
  readonly code = "host_feature_unavailable";
  constructor(readonly feature: string) {
    super(`${feature} is not available in the open-source editors`);
    this.name = "HostFeatureUnavailableError";
  }
}

type ReturnKind =
  | "unknown"
  | "promise"
  | "promise-void"
  | "boolean"
  | "void"
  | "string"
  | "number"
  | "array"
  | "null"
  | "undefined"
  | "unsubscribe";

const trace = (() => {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("mrnote-editors:trace-inert") === "1";
  } catch {
    return false;
  }
})();

function note(label: string) {
  if (trace) console.debug("[inert]", label);
}

function emptyOf(kind: ReturnKind, label: string): unknown {
  switch (kind) {
    case "promise":
      return Promise.reject(new HostFeatureUnavailableError(label));
    case "promise-void":
      return Promise.resolve();
    case "boolean":
      return false;
    case "string":
      return "";
    case "number":
      return 0;
    case "array":
      return [];
    case "null":
      return null;
    case "unsubscribe":
      return () => {};
    default:
      return undefined;
  }
}

const inertValues = new Map<string, any>();

/** An object every property of which is inert: reading one gives another
 * inert value (the same one each time, so a hook's result is stable from
 * render to render), calling one returns undefined. */
export function inertValue(label: string): any {
  let value = inertValues.get(label);
  if (!value) {
    value = makeInertValue(label);
    inertValues.set(label, value);
  }
  return value;
}

function makeInertValue(label: string): any {
  const target = function inert() {
    note(label);
    return undefined;
  };
  return new Proxy(target, {
    get(_target, key) {
      if (key === Symbol.toPrimitive) return () => "";
      if (key === Symbol.iterator) return function* empty() {};
      if (key === "then" || key === "$$typeof" || key === "toJSON") return undefined;
      if (key === "length") return 0;
      if (key === "toString" || key === "valueOf") return () => "";
      return inertValue(`${label}.${String(key)}`);
    },
    apply() {
      note(label);
      return undefined;
    },
    has() {
      return false;
    },
  });
}

export function inertFunction(label: string, returns: ReturnKind = "unknown"): (...args: unknown[]) => any {
  return function inertFn() {
    note(label);
    return emptyOf(returns, label);
  };
}

const FLAG_MEMBER = /^(is|has|can|should|was|did|will|needs|show|allow)[A-Z]|(Owned|Enabled|Active|Open|Visible|Ready|Pending|Busy|Loading|Available|Allowed)$|^(runOwned|stayLocal|following|loading|pending|active|enabled|visible|open|ready|busy|dirty|available|supported|known|writable|connected|online)$/;
/** A live collaboration object (a room's Yjs awareness): absent without MR
 * Note's rooms, so an editor's `?? null` sees none and nobody else online. */
const ABSENT_MEMBER = /[aA]wareness$/;
const ACTION_MEMBER = /^(on[A-Z]|set[A-Z]|open[A-Z]?|close|start|stop|toggle|refresh|reload|request|dispatch|register|unregister|subscribe|clear|reset|apply|update|run|save|cancel|dismiss|hide|focus|track|notify|emit|send|load|fetch|retry)/;

/** What a stand-in hook returns: flags read false, actions do nothing, a
 * room's awareness is null, and anything else is inert. One object per hook, so its identity is stable. */
function inertHookResult(label: string): any {
  const members = new Map<string, unknown>();
  return new Proxy(
    {},
    {
      get(_target, key) {
        if (typeof key === "symbol") return key === Symbol.iterator ? function* empty() {} : undefined;
        if (key === "then" || key === "toJSON" || key === "$$typeof") return undefined;
        if (!members.has(key)) {
          members.set(
            key,
            ABSENT_MEMBER.test(key) ? null : FLAG_MEMBER.test(key) ? false : ACTION_MEMBER.test(key) ? () => undefined : inertValue(`${label}().${key}`),
          );
        }
        return members.get(key);
      },
    },
  );
}

export function inertHook(label: string, returns: ReturnKind = "unknown"): (...args: unknown[]) => any {
  const shared = inertHookResult(label);
  return function useInert() {
    if (returns !== "unknown") return emptyOf(returns === "promise" ? "undefined" : returns, label);
    return shared;
  };
}

export function inertComponent(label: string): (props: unknown) => null {
  const component = function InertComponent() {
    note(label);
    return null;
  };
  Object.defineProperty(component, "displayName", { value: `Unavailable(${label.split("#").pop()})` });
  return component;
}

export function inertClass(label: string, isError = false): any {
  if (isError) {
    return class InertError extends Error {
      constructor(message?: string) {
        super(message ?? label);
      }
    };
  }
  return class Inert {
    constructor() {
      note(label);
      return inertValue(label);
    }
  };
}
