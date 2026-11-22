<p align="center">
  <img src="https://raw.githubusercontent.com/EL4CTEO/fast-anything/main/docs/assets/wordmark.png" alt="fast-anything" width="520">
</p>

<p align="center"><b>Don't rewrite it in Rust. Rewrite the 5% that's slow.</b></p>

<p align="center">
  <a href="https://trendshift.io/repositories/371252"><img src="https://trendshift.io/api/badge/repositories/371252" alt="EL4CTEO/fast-anything | Trendshift" width="250" height="55"></a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@el4cteo/fast-anything"><img src="https://img.shields.io/npm/v/@el4cteo/fast-anything?color=f74c00&label=npm" alt="npm"></a>
  <a href="https://crates.io/crates/fast-anything"><img src="https://img.shields.io/crates/v/fast-anything?color=f74c00" alt="crates.io"></a>
  <a href="https://github.com/EL4CTEO/fast-anything/actions/workflows/ci.yml"><img src="https://github.com/EL4CTEO/fast-anything/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/Python%20%C2%B7%20Node%20%C2%B7%20TypeScript%20%C2%B7%20Ruby%20%C2%B7%20Java%20%C2%B7%20Go%20%C2%B7%20PHP%20%C2%B7%20C%20%C2%B7%20C%2B%2B%20%C2%B7%20C%23-2563eb" alt="Python, Node, TypeScript, Ruby, Java, Go, PHP, C, C++, C#">
  <img src="https://img.shields.io/badge/Claude%20Code-plugin-d97757" alt="Claude Code plugin">
  <img src="https://img.shields.io/badge/MCP-server-555" alt="MCP server">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-555" alt="MIT"></a>
</p>

Rewriting a whole app in Rust costs months, minute-long compiles and gigabytes of `target/`. Most of the runtime sits in a few functions anyway.

**fast-anything** finds those functions, has your coding agent port *only them* to Rust, proves the port gives the same results on real recorded calls, and swaps it in. One command, fully reversible.

<p align="center"><img src="https://raw.githubusercontent.com/EL4CTEO/fast-anything/main/docs/assets/demo.gif" alt="fast-anything go --agent claude -- python app.py" width="820"></p>

## Install

```sh
npm i -g @el4cteo/fast-anything      # or: cargo install fast-anything
```

Ports are compiled with your Rust toolchain ([rustup](https://rustup.rs)).

## Use

```sh
fast-anything go --agent claude -- python app.py     # or: -- node app.ts / ruby app.rb / java App.java / mvn exec:java / gradle run / go run . / php app.php / clang -O2 main.c
```

Or step by step:

| command | what it does |
|---|---|
| `scan -- <cmd>` | profiles the app, ranks functions by time × how portable they are |
| `port [id]` | records up to 500 real calls, creates a one-function Rust crate + `TASK.md` |
| `verify` | release-builds the port and replays every recorded call |
| `enable` / `disable` | swaps the Rust in or out (one marked block, removed byte for byte) |
| `bench` | times the whole app, original vs Rust, interleaved runs |
| `report` | markdown + SVG card for your PR |
| `doctor` | checks Rust, your runtimes and your agents |

`--agent` takes `claude`, `codex`, or any command that reads a prompt on stdin. Without it, hand `TASK.md` to whatever you use.

## Proof, not vibes

<p align="center"><img src="https://raw.githubusercontent.com/EL4CTEO/fast-anything/main/docs/assets/verify.gif" alt="verify catches a wrong port" width="820"></p>

That port looked right but compared bytes instead of characters. 148 of 500 real calls caught it. On top of the recorded calls, fast-anything derives extra cases and lets the original answer them: edge cases (NaN, ±infinity, -0.0, zero and ±1, non-ASCII text, empty and up to 16× bigger inputs) and shrunk inputs (tiny and random slices). Nothing is enabled until every case matches: same values (floats within 1e-9), errors where the original errors. A port that is right but slower per call than the original (calling into Rust costs more than the work saved) isn't enabled either. `FAST_ANYTHING_DISABLE=1` runs the original any time.

## Results

Real runs on an i5-10500, Windows 11 (C and C++: a 4-core GitHub Actions Linux runner). Reproduce them from [`examples/`](examples).

| app | before | after |
|---|---|---|
| Python fuzzy dedupe (700 names) | 4.91s | **42ms, 116×** |
| TypeScript fuzzy dedupe (2,000 names) | 3.11s | **155ms, 20×** |
| PHP fuzzy dedupe (600 names) | 2.94s | **53ms, 55×** |
| Go fuzzy dedupe (3,000 names) | 3.02s | **144ms, 21×** |
| Ruby fuzzy dedupe (400 names) | 3.13s | **228ms, 14×** |
| C# fuzzy dedupe (4,000 names) | 4.03s | **312ms, 13×** |
| Java fuzzy dedupe (4,000 names) | 3.50s | **1.18s, 3×** (11× on the function; the rest is JVM startup) |
| C mandelbrot (8 zoom levels) | 431ms | **127ms, 3.4×** |
| C++ fuzzy dedupe (6,000 names) | 3.02s | **1.09s, 2.7×** |

fast-anything ports the outermost loop it can, not the tiny function called inside it, so the app crosses into Rust once instead of millions of times. Porting only the inner `levenshtein` gave 35× and 1.9×.

## Why not rewrite it all?

- **Compile time**: each port is a one-function crate. Seconds, not minutes.
- **Cache**: every port shares one `.fast/target`. Delete it whenever you like.
- **Risk**: your code stays as it is. Rust is opt-in per function, checked against real behavior.

## Agents

- **Claude Code plugin**: `/plugin marketplace add EL4CTEO/fast-anything`, then `/plugin install fast-anything@fast-anything` and `/fast-anything:fast python app.py`
- **MCP server** (Claude Code, Codex, Cursor…), built into the binary: `claude mcp add fast-anything -- fast-anything mcp`. 8 tools: `fast_scan`, `fast_port`, `fast_verify`, `fast_enable`, `fast_disable`, `fast_bench`, `fast_report`, `fast_status`.
- **Skill**: [`skills/fast-anything`](skills/fast-anything/SKILL.md) teaches any agent the loop.

## Languages

| language | binding | status |
|---|---|---|
| Python 3.10+ | PyO3 | ✅ |
| JavaScript / TypeScript (Node 22+) | napi-rs | ✅ |
| Ruby 3.3+ | C ABI + JSON, through Ruby's built-in Fiddle | ✅ |
| Java 22+ (`java App.java`, Maven, Gradle) | the same C bridge, through the FFM API | ✅ |
| Go 1.22+ (`go run .`) | the same C bridge, through the Windows loader or dlopen (cgo) | ✅ |
| PHP 8.1+ (`php app.php`) | the same C bridge, through PHP's FFI extension (`extension=ffi`) | ✅ |
| C and C++ (gcc, clang or Intel oneAPI icx/icpx: `clang -O2 main.c lib.c`) | the same C bridge, through LoadLibrary or dlopen | ✅ |
| C# / .NET 8+ (`dotnet run -c Release`) | the same C bridge, through NativeLibrary; profiled with EventPipe, nothing to install | ✅ |

It ports top-level, deterministic functions that take plain data (numbers, strings, lists, dicts, typed arrays…), including ones in your entry script when its main code sits under `if __name__ == "__main__":` (or `if __FILE__ == $0`, or `if (import.meta.main)` / `if (require.main === module)`). In Python that means module-level functions and `@staticmethod`s, in Java, C# and PHP static methods (and PHP functions), in Go plain functions, in C and C++ free functions and static methods. `scan` says why anything else can't move yet.

With Intel oneAPI on Windows, run fast-anything from a shell where `setvars.bat` ran (it sets up the linker). SYCL kernels run on the device and aren't ported; with `-fsycl`, only host functions are profiled and ported.

Ruby, Java, Go, PHP, C, C++ and C# need no headers, bindings or extra tools: the port is a plain Rust library with one C entry point taking and returning JSON, and fast-anything replays the recorded calls against it directly. Any language that can call C can use that bridge.

## License

MIT
