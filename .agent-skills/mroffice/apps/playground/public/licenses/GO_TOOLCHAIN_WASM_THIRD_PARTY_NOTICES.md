# Go toolchain WASM third-party notice

`/go-toolchain.wasm` and `/go-wasm-exec.js` are built/copied from the official
Go 1.26.5 toolchain. The browser worker uses the standard library formatter,
parser, and type checker only; it does not execute the user's Go program.

- Upstream: https://go.dev/dl/go1.26.5.darwin-arm64.tar.gz
- Upstream SHA-256: `efb87ff28af9a188d0536ef5d42e63dd52ba8263cd7344a993cc48dd11dedb6a`
- Toolchain: `go version go1.26.5 darwin/arm64`
- WASM target: `GOOS=js GOARCH=wasm`
- Build source: `apps/web/tools/go-toolchain-wasm/main.go`
- Build flags: `-trimpath -ldflags="-s -w -buildid="`
- Emitted WASM SHA-256: `41c675eb2f812e9c96d4131e43ca7b8d5d83ac37c45b1a4f46a5713711c1c08a`
- `wasm_exec.js` SHA-256: `0c949f4996f9a89698e4b5c586de32249c3b69b7baadb64d220073cc04acba14`

## Go license

Copyright 2009 The Go Authors.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.
* Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.
* Neither the name of Google LLC nor the names of its contributors may be used
  to endorse or promote products derived from this software without specific
  prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
