//! MCP server on stdio (JSON-RPC 2.0, one message per line). Lets any agent drive fast-anything.

use crate::{pipeline, state, ui};
use anyhow::Result;
use serde_json::{Value, json};
use std::io::{BufRead, Write};
use std::path::PathBuf;

const PROTOCOL: &str = "2025-06-18";

const INSTRUCTIONS: &str = "fast-anything speeds up Python, Node.js, Ruby, Java, Go, PHP, C, C++ and C# apps by porting their hottest pure functions to Rust (PyO3 / napi-rs / a C ABI bridge) \
and proving the port gives the same results on real recorded calls. Loop: fast_scan -> fast_port -> write src/lib.rs \
following the returned task -> fast_verify (repeat until it passes) -> fast_enable -> fast_bench -> fast_report.";

fn tools() -> Value {
    let path = json!({ "type": "string", "description": "Project folder (default: the server's working folder)" });
    let id = json!({ "type": "string", "description": "Function id from the scan, e.g. fuzzy.levenshtein" });
    let tool = |name: &str, description: &str, properties: Value, required: Value| {
        json!({ "name": name, "description": description,
                "inputSchema": { "type": "object", "properties": properties, "required": required } })
    };
    json!([
        tool(
            "fast_scan",
            "Run the app under a profiler and rank functions by time share and portability to Rust.",
            json!({ "command": { "type": "array", "items": { "type": "string" }, "description": "How the app runs, e.g. [\"python\", \"app.py\"] or [\"go\", \"run\", \".\"]" }, "path": path }),
            json!(["command"])
        ),
        tool(
            "fast_port",
            "Record real calls to a hot function and create its Rust crate. Returns the task: write src/lib.rs, then call fast_verify.",
            json!({ "id": id, "samples": { "type": "integer", "default": 500 }, "path": path }),
            json!([])
        ),
        tool(
            "fast_verify",
            "Release-build the Rust port and replay every recorded call against it. Returns compile errors or mismatches to fix.",
            json!({ "id": id, "path": path }),
            json!([])
        ),
        tool(
            "fast_enable",
            "Switch the app over to a verified Rust port (reversible).",
            json!({ "id": id, "path": path, "force": { "type": "boolean" } }),
            json!([])
        ),
        tool(
            "fast_disable",
            "Switch a function back to the original code.",
            json!({ "id": id, "path": path }),
            json!([])
        ),
        tool(
            "fast_bench",
            "Time the whole app: original code vs Rust ports.",
            json!({ "runs": { "type": "integer", "default": 5 }, "path": path }),
            json!([])
        ),
        tool(
            "fast_report",
            "Write .fast/report.md and a shareable .fast/report.svg card.",
            json!({ "path": path }),
            json!([])
        ),
        tool("fast_status", "Show the last scan and every port.", json!({ "path": path }), json!([])),
    ])
}

fn call(params: &Value) -> Result<Value> {
    let args = &params["arguments"];
    let root = args["path"].as_str().map(PathBuf::from).unwrap_or_else(|| PathBuf::from("."));
    let id = args["id"].as_str();
    Ok(match params["name"].as_str().unwrap_or_default() {
        "fast_scan" => {
            let command: Vec<String> = args["command"]
                .as_array()
                .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                .unwrap_or_default();
            let scan = pipeline::scan(&root, command)?;
            let top: Vec<Value> = scan
                .hotspots
                .iter()
                .take(10)
                .map(|h| {
                    json!({ "id": h.id, "share": h.share, "calls": h.ncalls, "worth_porting": h.worth_it(),
                                  "blockers": h.blockers, "warnings": h.warnings, "file": h.file, "line": h.line })
                })
                .collect();
            json!({ "wall_seconds": scan.wall, "hotspots": top })
        }
        "fast_port" => {
            let samples = args["samples"].as_u64().unwrap_or(500) as usize;
            serde_json::to_value(pipeline::port(&root, id, samples)?)?
        }
        "fast_verify" => {
            let (id, v) = pipeline::verify(&root, id)?;
            let mut out = serde_json::to_value(&v)?;
            out["id"] = json!(id);
            out["ok"] = json!(v.ok());
            if !v.ok() {
                out["fix"] = json!(pipeline::feedback(&v));
            }
            out
        }
        "fast_enable" => json!({ "enabled": pipeline::enable(&root, id, args["force"].as_bool().unwrap_or(false))? }),
        "fast_disable" => json!({ "disabled": pipeline::disable(&root, id)? }),
        "fast_bench" => serde_json::to_value(pipeline::bench(&root, args["runs"].as_u64().unwrap_or(5) as usize)?)?,
        "fast_report" => serde_json::to_value(pipeline::report(&root)?)?,
        "fast_status" => {
            let ctx = state::Ctx::open(&root)?;
            json!({ "command": ctx.state.command, "ports": ctx.state.ports, "bench": ctx.state.bench })
        }
        other => anyhow::bail!("unknown tool {other}"),
    })
}

/// Sends each step of a long tool call (profiling, recording, building...) as a progress
/// notification, for clients that asked with a progressToken.
fn progress_notifier(token: Value) -> Box<dyn FnMut(&str) + Send> {
    let mut progress = 0u64;
    Box::new(move |message: &str| {
        progress += 1;
        let note = progress_note(&token, progress, message);
        let mut stdout = std::io::stdout().lock();
        let _ = writeln!(stdout, "{note}");
        let _ = stdout.flush();
    })
}

fn progress_note(token: &Value, progress: u64, message: &str) -> Value {
    json!({ "jsonrpc": "2.0", "method": "notifications/progress",
            "params": { "progressToken": token, "progress": progress, "message": message } })
}

fn handle(msg: &Value) -> Option<Value> {
    let id = msg.get("id")?.clone();
    let params = &msg["params"];
    let result = match msg["method"].as_str().unwrap_or_default() {
        "initialize" => json!({
            "protocolVersion": params["protocolVersion"].as_str().unwrap_or(PROTOCOL),
            "capabilities": { "tools": {} },
            "serverInfo": { "name": "fast-anything", "version": env!("CARGO_PKG_VERSION") },
            "instructions": INSTRUCTIONS,
        }),
        "ping" => json!({}),
        "tools/list" => json!({ "tools": tools() }),
        "tools/call" => {
            let token = &params["_meta"]["progressToken"];
            if token.is_string() || token.is_number() {
                ui::set_progress(Some(progress_notifier(token.clone())));
            }
            let result = call(params);
            ui::set_progress(None);
            match result {
                Ok(v) => {
                    json!({ "content": [{ "type": "text", "text": serde_json::to_string_pretty(&v).unwrap_or_default() }] })
                }
                Err(e) => json!({ "content": [{ "type": "text", "text": format!("{e:#}") }], "isError": true }),
            }
        }
        method => {
            return Some(
                json!({ "jsonrpc": "2.0", "id": id, "error": { "code": -32601, "message": format!("unknown method {method}") } }),
            );
        }
    };
    Some(json!({ "jsonrpc": "2.0", "id": id, "result": result }))
}

pub fn serve() -> Result<()> {
    ui::set_quiet(true);
    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout().lock();
    for line in stdin.lock().lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }
        let reply = match serde_json::from_str::<Value>(&line) {
            Ok(msg) => handle(&msg),
            Err(e) => {
                Some(json!({ "jsonrpc": "2.0", "id": null, "error": { "code": -32700, "message": e.to_string() } }))
            }
        };
        if let Some(reply) = reply {
            writeln!(stdout, "{reply}")?;
            stdout.flush()?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn handshake_and_listing() {
        let init = handle(&json!({ "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": { "protocolVersion": "2025-11-25" } })).unwrap();
        assert_eq!(init["result"]["protocolVersion"], "2025-11-25");
        let list = handle(&json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/list" })).unwrap();
        assert_eq!(list["result"]["tools"].as_array().unwrap().len(), 8);
        assert!(handle(&json!({ "jsonrpc": "2.0", "method": "notifications/initialized" })).is_none());
        let bad = handle(&json!({ "jsonrpc": "2.0", "id": 3, "method": "nope" })).unwrap();
        assert_eq!(bad["error"]["code"], -32601);
    }

    #[test]
    fn steps_become_progress_notifications() {
        let note = progress_note(&json!("tok-1"), 2, "building fa_fuzzy (release)");
        assert_eq!(note["method"], "notifications/progress");
        assert_eq!(
            note["params"],
            json!({ "progressToken": "tok-1", "progress": 2, "message": "building fa_fuzzy (release)" })
        );
        assert!(note.get("id").is_none(), "a notification has no id");

        let seen = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let sink = seen.clone();
        ui::set_quiet(true);
        ui::set_progress(Some(Box::new(move |m: &str| sink.lock().unwrap().push(m.to_string()))));
        ui::step("profiling python app.py");
        ui::set_progress(None);
        ui::step("not reported");
        let seen = seen.lock().unwrap();
        assert!(seen.iter().any(|m| m == "profiling python app.py") && !seen.iter().any(|m| m == "not reported"));
    }
}
