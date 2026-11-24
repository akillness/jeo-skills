/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/** The DevTools protocol, as the host page's debugger session gives it. */
export interface ProbeCdp {
  send(method: string, params?: Record<string, unknown>, sessionId?: string): Promise<any>;
  /** The page's own frame. */
  mainFrameId(): string;
  /** The debugger session a frame's document is in ("" for the page itself), null when the frame is gone. */
  sessionOf(frameId: string): string | null;
  /** A frame's parent frame, null for the page's own. */
  parentOf(frameId: string): string | null;
  /** The frame a session was attached for (an out-of-process frame), "" for the page itself. */
  frameOfSession(sessionId: string): string | null;
  /** A frame's main-world execution context, null while it has none. */
  mainWorld(frameId: string): number | null;
  /** Whether an execution context of a session still exists. */
  alive(sessionId: string, contextId: number): boolean;
}

const UTILITY_WORLD = "__mrai_probe_utility_world__";
/** shared-runtime-browser.mjs: DOM_FRAME, DOM_CONTROLS, DOM_MEDIA. */
export const DOM_FRAME = "iframe[data-mrai-dom-preflight]";
export const DOM_CONTROLS = 'button, [role="button"], a[href^="#"], input:not([type="hidden"])';
export const DOM_MEDIA = ["canvas", "svg", "img", "input", "textarea", "select", "video"].map((tag) => `${tag}:visible`).join(", ");
const MAX_HANDLES = 256;

/** Playwright's options for an injected script in a Chromium utility world (dom.js FrameExecutionContext.injectedScript). */
const INJECTED_OPTIONS = {
  isUnderTest: false,
  sdkLanguage: "javascript",
  testIdAttributeName: "data-testid",
  stableRafCount: 1,
  browserName: "chromium",
  isUtilityWorld: true,
  customEngines: [],
};

class ProbeTimeout extends Error {}
class NotConnected extends Error {
  constructor() {
    super("Element is not attached to the DOM");
  }
}

interface Handle {
  readonly frameId: string;
  readonly sessionId: string;
  /** The element in its frame's main world (where Playwright keeps a handle). */
  readonly objectId: string;
}

interface World {
  readonly sessionId: string;
  readonly contextId: number;
  readonly injected: string;
  /** The frame's main world when this one was made: a new document makes a new one. */
  readonly document: number | null;
}

type Point = { x: number; y: number };
type Quad = Point[];

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const nextTask = () => new Promise<void>((resolve) => setImmediate(resolve));

/** A deadline every awaited step races, as Playwright's Progress does. */
class Progress {
  private readonly expired: Promise<never>;
  private timer: NodeJS.Timeout | undefined;
  constructor(readonly deadline: number) {
    this.expired = new Promise<never>((_, reject) => {
      this.timer = setTimeout(() => reject(new ProbeTimeout(`Timeout exceeded`)), Math.max(0, deadline - Date.now()));
    });
    this.expired.catch(() => undefined);
  }
  race<T>(promise: Promise<T>): Promise<T> {
    return Promise.race([promise, this.expired]);
  }
  done(): void {
    clearTimeout(this.timer);
  }
}

function roundPoint(point: Point): Point {
  return { x: ((point.x * 100) | 0) / 100, y: ((point.y * 100) | 0) / 100 };
}

function quadMiddlePoint(quad: Quad): Point {
  const result = { x: 0, y: 0 };
  for (const point of quad) {
    result.x += point.x / 4;
    result.y += point.y / 4;
  }
  return result;
}

function computeQuadArea(quad: Quad): number {
  let area = 0;
  for (let i = 0; i < quad.length; ++i) {
    const p1 = quad[i];
    const p2 = quad[(i + 1) % quad.length];
    area += (p1.x * p2.y - p2.x * p1.y) / 2;
  }
  return Math.abs(area);
}

/** The DOM primitives of one host page, answered as the site's checker answers them. */
export class DomProbe {
  private handles: Handle[] = [];
  private readonly worlds = new Map<string, World>();
  private readonly mouse = { x: 0, y: 0, lastButton: "none", buttons: new Set<string>() };
  private calls = 0;
  private readonly injectedExpression: string;

  constructor(
    private readonly cdp: ProbeCdp,
    injectedSource: string,
    /** Receives the window's picture (JPEG) when a check takes one. */
    private readonly keepShot: (jpeg: Buffer) => void,
  ) {
    this.injectedExpression = `(() => {
const module = {};
${injectedSource}
return new (module.exports.InjectedScript())(globalThis, ${JSON.stringify(INJECTED_OPTIONS)});
})()`;
  }

  /** One request of dom-preflight.ts's driver (shared-runtime-browser.mjs's binding body). */
  async op(op: unknown, index: unknown): Promise<unknown> {
    const frameId = await this.widgetFrame();
    if (op === "visible") {
      const text = await this.innerText(frameId, "body", 1000).catch(() => "");
      if (text.trim()) return true;
      return (await this.queryCount(frameId, DOM_MEDIA)) > 0;
    }
    if (op === "shot") return this.shot();
    if (op === "controls") {
      const old = this.handles;
      this.handles = [];
      await Promise.all(old.map((handle) => this.release(handle.sessionId, handle.objectId)));
      this.handles = (await this.queryAll(frameId, DOM_CONTROLS)).slice(0, MAX_HANDLES);
      return this.handles.length;
    }
    const handle = Number.isInteger(index) ? this.handles[index as number] : undefined;
    if (!handle) return op === "inspect" ? { state: "gone", tag: "unknown" } : "gone";
    if (op === "inspect") {
      try {
        const tag = await this.evaluateMain<string>(handle, "function () { return this.localName; }");
        if (!(await this.isVisible(handle))) return { state: "hidden", tag };
        return { state: (await this.isEnabled(handle)) ? "ready" : "disabled", tag };
      } catch {
        return { state: "gone", tag: "unknown" };
      }
    }
    if (op === "click") {
      try {
        await this.click(handle, 1000);
        return "clicked";
      } catch {
        const attached = await this.evaluateMain<boolean>(handle, "function () { return this.isConnected; }").catch(() => false);
        return attached ? "unhittable" : "gone";
      }
    }
    throw new Error("dom-preflight-probe-op");
  }

  // --- worlds and handles --------------------------------------------------------------------------

  private callId(): string {
    this.calls += 1;
    return `call@${this.calls}`;
  }

  private async release(sessionId: string, objectId: string): Promise<void> {
    await this.cdp.send("Runtime.releaseObject", { objectId }, sessionId || undefined).catch(() => undefined);
  }

  /** The utility world of a frame with Playwright's injected script in it. */
  private async utility(frameId: string): Promise<World> {
    const sessionId = this.cdp.sessionOf(frameId);
    if (sessionId === null) throw new Error("Frame has been detached.");
    const known = this.worlds.get(frameId);
    const document = this.cdp.mainWorld(frameId);
    if (known && known.sessionId === sessionId && known.document === document && this.cdp.alive(sessionId, known.contextId)) return known;
    const { executionContextId } = await this.cdp.send(
      "Page.createIsolatedWorld",
      { frameId, grantUniveralAccess: true, worldName: UTILITY_WORLD },
      sessionId || undefined,
    );
    const created = await this.cdp.send(
      "Runtime.evaluate",
      { expression: this.injectedExpression, contextId: executionContextId, returnByValue: false },
      sessionId || undefined,
    );
    if (created.exceptionDetails || !created.result?.objectId) throw new Error(`injected script failed: ${String(created.exceptionDetails?.exception?.description ?? created.exceptionDetails?.text ?? "").slice(0, 300)}`);
    const world = { sessionId, contextId: executionContextId as number, injected: created.result.objectId as string, document };
    this.worlds.set(frameId, world);
    return world;
  }

  /** `function (injected, node, arg)` in a frame's utility world. */
  private async callUtility(
    world: World,
    declaration: string,
    node: string | null,
    arg: unknown,
    returnByValue = true,
  ): Promise<any> {
    const args: Array<Record<string, unknown>> = [{ objectId: world.injected }, node ? { objectId: node } : { value: null }];
    if (arg !== undefined) args.push({ value: arg });
    const answer = await this.cdp.send(
      "Runtime.callFunctionOn",
      { functionDeclaration: declaration, objectId: world.injected, arguments: args, awaitPromise: true, returnByValue },
      world.sessionId || undefined,
    );
    if (answer.exceptionDetails) {
      const error = new Error(String(answer.exceptionDetails.exception?.description ?? answer.exceptionDetails.text ?? "evaluation failed"));
      (error as Error & { javascript?: boolean }).javascript = true;
      throw error;
    }
    return returnByValue ? answer.result?.value : answer.result;
  }

  /** The node of `handle` in another execution context of its session (crPage _adoptElementHandle). */
  private async adopt(handle: Handle, contextId: number): Promise<string> {
    const session = handle.sessionId || undefined;
    const { node } = await this.cdp.send("DOM.describeNode", { objectId: handle.objectId }, session);
    const resolved = await this.cdp.send("DOM.resolveNode", { backendNodeId: node.backendNodeId, executionContextId: contextId }, session).catch(() => null);
    if (!resolved || resolved.object?.subtype === "null" || !resolved.object?.objectId) {
      throw new Error("Unable to adopt element handle from a different document");
    }
    return resolved.object.objectId;
  }

  /** A utility-world node made a main-world handle (frameSelectors.js adoptIfNeeded). */
  private async toMain(frameId: string, world: World, objectId: string): Promise<Handle> {
    const main = this.cdp.mainWorld(frameId);
    if (main === null) throw new Error("no main world");
    const transient: Handle = { frameId, sessionId: world.sessionId, objectId };
    const adopted = await this.adopt(transient, main);
    await this.release(world.sessionId, objectId);
    return { frameId, sessionId: world.sessionId, objectId: adopted };
  }

  /** ElementHandle.evaluateInUtility: any failure is "error:notconnected". */
  private async evaluateInUtility(handle: Handle, declaration: string, arg?: unknown, returnByValue = true): Promise<any> {
    try {
      const world = await this.utility(handle.frameId);
      const node = await this.adopt(handle, world.contextId);
      try {
        return await this.callUtility(world, declaration, node, arg, returnByValue);
      } finally {
        await this.release(world.sessionId, node);
      }
    } catch {
      return "error:notconnected";
    }
  }

  /** handle.evaluate(fn): the element's own main world, by value. */
  private async evaluateMain<T>(handle: Handle, declaration: string): Promise<T> {
    const answer = await this.cdp.send(
      "Runtime.callFunctionOn",
      { functionDeclaration: declaration, objectId: handle.objectId, awaitPromise: true, returnByValue: true },
      handle.sessionId || undefined,
    );
    if (answer.exceptionDetails) throw new Error("evaluation failed");
    return answer.result?.value as T;
  }

  // --- frames -------------------------------------------------------------------------------------

  /** page.$(DOM_FRAME) then contentFrame(): the window's frame. */
  private async widgetFrame(): Promise<string> {
    const main = this.cdp.mainFrameId();
    const world = await this.utility(main);
    const found = await this.callUtility(
      world,
      `function (injected, _node, selector) { return injected.querySelector(injected.parseSelector(selector), document, false) || null; }`,
      null,
      DOM_FRAME,
      false,
    );
    if (!found?.objectId) throw new Error("dom-preflight-frame-missing");
    try {
      const { node } = await this.cdp.send("DOM.describeNode", { objectId: found.objectId }, world.sessionId || undefined);
      const frameId = typeof node?.frameId === "string" ? node.frameId : null;
      if (!frameId || this.cdp.sessionOf(frameId) === null) throw new Error("dom-preflight-frame-missing");
      return frameId;
    } finally {
      await this.release(world.sessionId, found.objectId);
    }
  }

  /** crPage getFrameElement: the iframe element of a frame, in its parent's main world. */
  private async frameElement(frameId: string): Promise<Handle> {
    const parent = this.cdp.parentOf(frameId);
    const parentSession = parent === null ? null : this.cdp.sessionOf(parent);
    if (parent === null || parentSession === null) throw new Error("Frame has been detached.");
    const { backendNodeId } = await this.cdp.send("DOM.getFrameOwner", { frameId }, parentSession || undefined);
    const main = this.cdp.mainWorld(parent);
    if (main === null) throw new Error("Frame has been detached.");
    const resolved = await this.cdp.send("DOM.resolveNode", { backendNodeId, executionContextId: main }, parentSession || undefined);
    if (!resolved?.object?.objectId) throw new Error(`Unable to adopt element handle from a different document`);
    return { frameId: parent, sessionId: parentSession, objectId: resolved.object.objectId };
  }

  /** crPage _framePosition: where a session's own frame sits in the page. */
  private async framePosition(sessionId: string): Promise<Point | null> {
    const frameId = this.cdp.frameOfSession(sessionId);
    if (frameId === null) return null;
    if (frameId === "" || frameId === this.cdp.mainFrameId()) return { x: 0, y: 0 };
    const element = await this.frameElement(frameId);
    try {
      const box = await this.boundingBox(element);
      return box ? { x: box.x, y: box.y } : null;
    } finally {
      await this.release(element.sessionId, element.objectId);
    }
  }

  /** crPage getBoundingBox: the border box, in the page's coordinates. */
  private async boundingBox(handle: Handle): Promise<{ x: number; y: number; width: number; height: number } | null> {
    const result = await this.cdp.send("DOM.getBoxModel", { objectId: handle.objectId }, handle.sessionId || undefined).catch(() => null);
    if (!result) return null;
    const quad = result.model.border as number[];
    const x = Math.min(quad[0], quad[2], quad[4], quad[6]);
    const y = Math.min(quad[1], quad[3], quad[5], quad[7]);
    const width = Math.max(quad[0], quad[2], quad[4], quad[6]) - x;
    const height = Math.max(quad[1], quad[3], quad[5], quad[7]) - y;
    const position = await this.framePosition(handle.sessionId);
    if (!position) return null;
    return { x: x + position.x, y: y + position.y, width, height };
  }

  // --- locators -----------------------------------------------------------------------------------

  /** frames.js retryWithProgressAndTimeouts with _callOnElementOnceMatches's waits. */
  private async callOnceMatches<T>(
    frameId: string,
    selector: string,
    root: Handle | null,
    strict: boolean,
    body: string,
    timeoutMs: number | null,
    stopWhen?: () => boolean,
  ): Promise<T> {
    const waits = [0, 0, 20, 50, 100, 100, 500];
    const progress = new Progress(timeoutMs === null ? Date.now() + 30_000 : Date.now() + timeoutMs);
    const callId = this.callId();
    try {
      for (let attempt = 0; ; attempt += 1) {
        const wait = waits[Math.min(attempt, waits.length - 1)];
        if (wait) await progress.race(sleep(wait));
        if (stopWhen?.()) throw new Error("Execution context was destroyed");
        try {
          const world = await progress.race(this.utility(frameId));
          const node = root ? await progress.race(this.adopt(root, world.contextId)) : null;
          const answer = await progress.race(
            this.callUtility(
              world,
              `function (injected, root, data) {
                const callback = ${body};
                const element = injected.querySelector(injected.parseSelector(data.selector), root || document, data.strict);
                if (!element) return { success: false };
                injected.markTargetElements(new Set([element]), data.callId);
                return { success: true, value: callback(injected, element) };
              }`,
              node,
              { selector, strict, callId },
            ),
          );
          if (node) await this.release(world.sessionId, node);
          if (!answer?.success) continue;
          return answer.value as T;
        } catch (error) {
          if (error instanceof ProbeTimeout || (error as { javascript?: boolean }).javascript) throw error;
          if (this.cdp.sessionOf(frameId) === null) throw error;
          continue;
        }
      }
    } finally {
      progress.done();
    }
  }

  /** frame.locator(selector).innerText({ timeout }). */
  private innerText(frameId: string, selector: string, timeoutMs: number): Promise<string> {
    return this.callOnceMatches<string>(
      frameId,
      selector,
      null,
      true,
      `(injectedScript, element) => {
        if (element.namespaceURI !== "http://www.w3.org/1999/xhtml") throw injectedScript.createStacklessError("Node is not an HTMLElement");
        return element.innerText;
      }`,
      timeoutMs,
    );
  }

  /** frame.locator(selector).count(): never waits; any failure counts none. */
  private async queryCount(frameId: string, selector: string): Promise<number> {
    try {
      const world = await this.utility(frameId);
      return await this.callUtility(
        world,
        `function (injected, _node, selector) {
          const parsed = injected.parseSelector(selector);
          const elements = injected.querySelectorAll(parsed, document);
          injected.checkDeprecatedSelectorUsage(parsed, elements);
          return elements.length;
        }`,
        null,
        selector,
      );
    } catch (error) {
      if (this.cdp.sessionOf(frameId) === null) throw error;
      return 0;
    }
  }

  /** frame.locator(selector).elementHandles(): every match, in the frame's main world. */
  private async queryAll(frameId: string, selector: string): Promise<Handle[]> {
    const world = await this.utility(frameId);
    const array = await this.callUtility(
      world,
      `function (injected, _node, selector) {
        const parsed = injected.parseSelector(selector);
        const elements = injected.querySelectorAll(parsed, document);
        injected.checkDeprecatedSelectorUsage(parsed, elements);
        return elements;
      }`,
      null,
      selector,
      false,
    );
    if (!array?.objectId) return [];
    try {
      const { result } = await this.cdp.send(
        "Runtime.getProperties",
        { objectId: array.objectId, ownProperties: true },
        world.sessionId || undefined,
      );
      const nodes = (result as Array<{ name: string; enumerable: boolean; value?: { subtype?: string; objectId?: string } }>)
        .filter((property) => property.enumerable && property.value && /^\d+$/.test(property.name))
        .sort((a, b) => Number(a.name) - Number(b.name));
      const handles: Handle[] = [];
      for (const property of nodes) {
        if (property.value?.subtype === "node" && property.value.objectId) {
          handles.push(await this.toMain(frameId, world, property.value.objectId));
        } else if (property.value?.objectId) {
          await this.release(world.sessionId, property.value.objectId);
        }
      }
      return handles;
    } finally {
      await this.release(world.sessionId, array.objectId);
    }
  }

  // --- element states -----------------------------------------------------------------------------

  /** handle.isVisible(): frames.js isVisibleInternal(":scope"); a failure is "not visible". */
  private async isVisible(handle: Handle): Promise<boolean> {
    try {
      const world = await this.utility(handle.frameId);
      const node = await this.adopt(handle, world.contextId);
      try {
        return await this.callUtility(
          world,
          `function (injected, root) {
            const element = injected.querySelector(injected.parseSelector(":scope"), root || document, false);
            const state = element ? injected.elementState(element, "visible") : { matches: false, received: "error:notconnected" };
            return state.matches;
          }`,
          node,
          undefined,
        );
      } finally {
        await this.release(world.sessionId, node);
      }
    } catch (error) {
      if (this.cdp.sessionOf(handle.frameId) === null) throw error;
      return false;
    }
  }

  /** handle.isEnabled(): frames.js _elementState(":scope", "enabled"); a detached element throws. */
  private async isEnabled(handle: Handle): Promise<boolean> {
    const main = this.cdp.mainWorld(handle.frameId);
    const result = await this.callOnceMatches<{ matches: boolean; received?: unknown }>(
      handle.frameId,
      ":scope",
      handle,
      false,
      `(injected, element) => injected.elementState(element, "enabled")`,
      null,
      // _raceAgainstContextDestroyed: the handle's document is gone.
      () => main === null || !this.cdp.alive(handle.sessionId, main),
    );
    if (result.received === "error:notconnected") throw new NotConnected();
    return result.matches;
  }

  // --- the click ----------------------------------------------------------------------------------

  /** handle.click({ timeout }): dom.js click → _retryPointerAction("click", waitForEnabled). */
  private async click(handle: Handle, timeoutMs: number): Promise<void> {
    const progress = new Progress(Date.now() + timeoutMs);
    try {
      // _markAsTargetElement
      const callId = this.callId();
      await progress.race(
        this.evaluateInUtility(
          handle,
          `function (injected, node, callId) { if (node.nodeType === 1) injected.markTargetElements(new Set([node]), callId); }`,
          callId,
        ),
      );
      const result = await this.retryPointerAction(progress, handle);
      if (result === "error:notconnected") throw new NotConnected();
    } finally {
      progress.done();
    }
  }

  private async retryPointerAction(progress: Progress, handle: Handle): Promise<unknown> {
    const waitTime = [0, 20, 100, 100, 500];
    let retry = 0;
    for (;;) {
      if (retry) {
        const timeout = waitTime[Math.min(retry - 1, waitTime.length - 1)];
        if (timeout) {
          const waited = await progress.race(
            this.evaluateInUtility(handle, `function (injected, node, timeout) { return new Promise((f) => setTimeout(f, timeout)); }`, timeout),
          );
          if (waited === "error:notconnected") return waited;
        }
      }
      const scrollOptions = [undefined, { block: "end", inline: "end" }, { block: "center", inline: "center" }, { block: "start", inline: "start" }];
      const result = await this.performPointerAction(progress, handle, scrollOptions[retry % scrollOptions.length]);
      ++retry;
      if (result === "error:notvisible" || result === "error:notinviewport") continue;
      if (result && typeof result === "object" && ("hitTargetDescription" in result || "missingState" in result)) continue;
      return result;
    }
  }

  private async performPointerAction(progress: Progress, handle: Handle, forceScrollOptions: object | undefined): Promise<unknown> {
    const doScrollIntoView = async (): Promise<unknown> => {
      if (forceScrollOptions) {
        return this.evaluateInUtility(
          handle,
          `function (injected, node, options) { if (node.nodeType === 1) node.scrollIntoView(options); return "done"; }`,
          forceScrollOptions,
        );
      }
      return this.scrollRectIntoViewIfNeeded(handle);
    };
    if (this.cdp.parentOf(handle.frameId) !== null) await progress.race(doScrollIntoView().catch(() => undefined));
    const states = await progress.race(
      this.evaluateInUtility(
        handle,
        `function (injected, node, states) { return injected.checkElementStates(node, states); }`,
        ["visible", "enabled", "stable"],
      ),
    );
    if (states) return states;
    const scrolled = await progress.race(doScrollIntoView());
    if (scrolled !== "done") return scrolled;
    const maybePoint = await progress.race(this.clickablePoint(handle));
    if (typeof maybePoint === "string") return maybePoint;
    const point = roundPoint(maybePoint);
    const frameCheck = await progress.race(this.checkFrameIsHitTarget(handle.frameId, point));
    if (frameCheck === "error:notconnected" || "hitTargetDescription" in frameCheck) return frameCheck;
    const interceptor = await progress.race(
      this.evaluateInUtility(
        handle,
        `function (injected, node, data) { return injected.setupHitTargetInterceptor(node, data.actionType, data.hitPoint, data.trial); }`,
        { actionType: "mouse", hitPoint: frameCheck.framePoint, trial: false },
        false,
      ),
    );
    if (interceptor === "error:notconnected") return interceptor;
    if (!interceptor?.objectId) {
      const error = interceptor?.value;
      if (error === "error:notconnected") return error;
      return { hitTargetDescription: error };
    }
    const world = this.worlds.get(handle.frameId);
    const session = world?.sessionId ?? handle.sessionId;
    let stopped = false;
    const stop = () => {
      stopped = true;
      return this.cdp
        .send(
          "Runtime.callFunctionOn",
          { functionDeclaration: "function () { return this.stop(); }", objectId: interceptor.objectId, returnByValue: true },
          session || undefined,
        )
        .then((answer: any) => (answer.exceptionDetails ? "done" : answer.result?.value))
        .catch(() => "done");
    };
    try {
      await this.mouseClick(progress, point.x, point.y, handle.frameId);
      const hitTargetResult = await progress.race(stop());
      if (hitTargetResult !== "done") return hitTargetResult;
      // inputActionEpilogue; the page's own frame never navigates, so the
      // signal barrier has nothing to wait for but the next task.
      await progress.race(this.cdp.send("Page.enable", {}).catch(() => undefined));
      await progress.race(nextTask());
      return "done";
    } finally {
      if (!stopped) void stop();
      void this.release(session, interceptor.objectId);
    }
  }

  /** crPage _scrollRectIntoViewIfNeeded. */
  private async scrollRectIntoViewIfNeeded(handle: Handle): Promise<string> {
    try {
      await this.cdp.send("DOM.scrollIntoViewIfNeeded", { objectId: handle.objectId }, handle.sessionId || undefined);
      return "done";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("Node does not have a layout object")) return "error:notvisible";
      if (message.includes("Node is detached from document")) return "error:notconnected";
      throw error;
    }
  }

  /** dom.js _clickablePoint (Chromium: the middle of the first quad left inside the viewport). */
  private async clickablePoint(handle: Handle): Promise<Point | string> {
    const [quads, metrics] = await Promise.all([this.contentQuads(handle), this.viewport()]);
    if (!quads || !quads.length) return "error:notvisible";
    const filtered = quads
      .map((quad) => quad.map((point) => ({
        x: Math.min(Math.max(point.x, 0), metrics.width),
        y: Math.min(Math.max(point.y, 0), metrics.height),
      })))
      .filter((quad) => computeQuadArea(quad) > 0.99);
    if (!filtered.length) return "error:notinviewport";
    return quadMiddlePoint(filtered[0]);
  }

  private async contentQuads(handle: Handle): Promise<Quad[] | null> {
    const result = await this.cdp.send("DOM.getContentQuads", { objectId: handle.objectId }, handle.sessionId || undefined).catch(() => null);
    if (!result) return null;
    const position = await this.framePosition(handle.sessionId);
    if (!position) return null;
    return (result.quads as number[][]).map((quad) => [
      { x: quad[0] + position.x, y: quad[1] + position.y },
      { x: quad[2] + position.x, y: quad[3] + position.y },
      { x: quad[4] + position.x, y: quad[5] + position.y },
      { x: quad[6] + position.x, y: quad[7] + position.y },
    ]);
  }

  private async viewport(): Promise<{ width: number; height: number }> {
    const world = await this.utility(this.cdp.mainFrameId());
    return this.callUtility(world, "function () { return { width: innerWidth, height: innerHeight }; }", null, undefined);
  }

  /** dom.js _checkFrameIsHitTarget: every frame on the way receives the point. */
  private async checkFrameIsHitTarget(frameId: string, point: Point): Promise<{ framePoint: Point | undefined } | { hitTargetDescription: unknown } | "error:notconnected"> {
    const data: Array<{ frameElement: Handle | null; pointInFrame: Point }> = [];
    const owned: Handle[] = [];
    try {
      let frame = frameId;
      for (let parent = this.cdp.parentOf(frame); parent !== null; parent = this.cdp.parentOf(frame)) {
        let element: Handle;
        try {
          element = await this.frameElement(frame);
        } catch {
          return "error:notconnected";
        }
        owned.push(element);
        const box = await this.boundingBox(element);
        const style = await this.evaluateInUtility(element, `function (injected, iframe) { return injected.describeIFrameStyle(iframe); }`);
        if (!box || style === "error:notconnected") return "error:notconnected";
        if (style === "transformed") return { framePoint: undefined };
        data.push({ frameElement: element, pointInFrame: { x: point.x - box.x - style.left, y: point.y - box.y - style.top } });
        frame = parent;
      }
      data.push({ frameElement: null, pointInFrame: point });
      for (let i = data.length - 1; i > 0; i--) {
        const element = data[i - 1].frameElement!;
        const hit = await this.evaluateInUtility(
          element,
          `function (injected, element, hitPoint) { return injected.expectHitTarget(hitPoint, element); }`,
          data[i].pointInFrame,
        );
        if (hit !== "done") return hit;
      }
      return { framePoint: data[0].pointInFrame };
    } finally {
      for (const element of owned) void this.release(element.sessionId, element.objectId);
    }
  }

  /** input.js Mouse.click with crInput.js RawMouseImpl: move, press and release, the press after the move's frame (below). */
  private async mouseClick(progress: Progress, x: number, y: number, frameId?: string): Promise<void> {
    const mask = (buttons: Set<string>) =>
      (buttons.has("left") ? 1 : 0) | (buttons.has("right") ? 2 : 0) | (buttons.has("middle") ? 4 : 0);
    const mouse = this.mouse;
    mouse.x = x;
    mouse.y = y;
    const move = this.cdp.send("Input.dispatchMouseEvent", {
      type: "mouseMoved", button: mouse.lastButton, buttons: mask(mouse.buttons), x, y, modifiers: 0, force: mouse.buttons.size > 0 ? 0.5 : 0,
    });
    if (frameId) {
      // Where the press lands: in the site's headless browser the pointer's
      // :hover has taken effect by the time the press is hit-tested (a button
      // that moves away under :hover is never pressed there, 4 of 4); in this
      // hidden window the press came first and pressed it (4 of 4). So the
      // press waits for the moved pointer's frame in the window's own frame.
      await progress.race(move);
      const world = await progress.race(this.utility(frameId));
      await progress.race(this.callUtility(world, "function () { return new Promise((resolve) => requestAnimationFrame(() => resolve(true))); }", null, undefined));
    }
    mouse.lastButton = "left";
    mouse.buttons.add("left");
    const down = this.cdp.send("Input.dispatchMouseEvent", {
      type: "mousePressed", button: "left", buttons: mask(mouse.buttons), x, y, modifiers: 0, clickCount: 1, force: 0.5,
    });
    mouse.lastButton = "none";
    mouse.buttons.delete("left");
    const up = this.cdp.send("Input.dispatchMouseEvent", {
      type: "mouseReleased", button: "left", buttons: mask(mouse.buttons), x, y, modifiers: 0, clickCount: 1,
    });
    await progress.race(Promise.all([move, down, up]).then(() => undefined));
  }

  // --- the picture --------------------------------------------------------------------------------

  /** page.$(DOM_FRAME) then element.screenshot({ type: "jpeg", quality: 72, timeout: 4000 }). */
  private async shot(): Promise<boolean> {
    const main = this.cdp.mainFrameId();
    let element: Handle | null = null;
    try {
      const world = await this.utility(main);
      const found = await this.callUtility(
        world,
        `function (injected, _node, selector) { return injected.querySelector(injected.parseSelector(selector), document, false) || null; }`,
        null,
        DOM_FRAME,
        false,
      );
      if (!found?.objectId) return false;
      element = await this.toMain(main, world, found.objectId);
      const progress = new Progress(Date.now() + 4000);
      try {
        // _waitAndScrollIntoViewIfNeeded(waitForVisible)
        const waitTime = [0, 20, 100, 100, 500];
        for (let retry = 0; ; retry += 1) {
          if (retry) {
            const timeout = waitTime[Math.min(retry - 1, waitTime.length - 1)];
            if (timeout) await progress.race(sleep(timeout));
          }
          const states = await progress.race(
            this.evaluateInUtility(element, `function (injected, node, states) { return injected.checkElementStates(node, states); }`, ["visible", "stable"]),
          );
          const result = states ?? (await progress.race(this.scrollRectIntoViewIfNeeded(element)));
          if (result === "error:notconnected") return false;
          if (result === "done") break;
        }
        const box = await progress.race(this.boundingBox(element));
        if (!box || !box.width || !box.height) return false;
        const metrics = await progress.race(this.viewport());
        const scroll = await progress.race(
          this.utility(main).then((w) => this.callUtility(w, "function () { return { x: scrollX, y: scrollY }; }", null, undefined)),
        );
        const fits = box.x >= 0 && box.y >= 0 && box.x + box.width <= metrics.width && box.y + box.height <= metrics.height;
        const shot = await progress.race(
          this.cdp.send("Page.captureScreenshot", {
            format: "jpeg",
            quality: 72,
            clip: { x: box.x + scroll.x, y: box.y + scroll.y, width: box.width, height: box.height, scale: 1 },
            captureBeyondViewport: !fits,
          }),
        );
        this.keepShot(Buffer.from(shot.data, "base64"));
        return true;
      } finally {
        progress.done();
      }
    } catch {
      return false;
    } finally {
      if (element) void this.release(element.sessionId, element.objectId);
    }
  }
}
