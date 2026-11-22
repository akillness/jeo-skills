import { afterEach, describe, expect, it, vi } from "vitest";
import {
  boot,
  FakeAudioContext,
  loadRuntime,
  restoreGlobals,
} from "./runtime-harness";

afterEach(() => {
  restoreGlobals();
  vi.restoreAllMocks();
});

const CLIP =
  "data:audio/wav;base64," + Buffer.from([1, 2, 3, 250]).toString("base64");
const SOUNDS = { pop: CLIP, bgm: CLIP, bad: CLIP };

// boots a web game with sounds, taps once to unlock audio, and decodes every clip but "bad"
async function unlocked(cfg: Record<string, unknown> = {}, opts = {}) {
  const env = await loadRuntime({ audio: true, ...opts });
  await boot(env, { sounds: SOUNDS, music: "bgm", ...cfg });
  env.frame(16);
  env.tap(180, 300);
  const ctx = FakeAudioContext.last!;
  for (const [i, k] of Object.keys(SOUNDS).entries()) {
    if (k === "bad") ctx.decodes[i].err();
    else ctx.decodes[i].ok({ clip: k });
  }
  return { env, ctx, audio: env.PA.audio };
}

describe("unlock", () => {
  it("waits for the first touch, then decodes every embedded clip", async () => {
    const env = await loadRuntime({ audio: true });
    await boot(env, { sounds: SOUNDS });
    env.frame(16);
    expect(FakeAudioContext.last).toBeNull();
    env.tap(180, 300);
    const ctx = FakeAudioContext.last!;
    expect(ctx.decodes).toHaveLength(3);
    expect([...new Uint8Array(ctx.decodes[0].buf)]).toEqual([1, 2, 3, 250]);
    const master = env.PA.audio.master;
    expect(master.to).toBe(ctx.destination);
    expect(master.gain.value).toBe(1);
  });

  it("keeps decoded clips and drops the ones that fail", async () => {
    const { audio, ctx } = await unlocked();
    ctx.currentTime = 1;
    audio.play("bad");
    expect(ctx.started.map((s) => s.buffer.clip)).toEqual(["bgm"]);
    audio.play("pop");
    expect(ctx.started.map((s) => s.buffer.clip)).toEqual(["bgm", "pop"]);
  });

  it("creates the context once and resumes it when suspended", async () => {
    const { audio, ctx } = await unlocked();
    audio.unlock();
    expect(ctx.resumes).toBe(0);
    ctx.state = "suspended";
    audio.unlock();
    expect(ctx.resumes).toBe(1);
    expect(audio.ctx).toBe(ctx);
  });

  it("uses webkitAudioContext when AudioContext is missing", async () => {
    const env = await loadRuntime({
      win: { webkitAudioContext: FakeAudioContext },
    });
    await boot(env);
    env.tap(180, 300);
    expect(env.PA.audio.ctx).toBe(FakeAudioContext.last);
  });

  it("stays silent without Web Audio", async () => {
    const env = await loadRuntime();
    await boot(env, { sounds: SOUNDS });
    env.tap(180, 300);
    expect(env.PA.audio.ctx).toBeNull();
    // the tap still counts: a missing Web Audio never blocks input
    expect(env.PA.input.taps).toBe(1);
    expect(() => {
      env.PA.audio.play("pop");
      env.PA.audio.duck();
      env.PA.audio.musicTo(0.2);
      env.PA.audio.startMusic();
    }).not.toThrow();
    expect(env.PA.audio.music).toBeNull();
  });

  it("starts silent when muted before the first touch", async () => {
    const env = await loadRuntime({ audio: true });
    await boot(env);
    env.PA.audio.setMuted(true);
    env.PA.audio.unlock();
    expect(env.PA.audio.master.gain.value).toBe(0);
  });
});

describe("play", () => {
  it("plays a decoded clip at the given volume and rate through the master", async () => {
    const { audio, ctx } = await unlocked();
    ctx.currentTime = 2;
    audio.play("pop", 0.5, 1.5);
    const src = ctx.started.at(-1);
    expect(src.buffer).toEqual({ clip: "pop" });
    expect(src.playbackRate.value).toBe(1.5);
    expect(src.to.gain.value).toBe(0.5);
    expect(src.to.to).toBe(audio.master);
    ctx.currentTime = 3;
    audio.play("pop");
    expect(ctx.started.at(-1).playbackRate.value).toBe(1);
    expect(ctx.started.at(-1).to.gain.value).toBe(1);
  });

  it("never repeats a clip faster than soundGap (0.3 s by default)", async () => {
    const { audio, ctx } = await unlocked();
    const n = () => ctx.started.filter((s) => s.buffer.clip === "pop").length;
    ctx.currentTime = 1;
    audio.play("pop");
    ctx.currentTime = 1.29;
    audio.play("pop");
    expect(n()).toBe(1);
    ctx.currentTime = 1.31;
    audio.play("pop");
    expect(n()).toBe(2);
  });

  it("honors cfg.soundGap and a longer per-call minGap", async () => {
    const { audio, ctx } = await unlocked({ soundGap: 0 });
    const n = () => ctx.started.filter((s) => s.buffer.clip === "pop").length;
    ctx.currentTime = 1;
    audio.play("pop");
    audio.play("pop");
    expect(n()).toBe(2);
    ctx.currentTime = 5;
    audio.play("pop", 1, 1, 1);
    ctx.currentTime = 5.9;
    audio.play("pop", 1, 1, 1);
    expect(n()).toBe(3);
  });

  it("rate-limits a clip first played at currentTime 0", async () => {
    const { audio, ctx } = await unlocked();
    ctx.currentTime = 0;
    audio.play("pop");
    ctx.currentTime = 0.1;
    audio.play("pop");
    expect(ctx.started.filter((s) => s.buffer.clip === "pop")).toHaveLength(1);
  });

  it("skips unknown clips and a suspended context", async () => {
    const { audio, ctx } = await unlocked();
    const before = ctx.started.length;
    audio.play("nope");
    audio.play("bad");
    ctx.state = "suspended";
    audio.play("pop");
    expect(ctx.started.length).toBe(before);
  });
});

describe("music", () => {
  it("starts looping once its clip decodes after the first tap, only once", async () => {
    const { audio, ctx } = await unlocked({ musicVolume: 0.5 });
    const music = ctx.started.filter((s) => s.buffer.clip === "bgm");
    expect(music).toHaveLength(1);
    expect(music[0].loop).toBe(true);
    expect(audio.musicGain.gain.value).toBe(0.5);
    expect(audio.musicGain.to).toBe(audio.master);
    audio.startMusic();
    expect(ctx.started.filter((s) => s.buffer.clip === "bgm")).toHaveLength(1);
  });

  it("uses a 0.4 default volume and does not start before a tap asks for it", async () => {
    const env = await loadRuntime({ audio: true });
    await boot(env, { sounds: { bgm: CLIP }, music: "bgm" });
    env.PA.audio.unlock();
    FakeAudioContext.last!.decodes[0].ok({ clip: "bgm" });
    expect(env.PA.audio.music).toBeNull();
    env.PA.audio.startMusic();
    expect(env.PA.audio.musicGain.gain.value).toBe(0.4);
  });

  it("ramps the music volume from its current value", async () => {
    const { audio, ctx } = await unlocked({ musicVolume: 0.5 });
    ctx.currentTime = 4;
    audio.musicTo(0.1, 2);
    expect(audio.musicGain.gain.log).toEqual([
      ["cancel", 4],
      ["set", 0.5, 4],
      ["ramp", 0.1, 6],
    ]);
    audio.musicTo(0.3);
    expect(audio.musicGain.gain.log.at(-1)).toEqual(["ramp", 0.3, 4.3]);
  });

  it("ducks under a payoff and restores cfg.musicVolume after it", async () => {
    const { env, audio } = await unlocked({ musicVolume: 0.5 });
    audio.duck(0.1, 1);
    expect(audio.musicGain.gain.value).toBe(0.1);
    env.run(0.9);
    expect(audio.musicGain.gain.value).toBe(0.1);
    env.run(0.2);
    expect(audio.musicGain.gain.value).toBe(0.5);
    audio.duck();
    expect(audio.musicGain.gain.value).toBe(0.12); // default level
  });

  it("extends an overlapping duck instead of restoring early", async () => {
    const { env, audio } = await unlocked({ musicVolume: 0.5 });
    audio.duck(0.1, 1);
    env.run(0.5);
    audio.duck(0.2, 1);
    env.run(0.6); // the first duck's timer fires here
    expect(audio.musicGain.gain.value).toBe(0.2);
    env.run(0.5);
    expect(audio.musicGain.gain.value).toBe(0.5);
  });

  it("a shorter duck inside a longer one does not cut it short", async () => {
    const { env, audio } = await unlocked({ musicVolume: 0.5 });
    audio.duck(0.1, 2);
    audio.duck(0.1, 0.5);
    env.run(1);
    expect(audio.musicGain.gain.value).toBe(0.1);
    env.run(1.1);
    expect(audio.musicGain.gain.value).toBe(0.5);
  });

  it("clearTweens undoes a duck left by the last round", async () => {
    const { env, audio } = await unlocked({ musicVolume: 0.5 });
    audio.duck(0.1, 5);
    env.PA.clearTweens();
    expect(audio.musicGain.gain.value).toBe(0.5);
  });
});

describe("mute and pausing", () => {
  it("the mute button fades the master gain out and back in", async () => {
    const { env, audio, ctx } = await unlocked();
    ctx.currentTime = 7;
    env.tap(21, 619);
    expect(audio.master.gain.log.at(-1)).toEqual(["target", 0, 7, 0.02]);
    env.tap(21, 619);
    expect(audio.master.gain.log.at(-1)).toEqual(["target", 1, 7, 0.02]);
  });

  it("suspends sound while the page is hidden", async () => {
    const { env, ctx } = await unlocked();
    env.doc.hidden = true;
    env.doc.fire("visibilitychange");
    expect(ctx.state).toBe("suspended");
    env.doc.hidden = false;
    env.doc.fire("visibilitychange");
    expect(ctx.state).toBe("running");
  });

  it("resumes only when both the page and the container allow it", async () => {
    const l: Record<string, ((v: unknown) => void)[]> = {};
    const mraid = {
      getState: () => "default",
      isViewable: () => true,
      addEventListener: (t: string, f: (v: unknown) => void) =>
        (l[t] ||= []).push(f),
    };
    const env = await loadRuntime({
      network: "mraid",
      audio: true,
      win: { mraid },
    });
    await boot(env);
    env.tap(180, 300);
    const ctx = FakeAudioContext.last!;
    const viewable = (v: boolean) => l.viewableChange.forEach((f) => f(v));
    viewable(false);
    expect(ctx.state).toBe("suspended");
    env.doc.hidden = true;
    env.doc.fire("visibilitychange");
    viewable(true);
    expect(ctx.state).toBe("suspended");
    env.doc.hidden = false;
    env.doc.fire("visibilitychange");
    expect(ctx.state).toBe("running");
  });
});
