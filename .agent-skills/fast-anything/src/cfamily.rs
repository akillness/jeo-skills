//! C and C++ backend: apps built with gcc or clang, e.g.  clang -O2 main.c fuzzy.c  (app arguments
//! after a second --). fast-anything builds the binary itself into .fast/bin. Profiled with a
//! one-line timer per function for one run, read with a small declaration parser, and bridged with
//! a block appended to the source file that loads the port with LoadLibrary or dlopen.

use crate::backend::{self, Lang, Profile, Recording};
use crate::hotspot::{Hotspot, Param};
use crate::native::{self, Flavor, Patches};
use crate::python::DISABLE_ENV;
use crate::state::{Ctx, Port, Verify};
use crate::util::{self, combined, output, tail};
use anyhow::{Context, Result, ensure};
use serde_json::Value;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

const PROF_H: &str = include_str!("cfamily/prof.h");
const PROF_C: &str = include_str!("cfamily/prof.c");
const CLOCK_H: &str = include_str!("cfamily/clock.h");
const REC_H: &str = include_str!("cfamily/rec.h");
const REC_C: &str = include_str!("cfamily/rec.c");
const REC_HPP: &str = include_str!("cfamily/rec.hpp");
const JSON_HPP: &str = include_str!("cfamily/json.hpp");

/// Intel oneAPI: icx (C, clang-based), icpx and dpcpp (C++). icx-cl takes MSVC-style flags, so it isn't listed.
const C_COMPILERS: &[&str] = &["gcc", "clang", "cc", "icx"];
const CPP_COMPILERS: &[&str] = &["g++", "clang++", "c++", "icpx", "dpcpp"];
const C_EXT: &[&str] = &["c"];
const CPP_EXT: &[&str] = &["cc", "cpp", "cxx", "c++", "C"];
/// Compiler flags whose value is the next argument.
const VALUE_FLAGS: &[&str] =
    &["-o", "-I", "-D", "-U", "-include", "-isystem", "-L", "-l", "-x", "-MF", "-MT", "-target"];

fn base_name(program: &str) -> String {
    // gcc-14, clang-19, x86_64-linux-gnu-g++ ...
    let stem = util::program_stem(program);
    stem.rsplit('-').find(|p| !p.chars().all(|c| c.is_ascii_digit() || c == '.')).unwrap_or(&stem).to_string()
}

pub fn detect(program: &str) -> Option<Lang> {
    let b = base_name(program);
    if CPP_COMPILERS.contains(&b.as_str()) {
        Some(Lang::Cpp)
    } else if C_COMPILERS.contains(&b.as_str()) {
        Some(Lang::C)
    } else {
        None
    }
}

/// A C compiler given C++ sources still builds C++.
pub fn refine(lang: Lang, args: &[String]) -> Lang {
    if lang == Lang::C && Build::parse(args).is_ok_and(|b| b.sources.iter().any(|s| is_cpp_file(s))) {
        Lang::Cpp
    } else {
        lang
    }
}

fn is_cpp_file(path: &str) -> bool {
    Path::new(path).extension().is_some_and(|e| CPP_EXT.contains(&e.to_string_lossy().as_ref()))
}

pub fn resolve(program: &str, root: &Path) -> Result<String> {
    let prog = if program.contains(['/', '\\']) { root.join(program) } else { PathBuf::from(program) };
    let out = output(Command::new(&prog).arg("--version").current_dir(root), program)?;
    ensure!(out.status.success(), "{program} failed:\n{}", tail(&combined(&out), 5));
    Ok(prog.to_string_lossy().into_owned())
}

/// compiler [flags] sources... [-o out] [-- app args]
struct Build {
    flags: Vec<String>,
    sources: Vec<String>,
    args: Vec<String>,
}

impl Build {
    fn parse(args: &[String]) -> Result<Build> {
        let (compile, app) = match args.iter().position(|a| a == "--") {
            Some(i) => (&args[..i], args[i + 1..].to_vec()),
            None => (args, Vec::new()),
        };
        let (mut flags, mut sources) = (Vec::new(), Vec::new());
        let mut i = 0;
        while i < compile.len() {
            let a = &compile[i];
            if a == "-o" {
                i += 2;
                continue;
            }
            let ext = Path::new(a).extension().map(|e| e.to_string_lossy().into_owned()).unwrap_or_default();
            if !a.starts_with('-') && (C_EXT.contains(&ext.as_str()) || CPP_EXT.contains(&ext.as_str())) {
                sources.push(a.clone());
            } else {
                flags.push(a.clone());
                if VALUE_FLAGS.contains(&a.as_str()) && i + 1 < compile.len() {
                    flags.push(compile[i + 1].clone());
                    i += 1;
                }
            }
            i += 1;
        }
        ensure!(
            !sources.is_empty(),
            "give the sources to compile:  fast-anything scan -- clang -O2 main.c fuzzy.c  (app arguments after a second --)"
        );
        Ok(Build { flags, sources, args: app })
    }
}

fn binary(ctx: &Ctx) -> PathBuf {
    ctx.fast.join("bin").join(if cfg!(windows) { "app.exe" } else { "app" })
}

/// Copies the runtime files into .fast/cfa and returns that folder.
fn runtime_dir(ctx: &Ctx) -> Result<PathBuf> {
    let dir = ctx.fast.join("cfa");
    fs::create_dir_all(&dir)?;
    for (name, text) in [
        ("fa_prof.h", PROF_H.to_string()),
        ("fa_clock.h", CLOCK_H.to_string()),
        ("fa_rec.h", REC_H.to_string()),
        ("fa_rec.hpp", REC_HPP.replace("/*JSON*/", JSON_HPP)),
    ] {
        fs::write(dir.join(name), text)?;
    }
    Ok(dir)
}

fn compile(ctx: &Ctx, cc: &str, b: &Build, extra: &[PathBuf], include: Option<&Path>) -> Result<PathBuf> {
    let bin = binary(ctx);
    fs::create_dir_all(bin.parent().context("bin")?)?;
    let mut cmd = Command::new(cc);
    cmd.args(&b.flags).args(&b.sources).args(extra).current_dir(&ctx.root).arg("-o").arg(&bin);
    if let Some(h) = include {
        cmd.arg("-include").arg(h);
    }
    let out = output(&mut cmd, cc)?;
    ensure!(out.status.success(), "building the app failed:\n{}", errors_first(&combined(&out)));
    Ok(bin)
}

/// Compiler output with the error lines (and a few after each) first: warnings can bury them.
fn errors_first(log: &str) -> String {
    let lines: Vec<&str> = log.lines().collect();
    let mut keep = Vec::new();
    for (i, l) in lines.iter().enumerate() {
        if l.contains("error") && !l.contains("warning") {
            keep.extend(lines[i..(i + 4).min(lines.len())].iter().copied());
        }
    }
    if keep.is_empty() { tail(log, 30) } else { keep.into_iter().take(40).collect::<Vec<_>>().join("\n") }
}

fn run(ctx: &Ctx, bin: &Path, b: &Build, env: &[(&str, &Path)], derive: bool) -> Result<std::process::Output> {
    let mut cmd = Command::new(bin);
    cmd.args(&b.args).current_dir(&ctx.root).env(DISABLE_ENV, "1").stdin(Stdio::null());
    for (k, v) in env {
        cmd.env(k, v);
    }
    if !derive {
        cmd.env("FAST_ANYTHING_RECORD_DERIVE", "0");
    }
    output(&mut cmd, "the app")
}

pub fn bench_command(ctx: &Ctx, cc: &str) -> Result<(String, Vec<String>)> {
    let b = Build::parse(&ctx.state.command[1..])?;
    let bin = compile(ctx, cc, &b, &[], None)?;
    Ok((bin.to_string_lossy().into_owned(), b.args))
}

// ------------------------------------------------------------------ reading the source

/// The source with comments, string and character literals and preprocessor lines blanked out
/// (same length, newlines kept), so braces and parentheses can be counted.
fn blank(src: &str) -> String {
    let b = src.as_bytes();
    let mut out = b.to_vec();
    let mut i = 0;
    let mut line_start = true;
    let wipe = |out: &mut Vec<u8>, from: usize, to: usize| {
        for c in &mut out[from..to] {
            if *c != b'\n' {
                *c = b' ';
            }
        }
    };
    while i < b.len() {
        let c = b[i];
        if line_start && c == b'#' {
            let start = i;
            while i < b.len() && !(b[i] == b'\n' && b[i - 1] != b'\\') {
                i += 1;
            }
            wipe(&mut out, start, i);
            continue;
        }
        if c == b'\n' {
            line_start = true;
            i += 1;
            continue;
        }
        if !c.is_ascii_whitespace() {
            line_start = false;
        }
        if c == b'/' && b.get(i + 1) == Some(&b'/') {
            let start = i;
            while i < b.len() && b[i] != b'\n' {
                i += 1;
            }
            wipe(&mut out, start, i);
        } else if c == b'/' && b.get(i + 1) == Some(&b'*') {
            let start = i;
            i += 2;
            while i + 1 < b.len() && !(b[i] == b'*' && b[i + 1] == b'/') {
                i += 1;
            }
            i = (i + 2).min(b.len());
            wipe(&mut out, start, i);
        } else if c == b'"' || c == b'\'' {
            let start = i;
            i += 1;
            while i < b.len() && b[i] != c && b[i] != b'\n' {
                i += if b[i] == b'\\' { 2 } else { 1 };
            }
            i = (i + 1).min(b.len());
            wipe(&mut out, start + 1, i.saturating_sub(1).max(start + 1));
        } else {
            i += 1;
        }
    }
    String::from_utf8(out).unwrap_or_default()
}

fn words(s: &str) -> impl Iterator<Item = &str> {
    s.split(|c: char| !(c.is_alphanumeric() || c == '_')).filter(|w| !w.is_empty())
}

const SPECIFIERS: &[&str] = &[
    "static",
    "inline",
    "extern",
    "constexpr",
    "consteval",
    "virtual",
    "explicit",
    "friend",
    "__inline",
    "__forceinline",
    "register",
];
const KEYWORDS: &[&str] = &[
    "if",
    "for",
    "while",
    "switch",
    "catch",
    "return",
    "sizeof",
    "else",
    "do",
    "case",
    "new",
    "delete",
    "throw",
    "alignof",
    "decltype",
    "static_assert",
    "defined",
];
const IO: &[&str] = &[
    "printf", "fprintf", "puts", "fputs", "putchar", "fputc", "fwrite", "fread", "fopen", "fclose", "fgets", "fgetc",
    "getchar", "scanf", "fscanf", "perror", "system", "exit", "abort", "getline", "cout", "cerr", "cin", "clog",
    "ofstream", "ifstream", "fstream", "sleep", "usleep", "Sleep", "remove", "rename", "getenv", "open", "read",
    "write", "close", "send", "recv", "socket", "thread", "async",
];
const NONDET: &[&str] = &[
    "rand",
    "srand",
    "random",
    "time",
    "clock",
    "random_device",
    "system_clock",
    "steady_clock",
    "high_resolution_clock",
    "mt19937",
    "default_random_engine",
];

#[derive(Debug, Clone)]
struct CFunc {
    name: String,
    namespaces: Vec<String>,
    class: Option<String>,
    is_static: bool,
    template: bool,
    body_open: usize,
    body_close: usize,
    params: Vec<Param>,
    ret: String,
}

#[derive(Debug)]
enum Scope {
    Namespace(String),
    Transparent,
    Class(String),
    Body(usize),
    Other,
}

fn match_back(s: &[u8], close: usize, open: u8, shut: u8) -> Option<usize> {
    let mut depth = 0i32;
    let mut i = close as isize;
    while i >= 0 {
        let c = s[i as usize];
        if c == shut {
            depth += 1;
        } else if c == open {
            depth -= 1;
            if depth == 0 {
                return Some(i as usize);
            }
        }
        i -= 1;
    }
    None
}

fn split_top(s: &str, sep: u8) -> Vec<&str> {
    let b = s.as_bytes();
    let (mut depth, mut start, mut out) = (0i32, 0, Vec::new());
    for (i, &c) in b.iter().enumerate() {
        match c {
            b'(' | b'<' | b'[' | b'{' => depth += 1,
            b')' | b'>' | b']' | b'}' => depth -= 1,
            _ if c == sep && depth == 0 => {
                out.push(&s[start..i]);
                start = i + 1;
            }
            _ => {}
        }
    }
    out.push(&s[start..]);
    out
}

fn squash(s: &str) -> String {
    s.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .replace(" *", "*")
        .replace("* ", "*")
        .replace(" &", "&")
        .replace("& ", "&")
        .replace("< ", "<")
        .replace(" >", ">")
        .replace(", ", ",")
}

fn parse_params(list: &str) -> Vec<Param> {
    let list = list.trim();
    if list.is_empty() || list == "void" {
        return vec![];
    }
    split_top(list, b',')
        .into_iter()
        .map(|p| {
            let mut parts = split_top(p, b'=').into_iter();
            let decl = parts.next().unwrap_or_default().trim();
            let default = parts.next().map(|d| d.trim().to_string());
            let (decl, array) = match decl.strip_suffix(']').and_then(|d| d.rfind('[').map(|i| &d[..i])) {
                Some(d) => (d.trim_end(), true),
                None => (decl, false),
            };
            let name_start = decl.rfind(|c: char| !(c.is_alphanumeric() || c == '_')).map(|i| i + 1).unwrap_or(0);
            let (ty, name) = (decl[..name_start].trim(), &decl[name_start..]);
            let (ty, name) = if ty.is_empty() || ty.ends_with("::") { (decl, "") } else { (ty, name) };
            let ty = if array { format!("{}*", ty.trim()) } else { ty.to_string() };
            Param { name: name.to_string(), annotation: Some(squash(&ty)), default, kwonly: false }
        })
        .collect()
}

fn parse(src: &str) -> Vec<CFunc> {
    let text = blank(src);
    let b = text.as_bytes();
    let mut stack: Vec<Scope> = Vec::new();
    let mut stmt = 0usize;
    let mut found: Vec<CFunc> = Vec::new();
    let decl_scope = |stack: &Vec<Scope>| {
        stack.iter().all(|s| matches!(s, Scope::Namespace(_) | Scope::Transparent | Scope::Class(_)))
    };
    for i in 0..b.len() {
        match b[i] {
            b'{' => {
                if !decl_scope(&stack) {
                    stack.push(Scope::Other);
                    continue;
                }
                let head = text[stmt..i].trim();
                let w: Vec<&str> = words(head).collect();
                let scope = if w.first() == Some(&"namespace") {
                    Scope::Namespace(w.get(1).map(|s| s.to_string()).unwrap_or_default())
                } else if w == ["extern"] {
                    Scope::Transparent
                } else if let Some(k) = w
                    .iter()
                    .position(|x| ["class", "struct", "union"].contains(x))
                    .filter(|_| !head.contains('(') && !head.contains('='))
                {
                    if w.get(k).is_some_and(|x| *x == "union") {
                        Scope::Other
                    } else {
                        Scope::Class(w.get(k + 1).map(|s| s.to_string()).unwrap_or_default())
                    }
                } else if let Some(f) = function_head(head, i, &stack) {
                    found.push(f);
                    Scope::Body(found.len() - 1)
                } else {
                    Scope::Other
                };
                stack.push(scope);
                stmt = i + 1;
            }
            b'}' => {
                if let Some(Scope::Body(k)) = stack.pop() {
                    found[k].body_close = i;
                }
                if decl_scope(&stack) {
                    stmt = i + 1;
                }
            }
            b';' if decl_scope(&stack) => stmt = i + 1,
            b':' if decl_scope(&stack) && b.get(i + 1) != Some(&b':') && i > 0 && b[i - 1] != b':' => {
                let head = text[stmt..i].trim();
                if ["public", "private", "protected"].contains(&head) {
                    stmt = i + 1;
                }
            }
            _ => {}
        }
    }
    found.retain(|f| f.body_close > f.body_open);
    found
}

fn function_head(head: &str, brace: usize, stack: &[Scope]) -> Option<CFunc> {
    let hb = head.as_bytes();
    let close = head.rfind(')')?;
    let after = &head[close + 1..];
    if !words(after).all(|w| ["const", "noexcept", "override", "final", "mutable"].contains(&w))
        || after.contains("->")
        || after.contains(':')
    {
        return None;
    }
    let open = match_back(hb, close, b'(', b')')?;
    let before = head[..open].trim_end();
    let name_start =
        before.rfind(|c: char| !(c.is_alphanumeric() || c == '_' || c == ':' || c == '~')).map(|i| i + 1).unwrap_or(0);
    let name = &before[name_start..];
    let prefix = before[..name_start].trim();
    if name.is_empty()
        || prefix.is_empty()
        || KEYWORDS.contains(&name)
        || name.contains("operator")
        || name.contains('~')
    {
        return None;
    }
    let template = prefix.starts_with("template");
    let is_static = words(prefix).any(|w| w == "static");
    let mut ret = prefix.to_string();
    if template && let Some(gt) = ret.find('>') {
        ret = ret[gt + 1..].to_string();
    }
    let ret = squash(&words_except(&ret, SPECIFIERS));
    let namespaces =
        stack.iter().filter_map(|s| if let Scope::Namespace(n) = s { Some(n.clone()) } else { None }).collect();
    let class = stack.iter().rev().find_map(|s| if let Scope::Class(n) = s { Some(n.clone()) } else { None });
    Some(CFunc {
        name: name.to_string(),
        namespaces,
        class,
        is_static,
        template,
        body_open: brace,
        body_close: 0,
        params: parse_params(&head[open + 1..close]),
        ret,
    })
}

/// Removes whole words (specifiers, attributes) from a declaration, keeping everything else.
fn words_except(s: &str, drop: &[&str]) -> String {
    let mut out = String::new();
    let mut word = String::new();
    let flush = |word: &mut String, out: &mut String| {
        if !drop.contains(&word.as_str()) {
            out.push_str(word);
        }
        word.clear();
    };
    for c in s.chars() {
        if c.is_alphanumeric() || c == '_' {
            word.push(c);
        } else {
            flush(&mut word, &mut out);
            out.push(c);
        }
    }
    flush(&mut word, &mut out);
    let out = out.trim().to_string();
    // [[nodiscard]] and __attribute__((...))
    let mut cleaned = out.clone();
    while let Some(a) = cleaned.find("[[") {
        let Some(z) = cleaned[a..].find("]]") else { break };
        cleaned.replace_range(a..a + z + 2, "");
    }
    while let Some(a) = cleaned.find("__attribute__") {
        let rest = &cleaned[a..];
        let Some(open) = rest.find('(') else { break };
        let Some(close) = match_forward(rest.as_bytes(), open) else { break };
        cleaned.replace_range(a..a + close + 1, "");
    }
    cleaned.trim().to_string()
}

fn match_forward(s: &[u8], open: usize) -> Option<usize> {
    let mut depth = 0;
    for (i, &c) in s.iter().enumerate().skip(open) {
        if c == b'(' {
            depth += 1;
        } else if c == b')' {
            depth -= 1;
            if depth == 0 {
                return Some(i);
            }
        }
    }
    None
}

// ------------------------------------------------------------------ types

#[derive(Debug, Clone, Copy, PartialEq)]
enum Scalar {
    Int { signed: bool, rust: &'static str },
    Float(&'static str),
    Bool,
}

fn scalar(t: &str) -> Option<Scalar> {
    let t = squash(t).replace("const ", "").replace("std::", "");
    let t = t.trim();
    let int = |signed, rust| Some(Scalar::Int { signed, rust });
    match t {
        "char" | "signed char" | "int8_t" => int(true, "i8"),
        "unsigned char" | "uint8_t" => int(false, "u8"),
        "short" | "short int" | "signed short" | "int16_t" => int(true, "i16"),
        "unsigned short" | "unsigned short int" | "uint16_t" => int(false, "u16"),
        "int" | "signed" | "signed int" | "int32_t" => int(true, "i32"),
        "unsigned" | "unsigned int" | "uint32_t" => int(false, "u32"),
        "long" | "long int" | "long long" | "long long int" | "int64_t" | "ssize_t" | "ptrdiff_t" | "intptr_t" => {
            int(true, "i64")
        }
        "unsigned long"
        | "unsigned long int"
        | "unsigned long long"
        | "unsigned long long int"
        | "uint64_t"
        | "size_t"
        | "uintptr_t" => int(false, "u64"),
        "float" => Some(Scalar::Float("f32")),
        "double" | "long double" => Some(Scalar::Float("f64")),
        "bool" | "_Bool" => Some(Scalar::Bool),
        _ => None,
    }
}

/// What a C parameter is to the recorder and the bridge.
#[derive(Debug, Clone, PartialEq)]
enum CKind {
    Scalar(Scalar),
    Str,
    /// const T* data whose length is the parameter at this index
    Array(Scalar, usize),
    Len,
}

fn c_kinds(params: &[Param]) -> std::result::Result<Vec<CKind>, String> {
    let mut kinds: Vec<Option<CKind>> = vec![None; params.len()];
    for (i, p) in params.iter().enumerate() {
        let t = squash(p.annotation.as_deref().unwrap_or(""));
        if kinds[i].is_some() {
            continue;
        }
        if let Some(s) = scalar(&t) {
            kinds[i] = Some(CKind::Scalar(s));
        } else if t == "const char*" || t == "char const*" {
            kinds[i] = Some(CKind::Str);
        } else if let Some(inner) = t.strip_suffix('*').filter(|_| t.starts_with("const ") || t.contains(" const*")) {
            let inner = inner.replace("const", "");
            let s = scalar(&inner).ok_or_else(|| format!("takes a {t}"))?;
            let len = params.get(i + 1).and_then(|n| scalar(n.annotation.as_deref().unwrap_or("")));
            ensure_len(len, &t)?;
            kinds[i] = Some(CKind::Array(s, i + 1));
            kinds[i + 1] = Some(CKind::Len);
        } else if t.ends_with('*') {
            return Err(format!("takes a pointer it may write through ({t})"));
        } else {
            return Err(format!("takes a {t}"));
        }
    }
    Ok(kinds.into_iter().map(|k| k.unwrap_or(CKind::Len)).collect())
}

fn ensure_len(len: Option<Scalar>, t: &str) -> std::result::Result<(), String> {
    match len {
        Some(Scalar::Int { .. }) => Ok(()),
        _ => Err(format!("takes a {t} without a length right after it")),
    }
}

/// C++ types fast-anything can carry across: scalars, std::string, vector, array, map/unordered_map
/// with string keys and pair, by value or const reference.
fn cpp_rust_type(t: &str) -> Option<String> {
    let t = squash(t);
    let t = t.trim().trim_start_matches("const ").trim_end_matches('&').trim();
    let t = t.strip_suffix(" const").unwrap_or(t).trim();
    if let Some(s) = scalar(t) {
        return Some(scalar_rust(s).into());
    }
    let t = t.strip_prefix("std::").unwrap_or(t);
    if t == "string" || t == "const char*" {
        return Some("String".into());
    }
    let (raw, inner) = t.strip_suffix('>')?.split_once('<')?;
    let args = split_top(inner, b',');
    Some(match (raw, args.as_slice()) {
        ("vector", [x, ..]) => format!("Vec<{}>", cpp_rust_type(x)?),
        ("array", [x, n]) => format!("[{}; {}]", cpp_rust_type(x)?, n.trim().parse::<usize>().ok()?),
        ("map", [k, v, ..]) if cpp_rust_type(k)? == "String" => {
            format!("std::collections::BTreeMap<String, {}>", cpp_rust_type(v)?)
        }
        ("unordered_map", [k, v, ..]) if cpp_rust_type(k)? == "String" => {
            format!("std::collections::HashMap<String, {}>", cpp_rust_type(v)?)
        }
        ("pair", [a, b]) => format!("({}, {})", cpp_rust_type(a)?, cpp_rust_type(b)?),
        _ => return None,
    })
}

fn scalar_rust(s: Scalar) -> &'static str {
    match s {
        Scalar::Int { rust, .. } | Scalar::Float(rust) => rust,
        Scalar::Bool => "bool",
    }
}

pub fn rust_type_c(t: &str) -> Option<String> {
    let t = squash(t);
    if let Some(s) = scalar(&t) {
        return Some(scalar_rust(s).into());
    }
    if t == "const char*" {
        return Some("String".into());
    }
    let inner = t.strip_suffix('*')?.replace("const", "");
    Some(format!("Vec<{}>", scalar_rust(scalar(&inner)?)))
}

fn blockers(f: &CFunc, body: &str, cpp: bool, funcs: &[CFunc]) -> (Vec<String>, Vec<String>, Vec<String>) {
    let mut blockers = Vec::new();
    let mut warnings = Vec::new();
    if f.class.is_some() && !f.is_static {
        blockers.push("instance method (static methods and free functions only for now)".into());
    }
    if f.name.contains("::") {
        blockers.push("method defined outside its class".into());
    }
    if f.template {
        blockers.push("template".into());
    }
    if f.name == "main" {
        blockers.push("the entry point".into());
    }
    if f.params.iter().any(|p| p.name.is_empty()) {
        blockers.push("has unnamed parameters".into());
    }
    if cpp {
        for p in &f.params {
            let t = p.annotation.clone().unwrap_or_default();
            if (t.ends_with('&') && !t.starts_with("const")) || t.ends_with("&&") {
                blockers.push(format!("takes a non-const reference ({t})"));
            } else if cpp_rust_type(&t).is_none() {
                blockers.push(format!("takes a {t}"));
            }
        }
        if f.ret == "void" {
            blockers.push("returns nothing (void)".into());
        } else if f.ret.ends_with('&') || f.ret.ends_with('*') || cpp_rust_type(&f.ret).is_none() {
            blockers.push(format!("returns a {}", f.ret));
        }
    } else {
        if let Err(e) = c_kinds(&f.params) {
            blockers.push(e);
        }
        if f.ret == "void" {
            blockers.push("returns nothing (void)".into());
        } else if scalar(&f.ret).is_none() {
            blockers.push(format!("returns a {} (C ports return numbers or bools for now)", f.ret));
        }
    }
    let b = body.as_bytes();
    let (mut io, mut nondet, mut helpers) = (Vec::new(), Vec::new(), Vec::new());
    let mut statics = false;
    let mut i = 0;
    while i < b.len() {
        if b[i].is_ascii_alphabetic() || b[i] == b'_' {
            let start = i;
            while i < b.len() && (b[i].is_ascii_alphanumeric() || b[i] == b'_') {
                i += 1;
            }
            let w = &body[start..i];
            let member = start >= 1 && (b[start - 1] == b'.' || (start >= 2 && &body[start - 2..start] == "->"));
            let mut j = i;
            while j < b.len() && b[j] == b' ' {
                j += 1;
            }
            let call = b.get(j) == Some(&b'(');
            if w == "static" {
                statics = true;
            }
            if !member
                && IO.contains(&w)
                && (call || ["cout", "cerr", "cin", "clog", "ofstream", "ifstream", "fstream", "thread"].contains(&w))
            {
                io.push(w.to_string());
            }
            if !member && NONDET.contains(&w) {
                nondet.push(w.to_string());
            }
            if !member && call && w != f.name && funcs.iter().any(|g| g.name == w && g.class == f.class) {
                helpers.push(w.to_string());
            }
        } else {
            i += 1;
        }
    }
    io.dedup();
    nondet.dedup();
    helpers.sort();
    helpers.dedup();
    if !io.is_empty() {
        blockers.push(format!("does I/O: {}", io.iter().take(3).cloned().collect::<Vec<_>>().join(", ")));
    }
    if !nondet.is_empty() {
        blockers.push(format!("not deterministic: {}", nondet.iter().take(3).cloned().collect::<Vec<_>>().join(", ")));
    }
    if statics {
        blockers.push("keeps static variables".into());
    }
    if !helpers.is_empty() {
        warnings.push(format!(
            "calls {}, they get ported together with it",
            helpers.iter().take(3).cloned().collect::<Vec<_>>().join(", ")
        ));
    }
    (blockers, warnings, helpers)
}

struct Described {
    path: PathBuf,
    f: CFunc,
    hs: Hotspot,
}

fn line_of(src: &str, offset: usize) -> u32 {
    src[..offset.min(src.len())].bytes().filter(|&c| c == b'\n').count() as u32 + 1
}

fn describe(ctx: &Ctx, b: &Build, lang: Lang) -> Result<Vec<Described>> {
    let mut out = Vec::new();
    for s in &b.sources {
        let path = util::absolute(&ctx.root.join(s));
        let src = fs::read_to_string(&path).with_context(|| format!("reading {s}"))?;
        let cpp = lang == Lang::Cpp || is_cpp_file(s);
        let funcs = parse(&src);
        let text = blank(&src);
        let file = util::forward_slashes(path.strip_prefix(&ctx.root).unwrap_or(&path));
        let module = file.rsplit_once('.').map(|(m, _)| m).unwrap_or(&file).replace('/', ".");
        for f in &funcs {
            let body = &text[f.body_open + 1..f.body_close];
            let (blockers, warnings, calls) = blockers(f, body, cpp, &funcs);
            // the declaration starts at the line of its return type
            let decl_start = src[..f.body_open]
                .rfind(&f.ret.split_whitespace().next().unwrap_or(&f.name).to_string())
                .unwrap_or(f.body_open);
            let line = line_of(&src, decl_start.min(f.body_open));
            let mut qual: Vec<String> = f.namespaces.iter().filter(|n| !n.is_empty()).cloned().collect();
            qual.extend(f.class.clone());
            qual.push(f.name.clone());
            let hs = Hotspot {
                file: file.clone(),
                line,
                end_line: line_of(&src, f.body_close),
                name: f.name.clone(),
                qualname: qual.join("."),
                module: Some(module.clone()),
                kind: "function".into(),
                portability: if blockers.is_empty() { 0.9 } else { 0.0 },
                blockers,
                warnings,
                params: f.params.clone(),
                returns: Some(f.ret.clone()),
                source: src[src[..f.body_open].rfind(['\n', ';', '}']).map(|i| i + 1).unwrap_or(0)..=f.body_close]
                    .trim()
                    .replace('\r', ""),
                calls,
                owner: f.class.clone(),
                ..Hotspot::default()
            };
            out.push(Described { path: path.clone(), f: f.clone(), hs });
        }
    }
    Ok(out)
}

fn insert_at(text: &str, mut at: Vec<(usize, String)>) -> String {
    at.sort_by_key(|a| std::cmp::Reverse(a.0));
    let mut out = text.to_string();
    for (offset, piece) in at {
        out.insert_str(offset, &piece);
    }
    out
}

/// The build with one runtime source added, written in the language the compiler builds.
fn runtime_source(dir: &Path, name: &str, text: &str, lang: Lang) -> Result<PathBuf> {
    let path = dir.join(format!("{name}.{}", if lang == Lang::Cpp { "cpp" } else { "c" }));
    fs::write(&path, text)?;
    Ok(path)
}

pub fn profile(ctx: &Ctx, cc: &str, args: &[String], lang: Lang) -> Result<Profile> {
    let b = Build::parse(args)?;
    let found = describe(ctx, &b, lang)?;
    let dir = runtime_dir(ctx)?;
    let prof_c = runtime_source(&dir, "fa_prof", PROF_C, lang)?;
    let mut by_file: BTreeMap<&Path, Vec<(usize, String)>> = BTreeMap::new();
    for (i, d) in found.iter().enumerate() {
        by_file.entry(&d.path).or_default().push((d.f.body_open + 1, format!(" FA_PROF({i});")));
    }
    let mut patches = Patches::new(ctx)?;
    for (path, at) in by_file {
        let text = fs::read_to_string(path)?;
        patches.write(path, &insert_at(&text, at))?;
    }
    let bin = compile(ctx, cc, &b, &[prof_c], Some(&dir.join("fa_prof.h")));
    patches.restore()?;
    let bin = bin?;
    let out = ctx.fast.join("profile.json");
    let _ = fs::remove_file(&out);
    let ran = run(ctx, &bin, &b, &[("FAST_ANYTHING_PROF_OUT", &out)], true)?;
    ensure!(ran.status.success(), "the app failed ({}):\n{}", ran.status, tail(&combined(&ran), 30));
    let result: Value = serde_json::from_str(
        &fs::read_to_string(&out).context("the profiler wrote nothing: does main return normally?")?,
    )?;
    let wall = result["wall"].as_f64().unwrap_or(0.0);
    let stats = result["stats"].as_object().cloned().unwrap_or_default();
    let stat = |i: usize| stats.get(&i.to_string()).and_then(Value::as_array).cloned();
    let mut functions = Vec::new();
    for (i, d) in found.iter().enumerate() {
        let helper = found
            .iter()
            .enumerate()
            .any(|(j, g)| stat(j).is_some() && g.path == d.path && g.hs.calls.contains(&d.f.name));
        let mut hs = d.hs.clone();
        match stat(i) {
            Some(s) => {
                hs.ncalls = s[0].as_u64().unwrap_or(0);
                hs.tottime = s[1].as_f64().unwrap_or(0.0);
                hs.cumtime = s[2].as_f64().unwrap_or(0.0);
                functions.push(hs);
            }
            None if helper => functions.push(hs),
            None => {}
        }
    }
    Ok(Profile { wall, base: ".".into(), functions })
}

// ------------------------------------------------------------------ recording

fn arg_names(hs: &Hotspot) -> Vec<String> {
    hs.params.iter().map(|p| p.name.clone()).collect()
}

fn c_put(kind: &CKind, name: &str, params: &[Param], sub: Option<(usize, &str)>, idx: usize) -> String {
    let value = |i: usize, n: &str| match sub {
        Some((k, v)) if k == i => v.to_string(),
        _ => n.to_string(),
    };
    let v = value(idx, name);
    match kind {
        CKind::Scalar(Scalar::Int { signed: true, .. }) | CKind::Len => format!("fa_rec_i64((long long) ({v}));"),
        CKind::Scalar(Scalar::Int { signed: false, .. }) => format!("fa_rec_u64((unsigned long long) ({v}));"),
        CKind::Scalar(Scalar::Float(_)) => format!("fa_rec_f64((double) ({v}));"),
        CKind::Scalar(Scalar::Bool) => format!("fa_rec_bool((int) ({v}));"),
        CKind::Str => format!("fa_rec_str({v});"),
        CKind::Array(s, len) => {
            let n = value(*len, &params[*len].name);
            match s {
                Scalar::Float(_) => format!("fa_rec_arr_f64({v}, (size_t) ({n}), (int) sizeof(*({v})));"),
                Scalar::Int { signed, .. } => {
                    format!("fa_rec_arr_i64({v}, (size_t) ({n}), (int) sizeof(*({v})), {});", i32::from(*signed))
                }
                Scalar::Bool => format!("fa_rec_arr_i64({v}, (size_t) ({n}), (int) sizeof(*({v})), 0);"),
            }
        }
    }
}

fn c_suffix(ret: &str) -> &'static str {
    match scalar(ret) {
        Some(Scalar::Int { signed: false, .. }) => "u64",
        Some(Scalar::Int { .. }) => "i64",
        Some(Scalar::Float(_)) => "f64",
        _ => "bool",
    }
}

fn c_cast(ret: &str) -> &'static str {
    match c_suffix(ret) {
        "u64" => "(unsigned long long)",
        "i64" => "(long long)",
        "f64" => "(double)",
        _ => "(int)",
    }
}

fn c_record_prologue(hs: &Hotspot) -> Result<String> {
    let kinds = c_kinds(&hs.params).map_err(anyhow::Error::msg)?;
    let ret = hs.returns.clone().unwrap_or_default();
    let names = arg_names(hs);
    let puts = |sub: Option<(usize, &str)>| -> String {
        kinds
            .iter()
            .enumerate()
            .filter(|(_, k)| **k != CKind::Len)
            .map(|(i, k)| c_put(k, &names[i], &hs.params, sub, i))
            .collect::<Vec<_>>()
            .join(" ")
    };
    let call = |sub: &[(usize, String)]| -> String {
        let args: Vec<String> = names
            .iter()
            .enumerate()
            .map(|(i, n)| sub.iter().find(|(k, _)| *k == i).map(|(_, v)| v.clone()).unwrap_or_else(|| n.clone()))
            .collect();
        format!("{}({})", hs.name, args.join(", "))
    };
    let (sfx, cast) = (c_suffix(&ret), c_cast(&ret));
    let mut derive = String::new();
    for (i, k) in kinds.iter().enumerate() {
        let (len_expr, sub_val, len_sub, free) = match k {
            CKind::Str => (format!("fa_rec_chars({})", names[i]), "fa_s".to_string(), None, "fa_rec_free(fa_s);"),
            CKind::Array(_, len) => {
                (format!("(size_t) ({})", names[*len]), format!("{} + fa_off", names[i]), Some(*len), "")
            }
            _ => continue,
        };
        let mut subs = vec![(i, sub_val.clone())];
        if let Some(l) = len_sub {
            let lt = hs.params[l].annotation.clone().unwrap_or_else(|| "int".into());
            subs.push((l, format!("({lt}) fa_n")));
        }
        let prep = if matches!(k, CKind::Str) {
            format!("char *fa_s = fa_rec_substr({}, fa_off, fa_n); ", names[i])
        } else {
            String::new()
        };
        // fa_rec_begin + puts with the substitutions (puts takes one substitution: arrays put data + len themselves)
        let put_sub = if matches!(k, CKind::Str) { "fa_s".to_string() } else { sub_val.clone() };
        let mut put_line = String::new();
        for (j, kk) in kinds.iter().enumerate() {
            if *kk == CKind::Len {
                continue;
            }
            let p = match kk {
                CKind::Array(s, len) if j == i => {
                    let n = "fa_n";
                    match s {
                        Scalar::Float(_) => {
                            format!("fa_rec_arr_f64({put_sub}, (size_t) {n}, (int) sizeof(*({put_sub})));")
                        }
                        Scalar::Int { signed, .. } => format!(
                            "fa_rec_arr_i64({put_sub}, (size_t) {n}, (int) sizeof(*({put_sub})), {});",
                            i32::from(*signed)
                        ),
                        Scalar::Bool => {
                            format!("fa_rec_arr_i64({put_sub}, (size_t) {n}, (int) sizeof(*({put_sub})), 0);")
                        }
                    }
                    .replace("{len}", &len.to_string())
                }
                _ if j == i => c_put(kk, &names[j], &hs.params, Some((j, &put_sub)), j),
                _ => c_put(kk, &names[j], &hs.params, None, j),
            };
            put_line.push_str(&p);
            put_line.push(' ');
        }
        derive.push_str(&format!(
            "    for (int fa_k = 0; fa_k < 10 && fa_rec_derive_ok(); fa_k++) {{\n        size_t fa_len = {len_expr}, fa_n = (size_t) fa_rec_slices[fa_k];\n        if (fa_len < 2 || fa_n >= fa_len) break;\n        for (int fa_rep = 0; fa_rep < (fa_n < 2 ? 1 : 3); fa_rep++) {{\n            size_t fa_off = fa_rec_rand(fa_len - fa_n + 1);\n            {prep}fa_rec_begin(); {put_line}\n            fa_rec_derived_{sfx}({cast} {call});\n            {free}\n        }}\n    }}\n",
            call = call(&subs),
        ));
    }
    Ok(format!(
        "if (!fa_rec_inside) {{\n    fa_rec_inside = 1;\n    fa_rec_begin(); {puts}\n    long long fa_t0 = fa_rec_now();\n    {ret} fa_r = {call};\n    fa_rec_done_{sfx}({cast} fa_r, fa_rec_now() - fa_t0);\n{derive}    fa_rec_inside = 0;\n    return fa_r;\n}}",
        puts = puts(None),
        call = call(&[]),
    ))
}

fn cpp_record_prologue(hs: &Hotspot) -> String {
    let names = arg_names(hs);
    format!(
        "if (!fa_rec::st().inside) return fa_rec::call([](const auto &...fa_a) {{ return {}(fa_a...); }}{}{});",
        hs.name,
        if names.is_empty() { "" } else { ", " },
        names.join(", ")
    )
}

pub fn record(ctx: &Ctx, cc: &str, args: &[String], hs: &Hotspot, out: &Path, lang: Lang) -> Result<Recording> {
    let b = Build::parse(args)?;
    let found = describe(ctx, &b, lang)?;
    let d = found
        .iter()
        .filter(|d| d.hs.file == hs.file && d.hs.qualname == hs.qualname)
        .min_by_key(|d| (d.hs.line as i64 - hs.line as i64).abs())
        .with_context(|| format!("{} isn't in {} any more: scan again", hs.qualname, hs.file))?;
    let cpp = lang == Lang::Cpp || is_cpp_file(&hs.file);
    let dir = runtime_dir(ctx)?;
    let (prologue, header, extra) = if cpp {
        (cpp_record_prologue(hs), dir.join("fa_rec.hpp"), vec![])
    } else {
        (c_record_prologue(hs)?, dir.join("fa_rec.h"), vec![runtime_source(&dir, "fa_rec", REC_C, lang)?])
    };
    let text = fs::read_to_string(&d.path)?;
    let meta = out.with_extension("meta.json");
    let mut patches = Patches::new(ctx)?;
    patches
        .write(&d.path, &insert_at(&text, vec![(d.f.body_open + 1, format!(" {}", prologue.replace('\n', " ")))]))?;
    let bin = compile(ctx, cc, &b, &extra, Some(&header));
    patches.restore()?;
    let bin = bin?;
    let env = [("FAST_ANYTHING_RECORD_OUT", out), ("FAST_ANYTHING_RECORD_META", meta.as_path())];
    let _ = fs::remove_file(&meta);
    let mut ran = run(ctx, &bin, &b, &env, true)?;
    if !ran.status.success() {
        // A shrunk input crashed the original (C has no exceptions): record without them.
        crate::ui::warn("the app crashed on a shrunk input; recording real calls only");
        ran = run(ctx, &bin, &b, &env, false)?;
    }
    ensure!(ran.status.success(), "the app failed while recording ({}):\n{}", ran.status, tail(&combined(&ran), 30));
    serde_json::from_str(&fs::read_to_string(&meta).context("nothing was recorded: does main return normally?")?)
        .context("reading the recording summary")
}

// ------------------------------------------------------------------ the crate

pub const FLAVOR_C: Flavor = Flavor {
    lang: Lang::C,
    fence: "c",
    rust_type: rust_type_c,
    default_json: |_| None,
    rules: &[
        "C `int` is `i32`, `long` is `i64` here; unsigned types wrap. Use `wrapping_*` where the original can overflow.",
        "A `const T *` followed by a length arrives as a Vec, and the length parameter still arrives on its own.",
        "`const char *` arrives as a UTF-8 String: `strlen` and `s[i]` are bytes, use `as_bytes()` for the same behavior.",
        "Floats: compilers may fuse `a * b + c` into one FMA instruction (clang does on ARM), which rounds differently. If recorded results differ in the last digits, the original was built that way: use `f64::mul_add` there, or build the app with `-ffp-contract=off`.",
        "Returns are numbers or bools. Undefined behavior in the original (overflow of signed ints, out-of-bounds reads) isn't a spec: match the defined cases.",
    ],
};

pub const FLAVOR_CPP: Flavor = Flavor {
    lang: Lang::Cpp,
    fence: "cpp",
    rust_type: cpp_rust_type,
    default_json: |_| None,
    rules: &[
        "`int` is `i32`, `long long`/`int64_t` is `i64`, `size_t` is `u64`; unsigned types wrap. Use `wrapping_*` where the original can overflow.",
        "`std::string` arrives as a UTF-8 String: `size()` and `s[i]` are bytes, use `as_bytes()` for the same behavior.",
        "`std::vector` is Vec, `std::array<T, N>` is `[T; N]`, `std::map<std::string, T>` is BTreeMap (same key order), `std::pair` is a tuple.",
        "Return `Err(message)` where the original throws.",
    ],
};

pub fn scaffold(ctx: &Ctx, hs: &Hotspot, helpers: &[Hotspot], port: &Port) -> Result<String> {
    native::scaffold(ctx, hs, helpers, port, if port.lang == Lang::Cpp { &FLAVOR_CPP } else { &FLAVOR_C })
}

pub fn verify(ctx: &Ctx, port: &Port) -> Result<Verify> {
    native::verify(ctx, port, false)
}

// ------------------------------------------------------------------ the bridge

fn suffix(port: &Port) -> String {
    util::slug(&port.id)
}

fn c_string_literal(s: &str) -> String {
    format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
}

fn param_list(hs: &Hotspot) -> String {
    hs.params
        .iter()
        .map(|p| format!("{} {}", p.annotation.as_deref().unwrap_or("int"), p.name))
        .collect::<Vec<_>>()
        .join(", ")
}

const LOADER: &str = "#ifdef _WIN32\n#ifndef WIN32_LEAN_AND_MEAN\n#define WIN32_LEAN_AND_MEAN\n#endif\n#ifndef NOMINMAX\n#define NOMINMAX\n#endif\n#include <windows.h>\n#define FA_OPEN(p) ((void *) LoadLibraryA(p))\n#define FA_SYM(l, n) ((void *) GetProcAddress((HMODULE) (l), n))\n#else\n#include <dlfcn.h>\n#define FA_OPEN(p) dlopen(p, RTLD_NOW | RTLD_LOCAL)\n#define FA_SYM(l, n) dlsym(l, n)\n#endif";

fn c_bridge(hs: &Hotspot, s: &str, lib: &str) -> Result<String> {
    let kinds = c_kinds(&hs.params).map_err(anyhow::Error::msg)?;
    let ret = hs.returns.clone().unwrap_or_default();
    let mut puts = String::new();
    let mut first = true;
    for (i, k) in kinds.iter().enumerate() {
        if *k == CKind::Len && i > 0 && matches!(kinds[i - 1], CKind::Array(..)) && false {
            continue;
        }
        let n = &hs.params[i].name;
        if !first {
            puts.push_str("    fa_put_S(&b, \",\");\n");
        }
        first = false;
        puts.push_str(&match k {
            CKind::Scalar(Scalar::Int { signed: true, .. }) | CKind::Len => format!("    fa_int_S(&b, (long long) ({n}));\n"),
            CKind::Scalar(Scalar::Int { signed: false, .. }) => format!("    fa_uint_S(&b, (unsigned long long) ({n}));\n"),
            CKind::Scalar(Scalar::Float(_)) => format!("    if (!fa_dbl_S(&b, (double) ({n}))) goto fallback;\n"),
            CKind::Scalar(Scalar::Bool) => format!("    fa_put_S(&b, ({n}) ? \"true\" : \"false\");\n"),
            CKind::Str => format!("    if (!fa_str_S(&b, {n})) goto fallback;\n"),
            CKind::Array(sc, len) => {
                let l = &hs.params[*len].name;
                let item = match sc {
                    Scalar::Float(_) => format!("if (!fa_dbl_S(&b, (double) {n}[fa_i])) goto fallback;"),
                    Scalar::Int { signed: true, .. } => format!("fa_int_S(&b, (long long) {n}[fa_i]);"),
                    Scalar::Int { signed: false, .. } => format!("fa_uint_S(&b, (unsigned long long) {n}[fa_i]);"),
                    Scalar::Bool => format!("fa_put_S(&b, {n}[fa_i] ? \"true\" : \"false\");"),
                };
                format!("    fa_put_S(&b, \"[\");\n    for (size_t fa_i = 0; fa_i < (size_t) ({l}); fa_i++) {{ if (fa_i) fa_put_S(&b, \",\"); {item} }}\n    fa_put_S(&b, \"]\");\n")
            }
        });
    }
    let parse = match scalar(&ret) {
        Some(Scalar::Bool) => "strncmp(ok, \"true\", 4) == 0".to_string(),
        Some(Scalar::Float(_)) => format!("({ret}) strtod(ok, NULL)"),
        Some(Scalar::Int { signed: false, .. }) => format!("({ret}) strtoull(ok, NULL, 10)"),
        _ => format!("({ret}) strtoll(ok, NULL, 10)"),
    };
    let body = format!(
        r#"/* Calls the verified Rust port of {id}. FAST_ANYTHING_DISABLE=1 runs the C version instead. */
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
{loader}
typedef struct {{ char *p; size_t len, cap; }} fa_buf_S;
static unsigned char *(*fa_call_S)(const unsigned char *, size_t, size_t *);
static void (*fa_free_S)(unsigned char *, size_t);
int fa_on_S(void) {{
    static int state = -1;
    if (state < 0) {{
        void *lib = getenv("FAST_ANYTHING_DISABLE") ? NULL : FA_OPEN({lib});
        state = 0;
        if (lib) {{
            *(void **) &fa_call_S = FA_SYM(lib, "fa_call");
            *(void **) &fa_free_S = FA_SYM(lib, "fa_free");
            state = fa_call_S && fa_free_S;
        }}
    }}
    return state;
}}
static void fa_put_S(fa_buf_S *b, const char *s) {{
    size_t n = strlen(s);
    if (b->len + n + 1 > b->cap) {{ b->cap = (b->len + n + 1) * 2; b->p = (char *) realloc(b->p, b->cap); }}
    memcpy(b->p + b->len, s, n + 1);
    b->len += n;
}}
static void fa_int_S(fa_buf_S *b, long long v) {{ char t[32]; snprintf(t, sizeof t, "%lld", v); fa_put_S(b, t); }}
static void fa_uint_S(fa_buf_S *b, unsigned long long v) {{ char t[32]; snprintf(t, sizeof t, "%llu", v); fa_put_S(b, t); }}
static int fa_dbl_S(fa_buf_S *b, double v) {{
    char t[40];
    if (!isfinite(v)) return 0;
    snprintf(t, sizeof t, "%.17g", v);
    fa_put_S(b, t);
    return 1;
}}
static int fa_str_S(fa_buf_S *b, const char *s) {{
    char t[8] = {{0}};
    if (!s) {{ fa_put_S(b, "null"); return 1; }}
    fa_put_S(b, "\"");
    for (; *s; s++) {{
        unsigned char c = (unsigned char) *s;
        if (c == '"' || c == '\\') {{ t[0] = '\\'; t[1] = (char) c; t[2] = 0; }}
        else if (c < 0x20) snprintf(t, sizeof t, "\\u%04x", c);
        else {{ t[0] = (char) c; t[1] = 0; }}
        fa_put_S(b, t);
    }}
    fa_put_S(b, "\"");
    return 1;
}}
/* Sets *fa_ok to 0 (and the C version runs) if the port can't answer. */
{ret} fa_fast_S(int *fa_ok, {params}) {{
    fa_buf_S b = {{0}};
    size_t n = 0;
    unsigned char *out;
    char *text;
    const char *ok;
    {ret} r = 0;
    *fa_ok = 0;
    fa_put_S(&b, "[");
{puts}    fa_put_S(&b, "]");
    out = fa_call_S((const unsigned char *) b.p, b.len, &n);
    text = (char *) malloc(n + 1);
    memcpy(text, out, n);
    text[n] = 0;
    fa_free_S(out, n);
    ok = strstr(text, "\"ok\":");
    if (ok) {{
        ok += 5;
        r = {parse};
        *fa_ok = 1;
    }}
    free(text);
fallback:
    free(b.p);
    return r;
}}"#,
        id = hs.id,
        loader = LOADER,
        params = param_list(hs),
    );
    Ok(body.replace("_S", &format!("_{s}")))
}

fn cpp_bridge(hs: &Hotspot, s: &str, lib: &str, namespaces: &[String]) -> String {
    let ret = hs.returns.clone().unwrap_or_default();
    let open: String = namespaces
        .iter()
        .map(|n| if n.is_empty() { "namespace {\n".to_string() } else { format!("namespace {n} {{\n") })
        .collect();
    let close: String = namespaces.iter().map(|_| "}\n").collect();
    let body = format!(
        r#"// Calls the verified Rust port of {id}. FAST_ANYTHING_DISABLE=1 runs the C++ version instead.
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <map>
#include <stdexcept>
#include <string>
#include <type_traits>
#include <unordered_map>
#include <utility>
#include <vector>
{loader}
namespace fa_bridge_S {{
{json}
struct Lib {{
    unsigned char *(*call)(const unsigned char *, size_t, size_t *) = nullptr;
    void (*free)(unsigned char *, size_t) = nullptr;
    bool on = false;
    Lib() {{
        if (std::getenv("FAST_ANYTHING_DISABLE")) return;
        void *lib = FA_OPEN({lib});
        if (!lib) return;
        *(void **) &call = FA_SYM(lib, "fa_call");
        *(void **) &free = FA_SYM(lib, "fa_free");
        on = call && free;
    }}
}};
inline Lib &lib() {{ static Lib l; return l; }}
}} // namespace fa_bridge_S
{open}bool fa_on_S() {{ return fa_bridge_S::lib().on; }}
bool fa_fast_S({ret} &fa_out, {params}) {{
    std::string in = "[";
    if (!fa_bridge_S::enc_all(in, {args})) return false;
    in += "]";
    size_t n = 0;
    unsigned char *out = fa_bridge_S::lib().call((const unsigned char *) in.data(), in.size(), &n);
    std::string text((const char *) out, n);
    fa_bridge_S::lib().free(out, n);
    const char *p = text.c_str();
    fa_bridge_S::V reply = fa_bridge_S::parse(p);
    if (const fa_bridge_S::V *err = reply.get("error")) throw std::runtime_error("fast-anything: " + err->s);
    const fa_bridge_S::V *ok = reply.get("ok");
    if (!ok) return false;
    fa_bridge_S::from(*ok, fa_out);
    return true;
}}
{close}"#,
        id = hs.id,
        loader = LOADER,
        json = JSON_HPP,
        params = param_list(hs),
        args = arg_names(hs).join(", "),
    );
    body.replace("_S", &format!("_{s}"))
}

fn find_body(name: &str, hint: u32) -> impl Fn(&str) -> Option<usize> {
    let call = format!("{name}(");
    let spaced = format!("{name} (");
    move |text: &str| {
        native::body_line(text, hint, |l| (l.contains(&call) || l.contains(&spaced)) && !l.trim_end().ends_with(';'))
    }
}

pub fn enable(ctx: &Ctx, port: &Port) -> Result<()> {
    let hs = ctx
        .state
        .hotspots
        .iter()
        .find(|h| h.id == port.id)
        .with_context(|| format!("{} isn't in the last scan", port.id))?;
    let file = ctx.root.join(&port.file);
    let text = fs::read_to_string(&file).with_context(|| format!("reading {}", port.file))?;
    let cpp = port.lang == Lang::Cpp || is_cpp_file(&port.file);
    let s = suffix(port);
    let (_, lib) = port.lang.artifact(&port.ext);
    let lib = c_string_literal(&util::forward_slashes(&ctx.lib_dir().join(lib)));
    let ret = hs.returns.clone().unwrap_or_default();
    let args = arg_names(hs).join(", ");
    let (prologue, bridge) = if cpp {
        let namespaces = parse(&text)
            .into_iter()
            .find(|f| f.name == hs.name && f.class == hs.owner)
            .map(|f| f.namespaces)
            .unwrap_or_default();
        (
            format!(
                "bool fa_on_{s}();\nbool fa_fast_{s}({ret} &, {params});\nif (fa_on_{s}()) {{\n    {ret} fa_r{{}};\n    if (fa_fast_{s}(fa_r, {args})) return fa_r;\n}}",
                params = param_list(hs)
            ),
            cpp_bridge(hs, &s, &lib, &namespaces),
        )
    } else {
        (
            format!(
                "int fa_on_{s}(void);\n{ret} fa_fast_{s}(int *, {params});\nif (fa_on_{s}()) {{\n    int fa_ok;\n    {ret} fa_r = fa_fast_{s}(&fa_ok, {args});\n    if (fa_ok) return fa_r;\n}}",
                params = param_list(hs)
            ),
            c_bridge(hs, &s, &lib)?,
        )
    };
    let patched = native::insert_in_body(&text, "//", &port.id, &prologue, find_body(&port.func, port.line.max(1)))?;
    let patched = backend::append_marked(&patched, "//", &format!("{} bridge", port.id), &bridge);
    fs::write(&file, patched).with_context(|| format!("writing {}", port.file))
}

pub fn disable(ctx: &Ctx, port: &Port) -> Result<()> {
    let file = ctx.root.join(&port.file);
    let text = fs::read_to_string(&file).with_context(|| format!("reading {}", port.file))?;
    let text = native::strip_in_body(&text, "//", &port.id);
    let text = backend::strip_marked(&text, "//", &format!("{} bridge", port.id));
    fs::write(&file, text).with_context(|| format!("writing {}", port.file))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_c_and_cpp_functions() {
        let c = "#include <stdio.h>\n/* a { comment */\nstatic int lev(const char *a, const char *b) {\n  return 0;\n}\n\nlong count(const int *xs, size_t n, int max)\n{\n  if (n) { return 1; }\n  printf(\"{\");\n  return 0;\n}\nint main(void) { return lev(\"a\", \"b\"); }\n";
        assert_eq!(detect("icpx"), Some(Lang::Cpp));
        assert_eq!(detect("C:\\oneAPI\\bin\\dpcpp.exe"), Some(Lang::Cpp));
        assert_eq!(detect("icx"), Some(Lang::C));
        assert_eq!(detect("icx-cl"), None);
        let f = parse(c);
        assert_eq!(f.iter().map(|f| f.name.as_str()).collect::<Vec<_>>(), ["lev", "count", "main"]);
        assert_eq!(f[0].ret, "int");
        assert!(f[0].is_static);
        assert_eq!(
            c_kinds(&f[1].params).unwrap(),
            vec![CKind::Array(scalar("int").unwrap(), 1), CKind::Len, CKind::Scalar(scalar("int").unwrap())]
        );
        let cpp = "namespace text {\nclass Fuzzy {\npublic:\n  static std::vector<std::pair<int, int>> find(const std::vector<std::string> &names, int max = 2) {\n    return {};\n  }\n  int size() const { return 0; }\n};\n}\n";
        let f = parse(cpp);
        assert_eq!(f.len(), 2);
        assert_eq!(f[0].class.as_deref(), Some("Fuzzy"));
        assert_eq!(f[0].namespaces, ["text"]);
        assert_eq!(f[0].params[1].default.as_deref(), Some("2"));
        assert_eq!(cpp_rust_type(&f[0].ret).as_deref(), Some("Vec<(i32, i32)>"));
        assert_eq!(cpp_rust_type("const std::vector<std::string>&").as_deref(), Some("Vec<String>"));
        assert_eq!(detect("clang++"), Some(Lang::Cpp));
        assert_eq!(detect("/usr/bin/gcc-14"), Some(Lang::C));
        assert_eq!(detect("clang-cl"), None.or(detect("clang-cl")));
        let b =
            Build::parse(&["-O2".into(), "main.c".into(), "-o".into(), "app".into(), "--".into(), "x".into()]).unwrap();
        assert_eq!(
            (b.flags, b.sources, b.args),
            (vec!["-O2".to_string()], vec!["main.c".to_string()], vec!["x".to_string()])
        );
    }
}
