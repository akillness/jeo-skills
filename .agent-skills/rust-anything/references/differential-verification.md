# Differential Behavioral Verification Reference

## 1. Principles of Behavioral Differential Testing

The core principle of `rust-anything` is that **compiler checks and unit tests alone do not guarantee semantic preservation**. When rewriting code from dynamically typed or GC-managed languages (such as Python or JavaScript) into Rust, subtle edge-case behaviors (such as integer overflow, floating-point precision, regex engine nuances, and error handling) frequently introduce production regressions.

Differential verification guarantees equivalence by executing identical inputs against both the original codebase and the new Rust implementation:

```
[Test Input / Traffic] 
        |
        +-----> [Original Code (Python / TS)] ------> [Recorded Output A]
        |                                                    |
        |                                              [Diff Engine]
        |                                                    |
        +-----> [Rust Implementation] --------------> [Observed Output B]
```

If $\text{Output A} \equiv \text{Output B}$ across all edge cases, the module can be safely approved for production cutover.

---

## 2. Recording Target Profiles

### CLI Applications
For command-line tools, the recorder captures:
- Argument vectors (`argv`)
- Standard input streams (`stdin`)
- Standard output (`stdout`) and error (`stderr`) streams
- Process exit status code (`code: 0`, `code: 1`, etc.)
- Working directory and critical environment variables

```json
{
  "test_id": "cli_flag_combination_042",
  "command": ["my-cli", "--filter", "active", "--json", "input.dat"],
  "stdin": "",
  "expected": {
    "exit_code": 0,
    "stdout": "{\"count\": 12, \"status\": \"ok\"}\n",
    "stderr": ""
  }
}
```

### HTTP Web Services
For HTTP APIs (FastAPI, Express, Flask, Axum), the recorder captures HTTP transactions:
- Request method, URI path, and query parameters
- Request headers and payload body
- Response status code (e.g. `200 OK`, `422 Unprocessable Entity`)
- Response headers (with volatile headers filtered)
- Response JSON / text payload

**Header Normalization:** Volatile runtime headers (such as `Date`, `Set-Cookie`, `Server`, and generated `X-Request-Id` UUIDs) are stripped or masked before comparison to prevent false positives.

---

## 3. Verification Workflow and Tolerances

### Running Verification
```bash
# 1. Record baseline behavior from original Python/TS service
rust-anything record --app "python app.py" --output ./golden_fixtures/

# 2. Replay recorded fixtures against newly ported Rust binary/crate
rust-anything verify --target ./target/release/rust_app --fixtures ./golden_fixtures/

# 3. Generate detailed differential analysis
rust-anything diff --fixture ./golden_fixtures/test_042.json
```

### Numeric and Float Tolerance
In mathematical or financial computations, minor floating-point differences can arise between IEEE-754 implementations (e.g. V8 vs Rust `f64`). `rust-anything` permits configurable epsilon tolerances:
```toml
[verification.tolerances]
float_epsilon = 1e-6
json_order_insensitive = true
trim_trailing_whitespace = true
```
