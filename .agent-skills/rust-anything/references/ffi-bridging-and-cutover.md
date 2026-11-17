# FFI Bridging and Zero-Downtime Cutover Reference

## 1. The Strangler Fig Pattern in Codebase Migration

Big-bang rewrites (attempting to convert an entire repository into Rust in a single massive pull request) suffer from high failure rates due to scope bloat, merge conflicts, and unverified regressions.

`rust-anything` enforces the **Strangler Fig Pattern**:
1. **Dependency Graph Inversion:** Analyze the source codebase's module dependencies. Identify leaf modules (utilities, data transformers, core mathematical algorithms) that have few internal dependencies.
2. **Scaffold Rust Crate:** Create a companion Rust library within the repository.
3. **Generate FFI Bridge:** Port the leaf module to Rust and expose an FFI bridge matching the original language's interface.
4. **Transparent Delegation:** The original application calls the compiled Rust module as if it were a native library.
5. **Progressive Upward Migration:** Move up the dependency hierarchy until the application entry point itself is ported.
6. **Zero-Overhead Cutover:** Delete the FFI bridge and compile a 100% standalone native Rust binary.

---

## 2. Language-Specific Bridge Patterns

### Python via PyO3 & Maturin
```rust
use pyo3::prelude::*;

#[pyfunction]
fn process_payload(data: &str) -> PyResult<String> {
    // High-performance Rust business logic
    let result = format!("processed: {}", data.trim());
    Ok(result)
}

#[pymodule]
fn native_engine(_py: Python, m: &PyModule) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(process_payload, m)?)?;
    Ok(())
}
```
In Python: `from native_engine import process_payload` seamlessly replaces the legacy Python function.

### Node.js / TypeScript via `napi-rs`
```rust
use napi_derive::napi;

#[napi]
pub fn transform_records(raw_json: String) -> Result<String, napi::Error> {
    let parsed: serde_json::Value = serde_json::from_str(&raw_json)
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;
    // Native computation
    Ok(parsed.to_string())
}
```
In TypeScript: `import { transformRecords } from './native_engine';` provides native Node.js execution.

### C / Go / Ruby via C-ABI (`extern "C"`)
```rust
#[no_mangle]
pub extern "C" fn calculate_metrics(ptr: *const u8, len: usize) -> i32 {
    if ptr.is_null() { return -1; }
    let slice = unsafe { std::slice::from_raw_parts(ptr, len) };
    // Safe Rust execution over raw memory boundary
    slice.len() as i32
}
```
Generate C headers automatically using `cbindgen`.

---

## 3. Final Cutover Checklist

Before removing the legacy language codebase and decommissioning FFI bridges:

- [ ] **100% Golden Test Suite Pass:** Every recorded input fixture in `golden_fixtures/` produces identical or tolerance-cleared outputs.
- [ ] **Memory Safety Verification:** Run test binaries under `cargo test` and Miri (`cargo miri test`) to detect undefined behavior, memory leaks, or unaligned pointer dereferences.
- [ ] **Dependency Removal:** Strip FFI dependencies (`pyo3`, `napi-rs`, `cgo`) from the final `Cargo.toml`.
- [ ] **Performance Benchmarking:** Validate that the native Rust build satisfies expected throughput, latency (p99), and memory footprint (RSS) targets compared to the original service.
