# Lua browser execution third-party notices

MRNote's browser-local Lua executor is built from the official Lua 5.5.0
source release. The generated worker exposes only the base, coroutine, table,
string, math and UTF-8 libraries plus bounded `io.read`, `io.write`, `print`
and `warn` adapters. Package loading, authored dynamic loaders, the
operating-system, filesystem, debug and dynamic-library APIs are not linked or
opened; coroutine creation inherits the same instruction budget.

## Reproducible inputs

- Source: `https://www.lua.org/ftp/lua-5.5.0.tar.gz`
- Source SHA-256:
  `57ccc32bbbd005cab75bcc52444052535af691789dba2b9016d5c50640d68b3d`
- Base image:
  `node@sha256:03eae3ef7e88a9de535496fb488d67e02b9d96a063a8967bae657744ecd513f2`
- Compiler package: Debian bookworm
  `emscripten=3.1.6~dfsg-5`
- Task-local build image SHA-256:
  `46b04908c664a879ef6d65dcced6cd1411b1ae140e21b18613b3ad0fbf04ea77`
- Public loader mapping: the generated worker's single default
  `lua-execution-worker.wasm` reference is deterministically rewritten to the
  published sibling asset `lua-execution.wasm`.
- Generated worker SHA-256:
  `812b70db68606a3e4e77d7d848640821e2b1bfa54639e427e428ab6027977d08`
- Generated WASM SHA-256:
  `0e7a82c07d90b9ae967a52b1f458400f37c58a9c98a6f7790a4edb0e3b88f8db`

The build uses fixed 64 MiB linear memory, a 1 MiB stack, no memory growth,
no Emscripten filesystem and no dynamic execution. The checked-in source at
`tools/lua-execution-wasm/main.c` is the worker protocol and sandbox policy
boundary used to generate the two public assets. Its dedicated compile request
calls `luaL_loadbufferx` and discards the compiled chunk without `lua_pcall`;
each analysis owns a fresh Worker and cannot execute or mutate authored state.

## Lua license

Copyright © 1994–2025 Lua.org, PUC-Rio.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
