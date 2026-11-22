import { afterEach, describe, expect, it, vi } from "vitest";
import {
  boot,
  loadRuntime,
  makeGame,
  STORE,
  restoreGlobals,
} from "./runtime-harness";

afterEach(() => {
  restoreGlobals();
  vi.restoreAllMocks();
});

function fakeMraid(state = "default", viewable = true) {
  const l: Record<string, ((v?: unknown) => void)[]> = {};
  return {
    l,
    open: vi.fn(),
    getState: () => state,
    isViewable: () => viewable,
    addEventListener(t: string, f: (v?: unknown) => void) {
      (l[t] ||= []).push(f);
    },
    fire(t: string, v?: unknown) {
      for (const f of l[t] || []) f(v);
    },
  };
}

// loads the runtime for one network with the store links set, without booting a game
async function net(
  network: string,
  win: Record<string, unknown> = {},
  ua?: string,
) {
  const env = await loadRuntime({ network, win, ua });
  env.PA.cfg = { store: STORE };
  return env;
}

const names = (env: any) => env.events().map((e: any) => e.name);

describe("store link", () => {
  it.each([
    ["Mozilla/5.0 (Linux; Android 14)", 5, STORE.android],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)", 5, STORE.ios],
    ["Mozilla/5.0 (iPad; CPU OS 18_0)", 5, STORE.ios],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X)", 5, STORE.ios], // iPadOS desktop mode
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X)", 1, STORE.android],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X)", 0, STORE.android],
  ])("%s with %i touch points", async (ua, touchPoints, want) => {
    const env = await loadRuntime({ ua, touchPoints });
    env.PA.cfg = { store: STORE };
    expect(env.PA.net.store()).toBe(want);
  });

  it("defaults to the web network", async () => {
    const env = await loadRuntime();
    expect(env.PA.net.name).toBe("web");
  });
});

describe("cta", () => {
  it("opens the store in a new tab on the web preview", async () => {
    const env = await net("web");
    env.PA.net.cta();
    expect(env.win.open).toHaveBeenCalledWith(STORE.android, "_blank");
    expect(env.events("cta")[0].data).toEqual({ network: "web" });
  });

  it.each([
    ["meta", "FbPlayableAd", "onCTAClick"],
    ["moloco", "FbPlayableAd", "onCTAClick"],
    ["google", "ExitApi", "exit"],
  ])("%s calls %s.%s and nothing else", async (network, obj, fn) => {
    const hook = { [fn]: vi.fn() };
    const env = await net(network, { [obj]: hook });
    env.PA.net.cta();
    expect(hook[fn]).toHaveBeenCalledTimes(1);
    expect(env.win.open).not.toHaveBeenCalled();
  });

  it.each([
    ["mintegral", "install"],
    ["pangle", "openAppStore"],
  ])("%s calls window.%s", async (network, fn) => {
    const hook = vi.fn();
    const env = await net(network, { [fn]: hook });
    env.PA.net.cta();
    expect(hook).toHaveBeenCalledTimes(1);
    expect(env.win.open).not.toHaveBeenCalled();
  });

  it.each(["meta", "google", "mintegral", "pangle"])(
    "%s falls back to the store link when its SDK is missing",
    async (network) => {
      const env = await net(network);
      env.PA.net.cta();
      expect(env.win.open).toHaveBeenCalledWith(STORE.android, "_blank");
    },
  );

  it("falls back to the store link when the SDK call throws", async () => {
    const env = await net("meta", {
      FbPlayableAd: {
        onCTAClick: () => {
          throw new Error("sdk");
        },
      },
    });
    env.PA.net.cta();
    expect(env.win.open).toHaveBeenCalledTimes(1);
  });

  it("liftoff posts download to its container frame", async () => {
    const parent = { postMessage: vi.fn() };
    const env = await net("liftoff", { parent });
    env.PA.net.cta();
    expect(parent.postMessage).toHaveBeenCalledWith("download", "*");
    expect(env.win.open).not.toHaveBeenCalled();
  });

  it("liftoff at top level also opens the store link", async () => {
    const env = await net("liftoff", { postMessage: vi.fn() });
    env.PA.net.cta();
    expect(env.win.postMessage).toHaveBeenCalledWith("download", "*");
    expect(env.win.open).toHaveBeenCalledWith(STORE.android, "_blank");
  });

  it.each(["applovin", "unity", "mraid"])(
    "%s holds the first tap and opens the store through mraid after",
    async (network) => {
      const mraid = fakeMraid();
      const env = await net(network, { mraid });
      env.PA.input.taps = 1;
      env.PA.net.cta();
      expect(mraid.open).not.toHaveBeenCalled();
      expect(env.events("ctaHeld")[0].data).toEqual({ network });
      env.PA.input.taps = 2;
      env.PA.net.cta();
      expect(mraid.open).toHaveBeenCalledWith(STORE.android);
      expect(env.win.open).not.toHaveBeenCalled();
    },
  );

  it("a pill tap counts toward the first-tap rule like any tap", async () => {
    const mraid = fakeMraid();
    const env = await loadRuntime({ network: "applovin", win: { mraid } });
    await boot(
      env,
      { ctaLabel: "GET IT" },
      makeGame({
        draw: (c: unknown) => env.PA.draw.ctaPill(c, 200, 100, 320, 100),
      }),
    );
    env.frame(16);
    expect(env.PA.pillRect).toEqual({ x: 180, y: 75 });
    expect(env.rec.of("fillText")[0][0]).toBe("GET IT");
    env.tap(180, 75);
    expect(mraid.open).not.toHaveBeenCalled();
    env.tap(180, 75);
    expect(mraid.open).toHaveBeenCalledTimes(1);
  });
});

describe("end and retry signals", () => {
  it("signals gameEnd once per round and gameRetry only after an end", async () => {
    const gameEnd = vi.fn(),
      gameRetry = vi.fn();
    const env = await net("mintegral", { gameEnd, gameRetry });
    env.PA.emit("replay");
    expect(gameRetry).not.toHaveBeenCalled();
    env.PA.emit("endcard");
    env.PA.emit("endcard");
    expect(gameEnd).toHaveBeenCalledTimes(1);
    env.PA.emit("replay");
    env.PA.emit("replay");
    expect(gameRetry).toHaveBeenCalledTimes(1);
    env.PA.emit("endcard");
    expect(gameEnd).toHaveBeenCalledTimes(2);
    expect(names(env)).toEqual([
      "replay",
      "endcard",
      "gameEnd",
      "endcard",
      "replay",
      "gameRetry",
      "replay",
      "endcard",
      "gameEnd",
    ]);
  });

  it("liftoff posts complete at the end card", async () => {
    const parent = { postMessage: vi.fn() };
    const env = await net("liftoff", { parent });
    env.PA.emit("endcard");
    expect(parent.postMessage).toHaveBeenCalledWith("complete", "*");
  });

  it("survives container hooks that throw", async () => {
    const boom = () => {
      throw new Error("hook");
    };
    const env = await net("mintegral", { gameEnd: boom, gameRetry: boom });
    env.PA.emit("endcard");
    env.PA.emit("replay");
    expect(names(env)).toEqual(["endcard", "gameEnd", "replay", "gameRetry"]);
  });
});

describe("whenViewable", () => {
  it("starts at once on networks without a start signal", async () => {
    for (const n of [
      "web",
      "meta",
      "google",
      "liftoff",
      "pangle",
      "mintegral",
    ]) {
      const env = await net(n);
      const go = vi.fn();
      env.PA.net.whenViewable(go);
      expect(go).toHaveBeenCalledTimes(1);
      expect(names(env)).toEqual(["viewable"]);
    }
  });

  it("mintegral waits for gameStart, then pauses on gameClose", async () => {
    const gameReady = vi.fn();
    const env = await net("mintegral", { gameReady });
    const go = vi.fn();
    env.PA.net.whenViewable(go);
    expect(gameReady).toHaveBeenCalledTimes(1);
    expect(go).not.toHaveBeenCalled();
    env.win.gameClose(); // before the start: nothing to pause
    env.win.gameStart();
    expect(go).toHaveBeenCalledTimes(1);
    env.win.gameClose();
    env.win.gameClose();
    env.win.gameStart();
    expect(go).toHaveBeenCalledTimes(1);
    expect(names(env)).toEqual(["viewable", "netHold", "netResume"]);
  });

  it("mintegral starts at once when gameReady throws", async () => {
    const env = await net("mintegral", {
      gameReady: () => {
        throw new Error("x");
      },
    });
    const go = vi.fn();
    env.PA.net.whenViewable(go);
    expect(go).toHaveBeenCalledTimes(1);
  });

  it("MRAID waits for ready, then starts when viewable", async () => {
    const mraid = fakeMraid("loading");
    const env = await net("applovin", { mraid });
    const go = vi.fn();
    env.PA.net.whenViewable(go);
    expect(go).not.toHaveBeenCalled();
    mraid.fire("ready");
    expect(go).toHaveBeenCalledTimes(1);
  });

  it("MRAID holds until viewableChange(true) and pauses on viewableChange(false)", async () => {
    const mraid = fakeMraid("default", false);
    const env = await net("unity", { mraid });
    const go = vi.fn();
    env.PA.net.whenViewable(go);
    expect(go).not.toHaveBeenCalled();
    mraid.fire("viewableChange", false); // not started yet: nothing to pause
    mraid.fire("viewableChange", true);
    mraid.fire("viewableChange", false);
    mraid.fire("viewableChange", true);
    expect(go).toHaveBeenCalledTimes(1);
    expect(names(env)).toEqual(["viewable", "netHold", "netResume"]);
  });

  it("MRAID 3 exposureChange pauses at 0 % and resumes above it", async () => {
    const mraid = fakeMraid();
    const env = await net("mraid", { mraid });
    env.PA.net.whenViewable(vi.fn());
    mraid.fire("exposureChange", 0);
    mraid.fire("exposureChange", 37.5);
    expect(names(env)).toEqual(["viewable", "netHold", "netResume"]);
  });

  it("assumes ready and viewable when the MRAID getters throw", async () => {
    const mraid: any = fakeMraid();
    mraid.getState = () => {
      throw new Error("x");
    };
    mraid.isViewable = () => {
      throw new Error("x");
    };
    const env = await net("applovin", { mraid });
    const go = vi.fn();
    env.PA.net.whenViewable(go);
    expect(go).toHaveBeenCalledTimes(1);
  });

  it("survives an MRAID that rejects both change listeners", async () => {
    const mraid: any = fakeMraid("default", false);
    const add = mraid.addEventListener;
    mraid.addEventListener = (t: string, f: (v?: unknown) => void) => {
      if (t === "viewableChange") throw new Error("MRAID 3 only");
      if (t === "exposureChange") throw new Error("MRAID 2 only");
      add(t, f);
    };
    const env = await net("applovin", { mraid });
    const go = vi.fn();
    env.PA.net.whenViewable(go);
    expect(go).not.toHaveBeenCalled();
    expect(mraid.l).toEqual({});
  });

  it("starts at once when the MRAID object has no addEventListener", async () => {
    const env = await net("applovin", { mraid: { open: vi.fn() } });
    const go = vi.fn();
    env.PA.net.whenViewable(go);
    expect(go).toHaveBeenCalledTimes(1);
  });

  it("a container hold freezes the loop and ignores taps until resumed", async () => {
    const mraid = fakeMraid("default", false);
    const env = await loadRuntime({ network: "mraid", win: { mraid } });
    const game = await boot(env);
    expect(env.raf).toHaveLength(0);
    mraid.fire("viewableChange", true);
    env.frame(16);
    const t = env.PA.realTime;
    expect(t).toBeGreaterThan(0);
    mraid.fire("viewableChange", false);
    env.run(0.5);
    env.tap(50, 50);
    expect(env.PA.realTime).toBe(t);
    expect(game.onDown).not.toHaveBeenCalled();
    mraid.fire("viewableChange", true);
    env.frame(16);
    expect(env.PA.realTime).toBeCloseTo(t + 0.016, 9);
    env.tap(50, 50);
    expect(game.onDown).toHaveBeenCalledTimes(1);
  });
});
