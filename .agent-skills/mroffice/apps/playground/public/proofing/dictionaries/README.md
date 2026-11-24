# Spelling dictionaries

Hunspell dictionaries for every editor's spelling check (Docs: Review >
Editor, Spelling & Grammar and the right-click menu; Presentation and
Spreadsheet: Review > Spelling). `lib/proofing/spelling-dictionaries.ts` lists
them (`SPELLING_DICTIONARIES`) and routes a proofing language (Word's `w:lang`,
a run's or paragraph style's or the document defaults') to one of them.

In the browser a dictionary is fetched only when a check meets text in its
language, and is read and queried by Hunspell compiled to WebAssembly in the
spelling worker (`../spelling-worker.js`, engine in `../hunspell/`), never on
the page thread. Tests read the uncompressed `en-US` / `en-GB` / `nl` files
with `nspell` instead.

Each folder holds the dictionary's unmodified `.aff` / `.dic` pair, named
`index.aff` / `index.dic`, and the upstream licence text as `LICENSE.txt`.
All but `en-US`, `en-GB` and `nl` are stored gzip-compressed
(`index.aff.gz` / `index.dic.gz`, `gzip -9 -n` of the unmodified file); the
worker inflates them. Where the upstream offers a choice of licences the one
MRAI distributes the file under is named; the GPL ones are shipped by the
owner's decision of 2026-11-02.

| Folder | Language | Source and version | Licence | Upstream |
| --- | --- | --- | --- | --- |
| `en-US` | English (United States) | npm `dictionary-en` 4.0.0 (wooorm/dictionaries) | (MIT AND BSD) | SCOWL, wordlist.aspell.net |
| `en-GB` | English (United Kingdom) | npm `dictionary-en-gb` 3.0.0 (wooorm/dictionaries) | (MIT AND BSD) | SCOWL, wordlist.aspell.net |
| `en-AU` | English (Australia) | npm `dictionary-en-au` 3.0.0 (wooorm/dictionaries) | (MIT AND BSD) | SCOWL, wordlist.aspell.net |
| `en-CA` | English (Canada) | npm `dictionary-en-ca` 3.0.0 (wooorm/dictionaries) | (MIT AND BSD) | SCOWL, wordlist.aspell.net |
| `en-ZA` | English (South Africa) | npm `dictionary-en-za` 3.0.0 (wooorm/dictionaries) | LGPL-2.1 | Apache OpenOffice English dictionaries |
| `nl` | Dutch | npm `dictionary-nl` 2.0.0 (wooorm/dictionaries) | (BSD-3-Clause OR CC-BY-3.0) | OpenTaal, opentaal.org |
| `da` | Danish | npm `dictionary-da` 6.0.0 (wooorm/dictionaries) | (GPL-2.0 OR LGPL-2.1 OR MPL-1.1), used under MPL-1.1 | Stavekontrolden, stavekontrolden.dk |
| `de-DE` | German (Germany) | ONLYOFFICE/dictionaries `de_DE` @ 7481e59d61 (igerman98 20161207 + frami 20170109) | GPL-2.0 OR GPL-3.0 — GPL，业主 2026-11-02 准许分发 (owner approved distribution 2026-11-02) | Björn Jacke, igerman98 / frami (j3e.de) |
| `de-AT` | German (Austria) | ONLYOFFICE/dictionaries `de_AT` @ 7481e59d61 (igerman98 20161207 + frami 20170109) | GPL-2.0 OR GPL-3.0 — GPL，业主 2026-11-02 准许分发 (owner approved distribution 2026-11-02) | Björn Jacke, igerman98 / frami (j3e.de) |
| `de-CH` | German (Switzerland) | ONLYOFFICE/dictionaries `de_CH` @ 7481e59d61 (igerman98 20161207 + frami 20170109) | GPL-2.0 OR GPL-3.0 — GPL，业主 2026-11-02 准许分发 (owner approved distribution 2026-11-02) | Björn Jacke, igerman98 / frami (j3e.de) |
| `es` | Spanish | npm `dictionary-es` 4.0.0 (wooorm/dictionaries) | (GPL-3.0 OR LGPL-3.0 OR MPL-1.1), used under MPL-1.1 | RLA-ES, github.com/sbosio/rla-es |
| `fr` | French | npm `dictionary-fr` 3.0.0 (wooorm/dictionaries) | MPL-2.0 | Grammalecte, grammalecte.net |
| `it` | Italian | npm `dictionary-it` 2.0.0 (wooorm/dictionaries) | GPL-3.0 — GPL，业主 2026-11-02 准许分发 (owner approved distribution 2026-11-02) | plio.it |
| `nb` | Norwegian Bokmål | npm `dictionary-nb` 3.0.0 (wooorm/dictionaries) | GPL-2.0 — GPL，业主 2026-11-02 准许分发 (owner approved distribution 2026-11-02) | no.speling.org |
| `nn` | Norwegian Nynorsk | npm `dictionary-nn` 3.0.0 (wooorm/dictionaries) | GPL-2.0 — GPL，业主 2026-11-02 准许分发 (owner approved distribution 2026-11-02) | no.speling.org |
| `pt-BR` | Portuguese (Brazil) | npm `dictionary-pt` 4.0.0 (wooorm/dictionaries) | (LGPL-3.0 OR MPL-2.0), used under MPL-2.0 | VERO, via LibreOffice/dictionaries |
| `pt-PT` | Portuguese (Portugal) | npm `dictionary-pt-pt` 2.0.0 (wooorm/dictionaries) | (GPL-2.0 OR LGPL-2.1 OR MPL-1.1), used under MPL-1.1 | Natura, natura.di.uminho.pt |
| `sv` | Swedish | npm `dictionary-sv` 4.0.0 (wooorm/dictionaries) | LGPL-3.0 | Den stora svenska ordlistan |
| `id` | Indonesian | ONLYOFFICE/dictionaries `id_ID` @ 7481e59d61 (renamed index.aff / index.dic) | (MPL-2.0 OR LGPL-3.0), used under MPL-2.0 | Benitius Brevoort, LibreOffice Indonesian dictionary |
| `vi` | Vietnamese | npm `dictionary-vi` 3.0.0 (wooorm/dictionaries) | GPL-2.0 — GPL，业主 2026-11-02 准许分发 (owner approved distribution 2026-11-02) | github.com/1ec5/hunspell-vi |
| `ko` | Korean | npm `dictionary-ko` 2.0.0 (wooorm/dictionaries) | (GPL-2.0 OR LGPL-2.1 OR MPL-1.1), used under MPL-1.1 | github.com/spellcheck-ko/hunspell-dict-ko |
| `el` | Greek | npm `dictionary-el` 4.0.0 (wooorm/dictionaries) | (GPL-2.0 OR LGPL-2.1 OR MPL-1.1), used under MPL-1.1 | github.com/stevestavropoulos/elspell |
| `ru` | Russian | npm `dictionary-ru` 3.0.0 (wooorm/dictionaries) | BSD-3-Clause | LibreOffice/dictionaries |
| `uk` | Ukrainian | npm `dictionary-uk` 4.0.0 (wooorm/dictionaries) | GPL-3.0 — GPL，业主 2026-11-02 准许分发 (owner approved distribution 2026-11-02) | github.com/brown-uk/dict_uk |
| `bg` | Bulgarian | npm `dictionary-bg` 2.0.0 (wooorm/dictionaries) | (GPL-2.0 OR LGPL-2.1 OR MPL-1.1), used under MPL-1.1 | bgoffice.sourceforge.net |
| `sr-Cyrl` | Serbian (Cyrillic) | npm `dictionary-sr` 4.0.0 (wooorm/dictionaries) | (GPL-2.0 OR LGPL-2.1 OR MPL-1.1 OR CC-BY-SA-3.0), used under MPL-1.1 | github.com/grakic/hunspell-sr |
| `sr-Latn` | Serbian (Latin) | npm `dictionary-sr-latn` 4.0.0 (wooorm/dictionaries) | (GPL-2.0 OR LGPL-2.1 OR MPL-1.1 OR CC-BY-SA-3.0), used under MPL-1.1 | github.com/grakic/hunspell-sr |
| `tr` | Turkish | npm `dictionary-tr` 2.0.0 (wooorm/dictionaries) | MIT | Apache OpenOffice Turkish spellcheck dictionary |
| `pl` | Polish | npm `dictionary-pl` 2.0.0 (wooorm/dictionaries) | (GPL-3.0 OR LGPL-3.0 OR MPL-2.0), used under MPL-2.0 | SJP.PL, OpenOffice Polish dictionary pack |
| `cs` | Czech | npm `dictionary-cs` 4.0.0 (wooorm/dictionaries) | GPL-2.0 — GPL，业主 2026-11-02 准许分发 (owner approved distribution 2026-11-02) | translatoblog.cz/hunspell |
| `sk` | Slovak | npm `dictionary-sk` 2.0.0 (wooorm/dictionaries) | (GPL-2.0 OR LGPL-2.1 OR MPL-1.1), used under MPL-1.1 | sk-spell.sk.cx |
| `hu` | Hungarian | npm `dictionary-hu` 3.0.0 (wooorm/dictionaries) | (GPL-2.0 OR LGPL-2.1 OR MPL-1.1), used under MPL-1.1 | Magyar Ispell, github.com/laszlonemeth/magyarispell |
| `hr` | Croatian | npm `dictionary-hr` 2.0.0 (wooorm/dictionaries) | (LGPL-2.1 OR SISSL), used under LGPL-2.1 | github.com/krunose/hunspell-hr |
| `sl` | Slovenian | npm `dictionary-sl` 3.0.0 (wooorm/dictionaries) | (GPL-3.0 OR LGPL-2.1), used under LGPL-2.1 | LibreOffice Slovenian dictionary pack |
| `ro` | Romanian | npm `dictionary-ro` 3.0.0 (wooorm/dictionaries) | (GPL-2.0 OR LGPL-2.1 OR MPL-1.1), used under MPL-1.1 | rospell.wordpress.com |
| `ca` | Catalan | npm `dictionary-ca` 3.0.0 (wooorm/dictionaries) | (GPL-2.0 OR LGPL-2.1), used under LGPL-2.1 | Softcatalà, github.com/Softcatala/catalan-dict-tools |
| `cy` | Welsh | npm `dictionary-cy` 2.0.0 (wooorm/dictionaries) | LGPL-3.0 | github.com/techiaith/hunspell-cy |
| `lt` | Lithuanian | npm `dictionary-lt` 2.0.0 (wooorm/dictionaries) | BSD-3-Clause | github.com/ispell-lt/ispell-lt |
| `lv` | Latvian | npm `dictionary-lv` 2.0.0 (wooorm/dictionaries) | LGPL-2.1 | dict.dv.lv |

SHA-256 of the unmodified (uncompressed) files:

```
8ae1f19d4840d957728ad90555d5a8dff6cc5c046279c95ff0c00fc0a0136c7b  en-US/index.aff
f0b1a234bd178bdd01875b2a392a9647f888b8fe879f79c52aae62c2759b3647  en-US/index.dic
8ae1f19d4840d957728ad90555d5a8dff6cc5c046279c95ff0c00fc0a0136c7b  en-GB/index.aff
869fe17ba4ee4b5401c60a666ee2d6a3dcc237f460b7294435df1cc6a799aa57  en-GB/index.dic
8ae1f19d4840d957728ad90555d5a8dff6cc5c046279c95ff0c00fc0a0136c7b  en-AU/index.aff
aa07c46571f306b79fc1bc534357ed357af15687381b26f891ba66e8a2caed89  en-AU/index.dic
8ae1f19d4840d957728ad90555d5a8dff6cc5c046279c95ff0c00fc0a0136c7b  en-CA/index.aff
53096689870246a78fa408b1e7a8c49bc140bd466a84a384cfb509445fff7173  en-CA/index.dic
d39436eedc236c02e5d2b904352a51c487e421ca33e803f500713b5a21c007d1  en-ZA/index.aff
cde2b8460049ec0f87933f56b20396fbb693e322f852b4878706eb5b2acfd768  en-ZA/index.dic
b430d9cf5f4170d9e5072397927e1402b34aa877d1f4c8fbc00dab6370d87312  nl/index.aff
be192fdc36efd39dde0fb9a5a113143e0a906782e81ed68a74a710edced378d0  nl/index.dic
cb5ef704de0ab8575c883c97981d5d242260c7ebe47b28c15c205443aca15976  da/index.aff
9a12345e1881c96f18cc460dbd062e47509571d5f2a2a9bf041da169856dc19e  da/index.dic
c7a7d49f73394c8ffd189e9ebec065ad63f6a3feb15417dbf90b2dc68760227e  de-DE/index.aff
d053e46aab7d36784ed0911ddd8fe1df9836d9d78e3a9c2093145eb5c3c611dd  de-DE/index.dic
ff26b4ecc487673c232674a8f058cb21875856af83eefa8f784a4145b1a87b9e  de-AT/index.aff
dfad9c278603d40027c9cea44ed684f00219ff92c6fb6622dfe78ee378a90cee  de-AT/index.dic
dc312eb01c299b489aa384af2cc1f521af06be38c950ba7c5e75e549c6fbbc09  de-CH/index.aff
31c7e7696916bf7f0a163a3185df38887d6087883421241777f5704aaf542147  de-CH/index.dic
892039d59db11d747061b81c3a92a52d48ba0e055b5835af1943cbd3c2fba85b  es/index.aff
907f786a8ceb3456722b20ad91dd4dbe99c5c16e45015ea63155e36f26b06d2c  es/index.dic
05a735d34c912e4e381ff08ee7c747923ccf5cf9dca81d8467982fa1ca51c2b7  fr/index.aff
984e933237bc1224a48f42828233be9b03228260ef67aa8e2bdddcd03a26230d  fr/index.dic
5770cd3e16d494c045b4a9a4a9fcd7962577e642d0384a7129c020a12cdd2c79  it/index.aff
b1348fbdb6f441ea9dd7e33b2cfcb96ead39ccd5e48bf894972774cd5aa86abb  it/index.dic
515a1e5f32ffa555d253c827830420dc5bb1d9a59ea9f720729acb0874c6a8c3  nb/index.aff
e97fdf7f441b3c46e1d0761a8ad25fa1883d0977d70ea8cb04751cb1c47fa10e  nb/index.dic
e50821655063f5680a3e4cf775b0a69c87de74bd6d2bbbb5da14ff8de4633beb  nn/index.aff
eaf1dc7ee7c848358df9aa231640b054ca4e388f2a870185528e4b229626faa6  nn/index.dic
a9f3621b94eb4d6838474bf9982027758e77dcb248815f49409b1a4a477dbd27  pt-BR/index.aff
32e2edd83541d58613bcc83ef731a79aadf85ed57e977a16c6b5f711a7a36cee  pt-BR/index.dic
975a209fcc892cb382fa5f34a28c391a39668661ce373ae071287809c5fcae24  pt-PT/index.aff
fcac21564163586df74ba88cde362bb75560548b35bcaa780558c8f97f43de04  pt-PT/index.dic
ff8ddb979daa9f128e7489ece5edd666ada7af787933221543b7cecb2b3ed478  sv/index.aff
540ff8d0d9b05aae66dd919625d3a0bd25026d1e157027e6602e5dd11a07b645  sv/index.dic
1f7d58cebb3aa37fde368f68d9000c8d1269c7bbcb9cccfc8e90f8c9e8828727  id/index.aff
968accd36169e7e28d09b267974196db0a2c28049d7237aa55dcf3f2cc657123  id/index.dic
0d836ebf1d4f1e9964d931fbb76464b24037b71995c73784166a07c43e2a7ae5  vi/index.aff
9c56725b43e66de33d28aac8e58124e38247c8b2be34a8469b3113169110256c  vi/index.dic
7b8930ce1357691591a3c38afc9cba787ec6dce0e30d0438bd156c4b4c94dbdf  ko/index.aff
ea275b5fe256925a95f9192a173f7c3d3c2480fa748371c64b89d7e0cc531b1d  ko/index.dic
5d2e3580af6d3523ac4470335a4b05968e59dddc58e1a7f2b260c81342e80063  el/index.aff
f08daefb302600beb1b345e4fd77f4ecf6617aa080a72efe6ae7eec0ad5b2ac7  el/index.dic
38ce7d4af78e211e9bafe4bf7e3d6a2c420591136cb738ec6648f8fdf6524cd7  ru/index.aff
f6047416a0204adbecf3a451b874ec8a97ee37e2cbc714466ef04d8dbcc0d6fc  ru/index.dic
cd22837ffdbf96d57f3f7c5702f37f9069eb480cb3078668b32e1c69b0549fc1  uk/index.aff
38fc49e64b54f7154a045edfd6e51f47ed4cb1e33c013a0e6de942713a82e199  uk/index.dic
cb6bfc56d6b1e70c812061086d7ec5ad6aaf6d35acd927a035f1cee0188ea477  bg/index.aff
44408b1ee50301e8f9a133b0ec92565bb8be49818c444d91821876d447f58906  bg/index.dic
10e11edbd55742975f0720b26a2b6669187e9b91fabc5063ee81f0db2f73279f  sr-Cyrl/index.aff
8bdbbe464f20a5a600ccad1ff0257883c42bb6170a55440d45b4b39e002f433a  sr-Cyrl/index.dic
9112fdbd53c8a20ac06397e736884450d61df0c6c5be6f5512210ed58229f939  sr-Latn/index.aff
a41302b3e707c7a344560bc7df6db739db254f87be0442108a68f4ed2a34782d  sr-Latn/index.dic
6a390c79b054ad427cf9a6bf6de43463953cc1918e7f727e9dd4ebd4f9702f42  tr/index.aff
dc1d8f7724f4aefd117274678de431e4ea1765f2e02e6983b6ca48cbf5a7fc7c  tr/index.dic
de7b54a8fa37562d58b481cf3d87a63e3dcc2d74021f6403eb0e4f5df9ecc225  pl/index.aff
74b6155391025419967c26913541b55b36d58e80b1028037d4a0b8ddcb18d0b7  pl/index.dic
175e02acb4786042a9c87e3cb6d3746e3a5b3079752118c2d4f0bb2c756ce72b  cs/index.aff
bbc0a495671c29337279182799e171c173a21ae8968c89dd0fb7c713b40c7832  cs/index.dic
a79dc992b849aa2355db38eea9c4722239993639d77bc81c9c1aa79f213e723c  sk/index.aff
b6cdb6fb512c44881cc91329aea0b179840f5f9a3e6cb024c2ab8547f96f5d94  sk/index.dic
625a5fb8bf77cf1a4d73288883b8abeff4753f736579a35ec285088fb9098d2c  hu/index.aff
b6bda85603bb293de53b6deed5043771b1a61958f76e09aa8058c26e563f63e1  hu/index.dic
230a7f0ca65159ecf8f3eea4afd79f7436415e83129b1d6b2424892074d8194d  hr/index.aff
fb436f3a758cd4faf9ef4cd5c2e6e2a1e3abe535ee183095a2f59fd18dad0731  hr/index.dic
511043a4f9c64a966599e3d53fa1f4e9a172a87de4a7a0c2cf327098a3a605d1  sl/index.aff
5bac615dbd301ddbefbdaafdae242a89e46605916d77958df22778e770a95b9e  sl/index.dic
3ee127a667bdec829faee546ae32033e8f10f7c63117f9b572ef03ad9df2b76b  ro/index.aff
c26a9356f598a0ae89e7be650f6bdd9ba70acce66b41d7ab14c0c68639b6ed33  ro/index.dic
bfc7d8412c9450ec63e00d13f2153191a11d04868b14d51cf6c50eace71efdb2  ca/index.aff
e272aeff4b2d1a92b428a22b52c685292d04936e34dfe7786e27539175cbef2e  ca/index.dic
757c350b84889c4d0711c93760509fe532863079262695c069550f9a9c1c5222  cy/index.aff
ef8f01db311cf17c617377d22b11f6752b01c65f5457820cc04d877bba6b92ff  cy/index.dic
79c6f8304490d1c8b27ec93e509b2f635d9bb21d45a2d41c15162b18c8ff897c  lt/index.aff
a751750b040623cf408cf1a3b6f6336141b55ac9519e54068dbeaa52eb395ccd  lt/index.dic
a11f646c6905d6c96f3218ada4a6cf84129c9e6169720ac1a17f1707940a2890  lv/index.aff
bf7d054e28bc5e44df19410f3ed9d5fd8d6a4d8c051676650388c4e8d65c3148  lv/index.dic
```

## Engine

`../hunspell/hunspell.js` and `../hunspell/hunspell.wasm` are the unmodified
`wasm/` build of the npm package `hunspell-wasm` 0.3.0 (Rotem Dan,
github.com/rotemdan/hunspell-wasm): the Hunspell C++ library compiled with
Emscripten. Hunspell is tri-licensed MPL-1.1 / GPL-2.0 / LGPL-2.1; MRAI
distributes it under MPL-1.1. The three licence texts are in `../hunspell/`.

```
709ab4c8c1b37921b9c6ec4bf9452f3dae65a298a0fce56c5e4a987bb3311833  hunspell/hunspell.js
72152324049c9215da17abceb12555b3ef9094c0524327e660f8145aaa9c68e0  hunspell/hunspell.wasm
```

## Not checked

- Chinese, Japanese, Thai, Lao, Khmer, Burmese and Tibetan are written
  without spaces between words: a word list cannot find the words, so their
  text is never flagged (Office segments them with language tools MRAI does
  not have). The Docs Editor pane says so when a document has such text.
- Finnish has no usable Hunspell dictionary (its spell checkers are
  morphological analysers, e.g. Voikko); Estonian's packaged dictionary
  (`dictionary-et`) ships without its licence text and is not included yet.
  Text set in a language without a dictionary is not checked, and the Docs
  Editor pane names the language.

To add a language: put the unmodified `.aff` / `.dic` (gzip-compressed) and
the upstream licence in a folder named by its language tag, add a row and
the checksums here, and add the tag to `SPELLING_DICTIONARIES` (with routing
in `spellingDictionaryForLanguage` when its tag is not the plain primary
language).
