# Rust Anything Sources and Provenance

## Upstream Repository
- **Repository:** [https://github.com/erkamyaman/rust-anything](https://github.com/erkamyaman/rust-anything)
- **Author:** Erkam Yaman
- **Project Goal:** Rewrite applications and libraries in Rust incrementally, verifying semantic and behavioral equivalence against golden recordings at every step.
- **Upstream Commit:** `075335cf4b05f51c82fcf389acd3003266a32fc6`
- **Default Branch:** `main`
- **License:** MIT License

## Supported Source Languages and Ecosystems
- **TypeScript / Node.js:** Express, Fastify, CLI tools (`commander`, `yargs`), native bindings via `napi-rs`.
- **Python:** FastAPI, Flask, computational modules, native C-extensions via `PyO3` / `maturin`.
- **C / C++:** Shared libraries, CLI binaries, system utilities bridged via `extern "C"` FFI bindings.
- **Go:** Microservices, CLI tools, network utilities bridged via cgo / Rust C-ABI.
- **Ruby:** Ruby on Rails microservices, gems bridged via `magnus` / `rutie`.
- **Java:** JVM services and backend components bridged via JNI (`jni-rs`).

## Target Rust Frameworks
- **CLIs:** `clap` (derive parser), `indicatif` (progress bars), `colored` / `anstream`.
- **HTTP Servers:** `axum` (Tokio-based modular web framework) and `actix-web`.
- **Data Serialization:** `serde`, `serde_json`, `bincode`.
- **Async Runtime:** `tokio` (multi-threaded work-stealing reactor).

## Operational Boundaries
- **Offline Inspection:** `scripts/preflight.py` operates strictly offline with standard library tools, verifying Rust toolchain presence, detecting source manifests, and parsing configuration files without compiling code or making network calls.
- **Incremental Verification:** All code generation must be validated against recorded golden test suites before deleting original language source modules.
- **Compilation Safety:** Compiling Rust targets (`cargo build`, `cargo test`) requires an active Rust toolchain (`rustc`, `cargo` 1.75+).
