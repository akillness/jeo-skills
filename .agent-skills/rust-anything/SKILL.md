---
name: rust-anything
description: >
  Use when incrementally rewriting, porting, or migrating applications and libraries from TypeScript, Python, C, Go, Ruby, or Java into memory-safe, idiomatic Rust with rust-anything. Covers dependency graph decomposition, record-and-replay behavioral verification (golden recordings), incremental FFI bridging (PyO3, napi-rs, C-ABI), CLI and HTTP server porting (Axum, Clap), differential test execution, and final cutover. Route format-only skill linting to skill-standardization, manual high-level code refactoring without Rust porting to code-refactoring, and general architecture review to improve-codebase-architecture.
allowed-tools: Bash Read Grep Glob
metadata:
  version: 0.1.0
  source: https://github.com/erkamyaman/rust-anything
  upstream_commit: 075335cf4b05f51c82fcf389acd3003266a32fc6
---

# Rust Anything

## When to use this skill

Use when modernizing, accelerating, or securing legacy codebases by incrementally porting them to Rust. Rather than risking a high-failure "big-bang" rewrite, `rust-anything` decomposes applications into manageable modules, creates intermediate FFI bindings so ported and unported code execute together seamlessly, and verifies bit-for-bit behavioral equivalence against recorded production test fixtures.

### Route-outs
- For validating Agent Skills specification format, frontmatter, or directory structure, use `skill-standardization`.
- For general refactoring, clean code patterns, or code deduplication within the existing language, use `code-refactoring`.
- For high-level system architecture and domain boundary redesign, use `improve-codebase-architecture`.
- For performance profiling and bottleneck localization prior to rewriting, use `performance-profiling`.

## Instructions

### 1. Offline environment and workspace preflight

Before starting a migration, inspect the target workspace and verify toolchain availability:

```bash
# Check toolchain and detect project manifests
python3 "$SKILL_DIR/scripts/preflight.py" --workspace "/absolute/path/to/project" --json
```

The preflight tool discovers source manifests (`package.json`, `pyproject.toml`, `go.mod`, etc.), verifies `cargo` and `rustc` presence, checks for existing golden fixtures, and validates `rust-anything.toml` configurations without compiling code or making network calls.

### 2. Record baseline application behavior

Capture real-world traffic, CLI executions, or unit test invocations into golden fixture recordings:

```bash
# Record CLI tool executions
rust-anything record --app "python cli.py" --cases ./test_cases/ --output ./golden_fixtures/

# Record HTTP server endpoints
rust-anything record --server "node server.js" --traffic ./recorded_requests/ --output ./golden_fixtures/
```

Recordings capture inputs (arguments, stdin, request bodies) and outputs (exit codes, stdout, HTTP status, response payloads).

### 3. Decompose module dependency graph

Map internal imports and identify leaf modules:
- **Leaf modules:** Utility functions, data parsers, cryptographic or mathematical calculations that have no inward dependencies on the rest of the application.
- **Intermediate services:** Business logic and database access layers.
- **Entry point:** HTTP router or CLI entry point.

Always port leaf modules first to establish stable foundations before porting orchestrators.

### 4. Implement incremental FFI bridges

Port selected leaf modules into the companion Rust crate and expose language-specific bindings:

- **Python:** Use `PyO3` with `#[pyfunction]` and `maturin` to build native CPython extensions.
- **Node.js / TypeScript:** Use `napi-rs` with `#[napi]` to build native `.node` modules.
- **C / Go / Ruby:** Expose C-ABI functions using `#[no_mangle] pub extern "C" fn`.

The legacy application imports and calls the compiled Rust module transparently.

### 5. Execute differential verification

Verify that the new Rust implementation reproduces identical behavior against the golden recordings:

```bash
# Run automated differential test suite
rust-anything verify --target ./target/release/libengine.so --fixtures ./golden_fixtures/
```

If differences arise, configure `[verification.tolerances]` in `rust-anything.toml` to handle acceptable floating-point variances (`float_epsilon = 1e-6`) or date header masking.

### 6. Zero-overhead cutover

Once all modules are ported and verified:
1. Port the root application entry point (e.g. using `clap` for CLIs or `axum` for web servers).
2. Remove FFI bridging dependencies (`pyo3`, `napi-rs`) from `Cargo.toml`.
3. Compile a 100% standalone native Rust binary.
4. Run final end-to-end integration tests.

## Examples

### Complete CLI migration workflow

```bash
# 1. Inspect workspace
python3 "$SKILL_DIR/scripts/preflight.py" --workspace ./my_cli_project

# 2. Record golden behavior
rust-anything record --app "python -m my_cli" --cases ./test_inputs/ --output ./fixtures/

# 3. Scaffold Rust CLI crate with clap
cargo new --bin my_cli_rust
cd my_cli_rust && cargo add clap --features derive

# 4. Verify behavioral parity
rust-anything verify --target ./target/release/my_cli_rust --fixtures ../fixtures/
```

## Best practices

1. **Never skip golden recordings:** Do not rely solely on unit tests; record actual input/output behaviors before modifying legacy code.
2. **Follow the Strangler Fig pattern:** Migrate one module at a time via FFI; avoid attempting full-codebase conversions in single iterations.
3. **Normalize non-deterministic outputs:** Strip volatile timestamps, randomized UUIDs, and system dates during HTTP response verification.
4. **Audit memory safety before cutover:** Run test suites under Miri (`cargo miri test`) or AddressSanitizer (ASan) to guarantee memory safety before production release.

## References

- [Differential Behavioral Verification](references/differential-verification.md): Golden fixture schemas, CLI/HTTP recording specifications, and tolerance rules.
- [FFI Bridging and Zero-Downtime Cutover](references/ffi-bridging-and-cutover.md): PyO3, napi-rs, and C-ABI bridge patterns, Strangler Fig pattern, and cutover checklists.
- [Sources and Provenance](references/sources.md): Repository metadata, MIT license, and architectural boundaries.
- [Evaluation Scenarios](evals/evals.json): Five behavioral evaluation scenarios covering CLI, HTTP, FFI, and cutover workflows.
