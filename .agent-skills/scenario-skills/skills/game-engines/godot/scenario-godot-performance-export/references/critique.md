# Critique rubric: performance work and releases

Score each line 0 (missing), 1 (claimed), 2 (measured or verified). A performance report or a
release under 80 % of the maximum goes back for another pass. [added: the rubric is this skill's
own]

## A. Performance report

| #   | Check                      | 2 means                                                                                                    |
| --- | -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| A1  | Target and budget stated   | device class, fps, ms budget, renderer named                                                               |
| A2  | Project settings read back | Jolt for 3D and the renderer confirmed in `project.godot`                                                  |
| A3  | Harness reproducible       | same scene, size, seconds, warm-up, driver; command or job in the report                                   |
| A4  | Right counters             | GPU from a Vulkan windowed run, script cost from sentinels, not `TIME_PROCESS`; headless only for CPU work |
| A5  | Bound classified           | CPU or GPU, and fill versus geometry or shadows, with the half-resolution check                            |
| A6  | One change per measurement | each fix has its own before and after                                                                      |
| A7  | Noise respected            | repeats or the 5 % and 0.1 ms floor; no claims on one noisy run                                            |
| A8  | Picture unchanged          | contact sheet opened; luma difference or the visual change approved                                        |
| A9  | Hitches covered            | area load measured cold and warm, worst frame reported                                                     |
| A10 | Device evidence            | exported build with `perf_logger` on the target, or "not run" with the reason                              |
| A11 | Refusals stated            | what was not changed and why (art direction, gameplay feel, reach)                                         |
| A12 | Owners named               | each flag routed to the teammate who owns the fix                                                          |
| A13 | Runs without the toolkit   | every helper call has the engine code or CLI next to it (round-1 grading)                                  |
| A14 | Long enough on device      | phone soak 30 minutes, gate on minutes 20 to 30, OS thermal status logged; GPU adapter logged on laptops   |

## B. Release

| #   | Check                             | 2 means                                                                                                                                                 |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | Templates match the exact version | `gd_env.templates_ok` true for each platform                                                                                                            |
| B2  | Presets clean                     | no secrets, filters exclude tests and tooling, export path outside the project or `.gdignore`                                                           |
| B3  | Artifact verified as a file       | `verify_macos`, `verify_apk`, `verify_xcode_project`, `pck_listing`, `size_report` outputs saved                                                        |
| B4  | Build runs                        | exported binary or browser smoke shows `SHIP_BOOT` with expected tags and renderer, no errors                                                           |
| B5  | Signing                           | correct key or identity (SHA-256 matched); debug flags off for release                                                                                  |
| B6  | Store identity                    | bundle id or package valid and stable; version and build numbers raised                                                                                 |
| B7  | Size budget                       | compressed bytes the host serves, per platform, against the stated budget                                                                               |
| B8  | Platform rules                    | web threads and headers, macOS entitlements, Android permissions requested at runtime, iOS team                                                         |
| B9  | Content split                     | demo tag and DLC exclusion proven by listing the base pack                                                                                              |
| B10 | Human steps listed                | notarization, store uploads, account steps written as commands with "not run"                                                                           |
| B12 | Mobile reach                      | renderer choice and the OpenGL fallback look checked; safe area on Android (SDK 36 target) and iOS; App Store Connect record and crash reporter planned |
| B11 | Privacy                           | no home paths, device names or credentials in logs or reports that leave the machine                                                                    |

## Red flags (automatic fail)

- An fps number from a headless run.
- A "fixed" claim without the same harness before and after.
- GPU conclusions from a Metal run that reports 0 ms.
- A threaded web build shipped to a host without COOP and COEP and without the PWA fallback.
- A keystore password or Apple password in `export_presets.cfg` or in a log.
- A release signed with the debug key.
