# Shell WebAssembly third-party notice

MRNote's browser-local Shell execution uses a reproducible build of:

- Version: `0.16.0`
- Upstream commit: `667acb8a0beae2a0b01b1d6e207c7399b78e84a9`
- Upstream: <https://github.com/everruns/bashkit>
- Build toolchain: Rust `1.95.0`, `wasm32-unknown-unknown`,
  wasm-bindgen CLI `0.2.126`, wasm-opt `-Oz`
- Shipped WASM SHA-256: `ab9f7bda78c55e2b5afe2c1295244b951a79deef13fa07b93139579d0af52aed`
- Deterministically hardened WASM SHA-256: `72a44b8b85213a2ec6a4789559a990c8fc4bcbde21afa7a456a99f8b2964e919`
- Declared license: MIT

MRNote applies one source-level hardening patch: variable, array, and function
count limits are made unreachable behind the physical WebAssembly maximum.
Upstream v0.16 otherwise drops values at those advisory limits while returning
exit status 0. Real verification preserves 2,001 functions, 12,001 variables,
and 100,001 array entries.

Before instantiation, MRNote verifies the rebuilt asset and adds a 64 MiB
physical maximum to its otherwise-unbounded WebAssembly memory. The transformed
module is verified against the hardened digest above. It registers no custom
JavaScript builtins and no host filesystem, and does not enable optional
network, host-process, or embedded-language features. Upstream notices are at
<https://github.com/everruns/bashkit/tree/main/THIRD_PARTY_LICENSES>.

## MIT License

Copyright (c) 2024-2026 Everruns

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
