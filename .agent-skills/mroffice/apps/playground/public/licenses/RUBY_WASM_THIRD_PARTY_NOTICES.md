# Ruby browser execution third-party notices

MRNote's browser-local Ruby executor uses the official `ruby.wasm` npm
distribution. The runtime is loaded only inside a dedicated Worker with an
empty environment, an ephemeral in-memory WASI filesystem, bounded standard
input/output, no sockets, and Ruby-to-JavaScript host interop disabled.

## Reproducible inputs

- `@ruby/4.0-wasm-wasi@2.10.1` — MIT; packages CRuby under the Ruby License or
  2-clause BSD terms documented by the upstream binary notice.
- `@ruby/wasm-wasi@2.10.1` — MIT.
- `@bjorn3/browser_wasi_shim@0.4.2` — MIT OR Apache-2.0; MRNote uses it under
  the MIT option.
- Official `ruby+stdlib.wasm` SHA-256:
  `9fe3c749730a16da9b0d1a973bb77bec164f8d958efcb7f5b81e4275ea8c5439`.
- npm package integrity values are locked in both `package-lock.json` and
  `pnpm-lock.yaml`.
- Upstream project and complete binary notices:
  `https://github.com/ruby/ruby.wasm` (`packages/npm-packages/ruby-4.0-wasm-wasi/dist/NOTICE`).
- CRuby source and legal notices: `https://www.ruby-lang.org/` and
  `https://github.com/ruby/ruby` (`COPYING`, `BSDL`, and `LEGAL`).

## ruby.wasm and browser_wasi_shim MIT license

Copyright (c) 2022 Yuta Saito and the respective contributors.

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

## Ruby license

Ruby is copyrighted free software by Yukihiro Matsumoto. Verbatim source
copies may be redistributed with the original notices. Modified or binary
forms may be redistributed under the choices and conditions in CRuby's
`COPYING`, and covered files may alternatively use the 2-clause BSD license.
The full, authoritative `COPYING`, `BSDL`, and per-file `LEGAL` notices are
part of the pinned CRuby/ruby.wasm distribution linked above and govern the
bundled runtime.
