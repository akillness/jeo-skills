# MRAI Docs editor third-party notices

This directory records source-level licence obligations for bounded code
adaptations used by the MRAI Docs editor. It does not change the licence of
MRAI's own code.

## ProseMirror Tables Safari IME workaround

- Project: <https://github.com/ProseMirror/prosemirror-tables>
- Audited upstream commit:
  `7d18c9c4770d426ce3130dff864ce4bf53ee37db`
- Upstream parent:
  `67371611fa9964c20d7d8be741f88ea8b3c24900`
- Source file referenced: `src/supportSafariIME.ts`
- Copyright: 2015-2016 Marijn Haverbeke and others
- Licence: MIT; see `prosemirror-tables-MIT.txt`
- Upstream root NOTICE: none at the audited commit
- Package tier: open-source core; no Pro, Enterprise, or commercial package
  source was used
- Adoption mode: PORT

MRAI ports only the bounded use of a ProseMirror view widget containing a
zero-width space to avoid Safari duplicating Latin IME pre-edit text in an
otherwise empty nested editable container. MRAI's implementation is rewritten
for the structural Docs `pageBlock`, scopes the widget to the selected empty
text block, retains it only through composition settlement, supports multiple
editor views, and keeps it out of the document model, Undo history, autosave,
and export. No upstream table-selection, table-mutation, keyboard-blocking, UI,
branding, or sample code is included.

## Sparse DOCX streaming dependencies

The large-table DOCX bridge adopts the following packages through their public
package APIs. No upstream source is copied into MRAI.

### saxes 6.0.0

- Project: <https://github.com/lddubeau/saxes>
- Audited upstream tag/commit: `v6.0.0` /
  `211fa0ebec9b628affc09219199639887174bfc3`
- Package tier: open-source core
- Adoption mode: ADOPT
- Licence: ISC
- Copyright: Contributors; sax lineage copyright Isaac Z. Schlueter and
  Contributors
- Upstream NOTICE: none published for this release

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.

The saxes root licence also records historical `String.fromCodePoint` code by
Mathias Bynens under the MIT licence. That code is no longer used by saxes
6.0.0 and is not present in the MRAI integration.

The following ISC terms also govern sax, from which saxes was forked:

Copyright (c) Isaac Z. Schlueter and Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.

### xmlchars 2.2.0

- Project: <https://github.com/lddubeau/xml.js>
- Adoption mode: ADOPT, transitive dependency of saxes
- Licence: MIT
- Copyright: Louis-Dominique Dubeau and contributors to xmlchars
- Upstream NOTICE: none published for this release

### fflate 0.8.2

- Project: <https://github.com/101arrowz/fflate>
- Adoption mode: ADOPT, existing direct dependency
- Licence: MIT
- Copyright: 2023 Arjun Barrett
- Upstream NOTICE: none published for this release

The MIT terms for xmlchars and fflate are:

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
