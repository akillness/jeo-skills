/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Script routing for the existing Word Latin/eastAsia font slots.
 * UAX #29 extended graphemes, Unicode 17.0; offsets are UTF-16 (ProseMirror).
 * Run fonts select by character, not by the enclosing run's last font mark:
 * https://learn.microsoft.com/dotnet/api/documentformat.openxml.wordprocessing.runfonts
 *
 * Unicode data © 1991-2025 Unicode, Inc. Unicode License v3:
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of data files and any associated documentation (the "Data Files") or software
 * and any associated documentation (the "Software") to deal in the Data Files
 * or Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, and/or sell copies of the Data
 * Files or Software, and to permit persons to whom the Data Files or Software
 * are furnished to do so, provided that either (a) this copyright and permission
 * notice appear with all copies of the Data Files or Software, or (b) this
 * copyright and permission notice appear in associated Documentation.
 * THE DATA FILES AND SOFTWARE ARE PROVIDED "AS IS", WITHOUT WARRANTY OF ANY
 * KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT OF
 * THIRD PARTY RIGHTS. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR HOLDERS
 * INCLUDED IN THIS NOTICE BE LIABLE FOR ANY CLAIM, OR ANY SPECIAL INDIRECT OR
 * CONSEQUENTIAL DAMAGES, OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE,
 * DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
 * TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE
 * OF THE DATA FILES OR SOFTWARE. Except as contained in this notice, the name
 * of a copyright holder shall not be used in advertising or otherwise to
 * promote the sale, use or other dealings in these Data Files or Software
 * without prior written authorization of the copyright holder.
 */

// Frozen together with document_font_face.py; the codec test checks drift.
export const FONT_GRAPHEME_DATA = {
  Prepend:
    "600-605 6dd 70f 890-891 8e2 d4e 110bd 110cd 111c2-111c3 113d1 1193f 11941 11a84-11a89 11d46 11f02",
  CR: "d",
  LF: "a",
  Control:
    "0-9 b-c e-1f 7f-9f ad 61c 180e 200b 200e-200f 2028-202e 2060-206f feff fff0-fffb 13430-1343f 1bca0-1bca3 1d173-1d17a e0000-e001f e0080-e00ff e01f0-e0fff",
  Extend:
    "300-36f 483-489 591-5bd 5bf 5c1-5c2 5c4-5c5 5c7 610-61a 64b-65f 670 6d6-6dc 6df-6e4 6e7-6e8 6ea-6ed 711 730-74a 7a6-7b0 7eb-7f3 7fd 816-819 81b-823 825-827 829-82d 859-85b 897-89f 8ca-8e1 8e3-902 93a 93c 941-948 94d 951-957 962-963 981 9bc 9be 9c1-9c4 9cd 9d7 9e2-9e3 9fe a01-a02 a3c a41-a42 a47-a48 a4b-a4d a51 a70-a71 a75 a81-a82 abc ac1-ac5 ac7-ac8 acd ae2-ae3 afa-aff b01 b3c b3e-b3f b41-b44 b4d b55-b57 b62-b63 b82 bbe bc0 bcd bd7 c00 c04 c3c c3e-c40 c46-c48 c4a-c4d c55-c56 c62-c63 c81 cbc cbf-cc0 cc2 cc6-cc8 cca-ccd cd5-cd6 ce2-ce3 d00-d01 d3b-d3c d3e d41-d44 d4d d57 d62-d63 d81 dca dcf dd2-dd4 dd6 ddf e31 e34-e3a e47-e4e eb1 eb4-ebc ec8-ece f18-f19 f35 f37 f39 f71-f7e f80-f84 f86-f87 f8d-f97 f99-fbc fc6 102d-1030 1032-1037 1039-103a 103d-103e 1058-1059 105e-1060 1071-1074 1082 1085-1086 108d 109d 135d-135f 1712-1715 1732-1734 1752-1753 1772-1773 17b4-17b5 17b7-17bd 17c6 17c9-17d3 17dd 180b-180d 180f 1885-1886 18a9 1920-1922 1927-1928 1932 1939-193b 1a17-1a18 1a1b 1a56 1a58-1a5e 1a60 1a62 1a65-1a6c 1a73-1a7c 1a7f 1ab0-1add 1ae0-1aeb 1b00-1b03 1b34-1b3d 1b42-1b44 1b6b-1b73 1b80-1b81 1ba2-1ba5 1ba8-1bad 1be6 1be8-1be9 1bed 1bef-1bf3 1c2c-1c33 1c36-1c37 1cd0-1cd2 1cd4-1ce0 1ce2-1ce8 1ced 1cf4 1cf8-1cf9 1dc0-1dff 200c 20d0-20f0 2cef-2cf1 2d7f 2de0-2dff 302a-302f 3099-309a a66f-a672 a674-a67d a69e-a69f a6f0-a6f1 a802 a806 a80b a825-a826 a82c a8c4-a8c5 a8e0-a8f1 a8ff a926-a92d a947-a951 a953 a980-a982 a9b3 a9b6-a9b9 a9bc-a9bd a9c0 a9e5 aa29-aa2e aa31-aa32 aa35-aa36 aa43 aa4c aa7c aab0 aab2-aab4 aab7-aab8 aabe-aabf aac1 aaec-aaed aaf6 abe5 abe8 abed fb1e fe00-fe0f fe20-fe2f ff9e-ff9f 101fd 102e0 10376-1037a 10a01-10a03 10a05-10a06 10a0c-10a0f 10a38-10a3a 10a3f 10ae5-10ae6 10d24-10d27 10d69-10d6d 10eab-10eac 10efa-10eff 10f46-10f50 10f82-10f85 11001 11038-11046 11070 11073-11074 1107f-11081 110b3-110b6 110b9-110ba 110c2 11100-11102 11127-1112b 1112d-11134 11173 11180-11181 111b6-111be 111c0 111c9-111cc 111cf 1122f-11231 11234-11237 1123e 11241 112df 112e3-112ea 11300-11301 1133b-1133c 1133e 11340 1134d 11357 11366-1136c 11370-11374 113b8 113bb-113c0 113c2 113c5 113c7-113c9 113ce-113d0 113d2 113e1-113e2 11438-1143f 11442-11444 11446 1145e 114b0 114b3-114b8 114ba 114bd 114bf-114c0 114c2-114c3 115af 115b2-115b5 115bc-115bd 115bf-115c0 115dc-115dd 11633-1163a 1163d 1163f-11640 116ab 116ad 116b0-116b7 1171d 1171f 11722-11725 11727-1172b 1182f-11837 11839-1183a 11930 1193b-1193e 11943 119d4-119d7 119da-119db 119e0 11a01-11a0a 11a33-11a38 11a3b-11a3e 11a47 11a51-11a56 11a59-11a5b 11a8a-11a96 11a98-11a99 11b60 11b62-11b64 11b66 11c30-11c36 11c38-11c3d 11c3f 11c92-11ca7 11caa-11cb0 11cb2-11cb3 11cb5-11cb6 11d31-11d36 11d3a 11d3c-11d3d 11d3f-11d45 11d47 11d90-11d91 11d95 11d97 11ef3-11ef4 11f00-11f01 11f36-11f3a 11f40-11f42 11f5a 13440 13447-13455 1611e-16129 1612d-1612f 16af0-16af4 16b30-16b36 16f4f 16f8f-16f92 16fe4 16ff0-16ff1 1bc9d-1bc9e 1cf00-1cf2d 1cf30-1cf46 1d165-1d169 1d16d-1d172 1d17b-1d182 1d185-1d18b 1d1aa-1d1ad 1d242-1d244 1da00-1da36 1da3b-1da6c 1da75 1da84 1da9b-1da9f 1daa1-1daaf 1e000-1e006 1e008-1e018 1e01b-1e021 1e023-1e024 1e026-1e02a 1e08f 1e130-1e136 1e2ae 1e2ec-1e2ef 1e4ec-1e4ef 1e5ee-1e5ef 1e6e3 1e6e6 1e6ee-1e6ef 1e6f5 1e8d0-1e8d6 1e944-1e94a 1f3fb-1f3ff e0020-e007f e0100-e01ef",
  Regional_Indicator: "1f1e6-1f1ff",
  SpacingMark:
    "903 93b 93e-940 949-94c 94e-94f 982-983 9bf-9c0 9c7-9c8 9cb-9cc a03 a3e-a40 a83 abe-ac0 ac9 acb-acc b02-b03 b40 b47-b48 b4b-b4c bbf bc1-bc2 bc6-bc8 bca-bcc c01-c03 c41-c44 c82-c83 cbe cc1 cc3-cc4 cf3 d02-d03 d3f-d40 d46-d48 d4a-d4c d82-d83 dd0-dd1 dd8-dde df2-df3 e33 eb3 f3e-f3f f7f 1031 103b-103c 1056-1057 1084 17b6 17be-17c5 17c7-17c8 1923-1926 1929-192b 1930-1931 1933-1938 1a19-1a1a 1a55 1a57 1a6d-1a72 1b04 1b3e-1b41 1b82 1ba1 1ba6-1ba7 1be7 1bea-1bec 1bee 1c24-1c2b 1c34-1c35 1ce1 1cf7 a823-a824 a827 a880-a881 a8b4-a8c3 a952 a983 a9b4-a9b5 a9ba-a9bb a9be-a9bf aa2f-aa30 aa33-aa34 aa4d aaeb aaee-aaef aaf5 abe3-abe4 abe6-abe7 abe9-abea abec 11000 11002 11082 110b0-110b2 110b7-110b8 1112c 11145-11146 11182 111b3-111b5 111bf 111ce 1122c-1122e 11232-11233 112e0-112e2 11302-11303 1133f 11341-11344 11347-11348 1134b-1134c 11362-11363 113b9-113ba 113ca 113cc-113cd 11435-11437 11440-11441 11445 114b1-114b2 114b9 114bb-114bc 114be 114c1 115b0-115b1 115b8-115bb 115be 11630-11632 1163b-1163c 1163e 116ac 116ae-116af 1171e 11726 1182c-1182e 11838 11931-11935 11937-11938 11940 11942 119d1-119d3 119dc-119df 119e4 11a39 11a57-11a58 11a97 11b61 11b65 11b67 11c2f 11c3e 11ca9 11cb1 11cb4 11d8a-11d8e 11d93-11d94 11d96 11ef5-11ef6 11f03 11f34-11f35 11f3e-11f3f 1612a-1612c 16f51-16f87",
  L: "1100-115f a960-a97c",
  V: "1160-11a7 d7b0-d7c6 16d63 16d67-16d6a",
  T: "11a8-11ff d7cb-d7fb",
  ZWJ: "200d",
  Extended_Pictographic:
    "a9 ae 203c 2049 2122 2139 2194-2199 21a9-21aa 231a-231b 2328 23cf 23e9-23f3 23f8-23fa 24c2 25aa-25ab 25b6 25c0 25fb-25fe 2600-2604 260e 2611 2614-2615 2618 261d 2620 2622-2623 2626 262a 262e-262f 2638-263a 2640 2642 2648-2653 265f-2660 2663 2665-2666 2668 267b 267e-267f 2692-2697 2699 269b-269c 26a0-26a1 26a7 26aa-26ab 26b0-26b1 26bd-26be 26c4-26c5 26c8 26ce-26cf 26d1 26d3-26d4 26e9-26ea 26f0-26f5 26f7-26fa 26fd 2702 2705 2708-270d 270f 2712 2714 2716 271d 2721 2728 2733-2734 2744 2747 274c 274e 2753-2755 2757 2763-2764 2795-2797 27a1 27b0 27bf 2934-2935 2b05-2b07 2b1b-2b1c 2b50 2b55 3030 303d 3297 3299 1f004 1f02c-1f02f 1f094-1f09f 1f0af-1f0b0 1f0c0 1f0cf-1f0d0 1f0f6-1f0ff 1f170-1f171 1f17e-1f17f 1f18e 1f191-1f19a 1f1ae-1f1e5 1f201-1f20f 1f21a 1f22f 1f232-1f23a 1f23c-1f23f 1f249-1f25f 1f266-1f321 1f324-1f393 1f396-1f397 1f399-1f39b 1f39e-1f3f0 1f3f3-1f3f5 1f3f7-1f3fa 1f400-1f4fd 1f4ff-1f53d 1f549-1f54e 1f550-1f567 1f56f-1f570 1f573-1f57a 1f587 1f58a-1f58d 1f590 1f595-1f596 1f5a4-1f5a5 1f5a8 1f5b1-1f5b2 1f5bc 1f5c2-1f5c4 1f5d1-1f5d3 1f5dc-1f5de 1f5e1 1f5e3 1f5e8 1f5ef 1f5f3 1f5fa-1f64f 1f680-1f6c5 1f6cb-1f6d2 1f6d5-1f6e5 1f6e9 1f6eb-1f6f0 1f6f3-1f6ff 1f7da-1f7ff 1f80c-1f80f 1f848-1f84f 1f85a-1f85f 1f888-1f88f 1f8ae-1f8af 1f8bc-1f8bf 1f8c2-1f8cf 1f8d9-1f8ff 1f90c-1f93a 1f93c-1f945 1f947-1f9ff 1fa58-1fa5f 1fa6e-1faff 1fc00-1fffd",
  InCB_Linker:
    "94d 9cd acd b4d c4d d4d 1039 17d2 1a60 1b44 1bab a9c0 aaf6 10a3f 11133 113d0 1193e 11a47 11a99 11f42",
  InCB_Consonant:
    "915-939 958-95f 978-97f 995-9a8 9aa-9b0 9b2 9b6-9b9 9dc-9dd 9df 9f0-9f1 a95-aa8 aaa-ab0 ab2-ab3 ab5-ab9 af9 b15-b28 b2a-b30 b32-b33 b35-b39 b5c-b5d b5f b71 c15-c28 c2a-c39 c58-c5a d15-d3a 1000-102a 103f 1050-1055 105a-105d 1061 1065-1066 106e-1070 1075-1081 108e 1780-17b3 1a20-1a54 1b0b-1b0c 1b13-1b33 1b45-1b4c 1b83-1ba0 1bae-1baf 1bbb-1bbd a989-a98b a98f-a9b2 a9e0-a9e4 a9e7-a9ef a9fa-a9fe aa60-aa6f aa71-aa73 aa7a aa7e-aa7f aae0-aaea abc0-abda 10a00 10a10-10a13 10a15-10a17 10a19-10a35 11103-11126 11144 11147 11380-11389 1138b 1138e 11390-113b5 11900-11906 11909 1190c-11913 11915-11916 11918-1192f 11a00 11a0b-11a32 11a50 11a5c-11a83 11f04-11f10 11f12-11f33",
  InCB_Extend:
    "300-36f 483-489 591-5bd 5bf 5c1-5c2 5c4-5c5 5c7 610-61a 64b-65f 670 6d6-6dc 6df-6e4 6e7-6e8 6ea-6ed 711 730-74a 7a6-7b0 7eb-7f3 7fd 816-819 81b-823 825-827 829-82d 859-85b 897-89f 8ca-8e1 8e3-902 93a 93c 941-948 951-957 962-963 981 9bc 9be 9c1-9c4 9d7 9e2-9e3 9fe a01-a02 a3c a41-a42 a47-a48 a4b-a4d a51 a70-a71 a75 a81-a82 abc ac1-ac5 ac7-ac8 ae2-ae3 afa-aff b01 b3c b3e-b3f b41-b44 b55-b57 b62-b63 b82 bbe bc0 bcd bd7 c00 c04 c3c c3e-c40 c46-c48 c4a-c4c c55-c56 c62-c63 c81 cbc cbf-cc0 cc2 cc6-cc8 cca-ccd cd5-cd6 ce2-ce3 d00-d01 d3b-d3c d3e d41-d44 d57 d62-d63 d81 dca dcf dd2-dd4 dd6 ddf e31 e34-e3a e47-e4e eb1 eb4-ebc ec8-ece f18-f19 f35 f37 f39 f71-f7e f80-f84 f86-f87 f8d-f97 f99-fbc fc6 102d-1030 1032-1037 103a 103d-103e 1058-1059 105e-1060 1071-1074 1082 1085-1086 108d 109d 135d-135f 1712-1715 1732-1734 1752-1753 1772-1773 17b4-17b5 17b7-17bd 17c6 17c9-17d1 17d3 17dd 180b-180d 180f 1885-1886 18a9 1920-1922 1927-1928 1932 1939-193b 1a17-1a18 1a1b 1a56 1a58-1a5e 1a62 1a65-1a6c 1a73-1a7c 1a7f 1ab0-1add 1ae0-1aeb 1b00-1b03 1b34-1b3d 1b42-1b43 1b6b-1b73 1b80-1b81 1ba2-1ba5 1ba8-1baa 1bac-1bad 1be6 1be8-1be9 1bed 1bef-1bf3 1c2c-1c33 1c36-1c37 1cd0-1cd2 1cd4-1ce0 1ce2-1ce8 1ced 1cf4 1cf8-1cf9 1dc0-1dff 200d 20d0-20f0 2cef-2cf1 2d7f 2de0-2dff 302a-302f 3099-309a a66f-a672 a674-a67d a69e-a69f a6f0-a6f1 a802 a806 a80b a825-a826 a82c a8c4-a8c5 a8e0-a8f1 a8ff a926-a92d a947-a951 a953 a980-a982 a9b3 a9b6-a9b9 a9bc-a9bd a9e5 aa29-aa2e aa31-aa32 aa35-aa36 aa43 aa4c aa7c aab0 aab2-aab4 aab7-aab8 aabe-aabf aac1 aaec-aaed abe5 abe8 abed fb1e fe00-fe0f fe20-fe2f ff9e-ff9f 101fd 102e0 10376-1037a 10a01-10a03 10a05-10a06 10a0c-10a0f 10a38-10a3a 10ae5-10ae6 10d24-10d27 10d69-10d6d 10eab-10eac 10efa-10eff 10f46-10f50 10f82-10f85 11001 11038-11046 11070 11073-11074 1107f-11081 110b3-110b6 110b9-110ba 110c2 11100-11102 11127-1112b 1112d-11132 11134 11173 11180-11181 111b6-111be 111c0 111c9-111cc 111cf 1122f-11231 11234-11237 1123e 11241 112df 112e3-112ea 11300-11301 1133b-1133c 1133e 11340 1134d 11357 11366-1136c 11370-11374 113b8 113bb-113c0 113c2 113c5 113c7-113c9 113ce-113cf 113d2 113e1-113e2 11438-1143f 11442-11444 11446 1145e 114b0 114b3-114b8 114ba 114bd 114bf-114c0 114c2-114c3 115af 115b2-115b5 115bc-115bd 115bf-115c0 115dc-115dd 11633-1163a 1163d 1163f-11640 116ab 116ad 116b0-116b7 1171d 1171f 11722-11725 11727-1172b 1182f-11837 11839-1183a 11930 1193b-1193d 11943 119d4-119d7 119da-119db 119e0 11a01-11a0a 11a33-11a38 11a3b-11a3e 11a51-11a56 11a59-11a5b 11a8a-11a96 11a98 11b60 11b62-11b64 11b66 11c30-11c36 11c38-11c3d 11c3f 11c92-11ca7 11caa-11cb0 11cb2-11cb3 11cb5-11cb6 11d31-11d36 11d3a 11d3c-11d3d 11d3f-11d45 11d47 11d90-11d91 11d95 11d97 11ef3-11ef4 11f00-11f01 11f36-11f3a 11f40-11f41 11f5a 13440 13447-13455 1611e-16129 1612d-1612f 16af0-16af4 16b30-16b36 16f4f 16f8f-16f92 16fe4 16ff0-16ff1 1bc9d-1bc9e 1cf00-1cf2d 1cf30-1cf46 1d165-1d169 1d16d-1d172 1d17b-1d182 1d185-1d18b 1d1aa-1d1ad 1d242-1d244 1da00-1da36 1da3b-1da6c 1da75 1da84 1da9b-1da9f 1daa1-1daaf 1e000-1e006 1e008-1e018 1e01b-1e021 1e023-1e024 1e026-1e02a 1e08f 1e130-1e136 1e2ae 1e2ec-1e2ef 1e4ec-1e4ef 1e5ee-1e5ef 1e6e3 1e6e6 1e6ee-1e6ef 1e6f5 1e8d0-1e8d6 1e944-1e94a 1f3fb-1f3ff e0020-e007f e0100-e01ef",
  EastAsianScript:
    "2ea-2eb 1100-11ff 2e80-2e99 2e9b-2ef3 2f00-2fd5 3005 3007 3021-3029 302e-302f 3038-303b 3041-3096 309d-309f 30a1-30fa 30fd-30ff 3105-312f 3131-318e 31a0-31bf 31f0-321e 3260-327e 32d0-32fe 3300-3357 3400-4dbf 4e00-9fff a960-a97c ac00-d7a3 d7b0-d7c6 d7cb-d7fb f900-fa6d fa70-fad9 ff66-ff6f ff71-ff9d ffa0-ffbe ffc2-ffc7 ffca-ffcf ffd2-ffd7 ffda-ffdc 16fe2-16fe3 16ff0-16ff6 1aff0-1aff3 1aff5-1affb 1affd-1affe 1b000-1b122 1b132 1b150-1b152 1b155 1b164-1b167 1f200 20000-2a6df 2a700-2b81d 2b820-2cead 2ceb0-2ebe0 2ebf0-2ee5d 2f800-2fa1d 30000-3134a 31350-33479",
} as const;
/**
 * Word's complex-script font slot (`w:rFonts/@w:cs`), by the script whose face
 * draws each range. ECMA-376 17.3.2.26 gives a run four font slots and says the
 * one a character uses "shall be determined by the Unicode character values of
 * the run content", so these ranges go to `w:cs` whatever the Latin and East
 * Asian slots name, and `w:hint` never moves them.
 *
 * This is the one table, mirrored from `document_font_face.COMPLEX_SCRIPT_RANGES`
 * — the same ranges that bind a generated document's packaged complex-script
 * faces on export — so what the page paints and what Word prints can never
 * disagree on a character. The codec test checks the two for drift.
 */
export const COMPLEX_SCRIPT_RANGES: ReadonlyArray<readonly [number, number, string]> = [
  [0x0590, 0x05ff, "hebrew"], // Hebrew
  [0x0600, 0x06ff, "arabic"], // Arabic
  [0x0750, 0x077f, "arabic"], // Arabic Supplement
  [0x08a0, 0x08ff, "arabic"], // Arabic Extended-A
  [0x0900, 0x097f, "devanagari"], // Devanagari
  [0x0980, 0x09ff, "bengali"], // Bengali
  [0x0e00, 0x0e7f, "thai"], // Thai
  [0x1cd0, 0x1cff, "devanagari"], // Vedic Extensions
  [0xa830, 0xa83f, "devanagari"], // Common Indic Number Forms
  [0xa8e0, 0xa8ff, "devanagari"], // Devanagari Extended
  [0xfb1d, 0xfb4f, "hebrew"], // Hebrew Presentation Forms
  [0xfb50, 0xfdff, "arabic"], // Arabic Presentation Forms-A
  [0xfe70, 0xfeff, "arabic"], // Arabic Presentation Forms-B
];
/** The complex script one character belongs to, or null for every other. */
export function complexScriptFontScript(cp: number): string | null {
  for (const [start, end, script] of COMPLEX_SCRIPT_RANGES)
    if (cp >= start && cp <= end) return script;
  return null;
}
export function isComplexScriptFontCodePoint(cp: number): boolean {
  return complexScriptFontScript(cp) !== null;
}
export type FontScriptSlot = "primary" | "eastAsia" | "cs";
export interface FontScriptCluster {
  readonly from: number;
  readonly to: number;
  readonly base: number;
  readonly slot: FontScriptSlot;
}
type Range = readonly [number, number];
const ranges = (value: string): Range[] =>
  value.split(" ").map((range) => {
    const [start, end = start] = range.split("-");
    return [Number.parseInt(start, 16), Number.parseInt(end, 16)] as const;
  });
const tables = Object.fromEntries(
  Object.entries(FONT_GRAPHEME_DATA).map(([name, value]) => [
    name,
    ranges(value),
  ]),
) as Record<string, Range[]>;
function includes(ranges: readonly Range[], cp: number): boolean {
  let lo = 0,
    hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1,
      [start, end] = ranges[mid];
    if (cp < start) hi = mid - 1;
    else if (cp > end) lo = mid + 1;
    else return true;
  }
  return false;
}
const graphemeClasses = [
  "CR",
  "LF",
  "Control",
  "Extend",
  "Regional_Indicator",
  "Prepend",
  "SpacingMark",
  "L",
  "V",
  "T",
  "ZWJ",
];
function gcb(cp: number): string {
  if (cp >= 0xac00 && cp <= 0xd7a3)
    return (cp - 0xac00) % 28 === 0 ? "LV" : "LVT";
  return graphemeClasses.find((name) => includes(tables[name], cp)) ?? "Other";
}
export function isEastAsianFontCodePoint(cp: number): boolean {
  return (
    includes(tables.EastAsianScript, cp) ||
    (cp >= 0x2e80 && cp <= 0x33ff) ||
    (cp >= 0xfe10 && cp <= 0xfe1f) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xffef)
  );
}
const inherited = new Set(["Extend", "ZWJ", "SpacingMark", "Prepend"]);
const controls = new Set(["CR", "LF", "Control"]);
/** Never divide combining, Hangul, Indic-conjunct, RI or emoji/ZWJ clusters. */
export function fontScriptClusters(text: string): FontScriptCluster[] {
  const chars: Array<{
    from: number;
    to: number;
    cp: number;
    kind: string;
    incb: string;
    ep: boolean;
  }> = [];
  let offset = 0;
  for (const char of text) {
    const cp = char.codePointAt(0)!;
    const incb =
      ["Consonant", "Linker", "Extend"].find((name) =>
        includes(tables["InCB_" + name], cp),
      ) ?? "";
    chars.push({
      from: offset,
      to: offset + char.length,
      cp,
      kind: gcb(cp),
      incb,
      ep: includes(tables.Extended_Pictographic, cp),
    });
    offset += char.length;
  }
  const result: FontScriptCluster[] = [];
  let start = 0,
    riCount = chars[0]?.kind === "Regional_Indicator" ? 1 : 0;
  const emit = (end: number) => {
    if (end <= start) return;
    let base = start;
    while (base < end && inherited.has(chars[base].kind)) base++;
    const previous = result.at(-1);
    const inheritedBase =
      base === end && previous && !controls.has(chars[start].kind);
    const baseOffset = inheritedBase
      ? previous.base
      : chars[Math.min(base, end - 1)].from;
    // The complex-script slot is asked first: a character Unicode puts in one
    // of those scripts is drawn from w:cs whatever else claims it.
    const slot: FontScriptSlot = inheritedBase
      ? previous.slot
      : isComplexScriptFontCodePoint(chars[Math.min(base, end - 1)].cp)
        ? "cs"
        : isEastAsianFontCodePoint(chars[Math.min(base, end - 1)].cp)
          ? "eastAsia"
          : "primary";
    result.push({
      from: chars[start].from,
      to: chars[end - 1].to,
      base: baseOffset,
      slot,
    });
    start = end;
  };
  for (let i = 1; i < chars.length; i++) {
    const before = chars[i - 1],
      current = chars[i];
    let joins = before.kind === "CR" && current.kind === "LF";
    if (!joins && !controls.has(before.kind) && !controls.has(current.kind)) {
      joins =
        (before.kind === "L" &&
          ["L", "V", "LV", "LVT"].includes(current.kind)) ||
        (["LV", "V"].includes(before.kind) &&
          ["V", "T"].includes(current.kind)) ||
        (["LVT", "T"].includes(before.kind) && current.kind === "T") ||
        ["Extend", "ZWJ", "SpacingMark"].includes(current.kind) ||
        before.kind === "Prepend";
      if (!joins && current.incb === "Consonant") {
        let j = i - 1,
          linker = false;
        while (j >= 0 && ["Extend", "Linker"].includes(chars[j].incb)) {
          linker ||= chars[j].incb === "Linker";
          j--;
        }
        joins = linker && j >= 0 && chars[j].incb === "Consonant";
      }
      if (!joins && current.ep && before.kind === "ZWJ") {
        let j = i - 2;
        while (j >= 0 && chars[j].kind === "Extend") j--;
        joins = j >= 0 && chars[j].ep;
      }
      if (
        !joins &&
        before.kind === "Regional_Indicator" &&
        current.kind === "Regional_Indicator"
      )
        joins = riCount % 2 === 1;
    }
    if (!joins) emit(i);
    riCount = current.kind === "Regional_Indicator" ? riCount + 1 : 0;
  }
  emit(chars.length);
  return result;
}
export interface FontScriptSpan<T> {
  readonly text: string;
  readonly primary: T | null;
  readonly eastAsia: T | null;
  /** `<w:rFonts w:cs>` — the face every complex-script character is drawn from. */
  readonly complexScript: T | null;
  readonly word?: WordFontScriptContext;
}

export type WordFontHint = "default" | "eastAsia" | "cs";
export interface WordFontScriptContext {
  readonly hint: WordFontHint;
  readonly language?: string | null;
  readonly eastAsiaCharset?: string | null;
  readonly eastAsiaUsesPrimary?: boolean;
}

export function normalizeWordFontHint(value: unknown): WordFontHint | null {
  return value === "default" || value === "eastAsia" || value === "cs" ? value : null;
}

export function normalizeWordFontHintCharset(value: unknown): "86" | "88" | null {
  return value === "86" || value === "88" ? value : null;
}

export function normalizeWordFontHintLanguage(value: unknown): string | null {
  return typeof value === "string" && value.length <= 64 && /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8}){0,5}$/.test(value) ? value : null;
}

// MS-OI29500 2.1.88, rFonts. This adapter is opt-in: the shared Unicode
// grapheme classifier and callers without Word source context stay unchanged.
// https://learn.microsoft.com/openspecs/office_standards/ms-oi29500/aef3c9a6-5d6c-434b-90b7-85e761fd8e62
function wordFontScriptSlot(cp: number, context: WordFontScriptContext): FontScriptSlot {
  if (context.eastAsiaUsesPrimary || context.hint === "cs") return "primary";
  const eastHint = context.hint === "eastAsia";
  const chinese = /^zh(?:-|$)/i.test(context.language ?? "");
  const chineseCharset = /^(?:86|88)$/i.test(context.eastAsiaCharset ?? "");
  if (cp >= 0xa0 && cp <= 0xff) {
    const ambiguous = cp === 0xa1 || cp === 0xa4 || (cp >= 0xa7 && cp <= 0xa8)
      || cp === 0xaa || cp === 0xad || cp === 0xaf || (cp >= 0xb0 && cp <= 0xb4)
      || (cp >= 0xb6 && cp <= 0xba) || (cp >= 0xbc && cp <= 0xbf) || cp === 0xd7 || cp === 0xf7;
    const chineseLatin = (cp >= 0xe0 && cp <= 0xe1) || (cp >= 0xe8 && cp <= 0xea)
      || (cp >= 0xec && cp <= 0xed) || (cp >= 0xf2 && cp <= 0xf3)
      || (cp >= 0xf9 && cp <= 0xfa) || cp === 0xfc;
    return eastHint && (ambiguous || (chinese && chineseLatin)) ? "eastAsia" : "primary";
  }
  if (cp >= 0x100 && cp <= 0x2af)
    return eastHint && (chinese || chineseCharset) ? "eastAsia" : "primary";
  if (cp >= 0x1e00 && cp <= 0x1eff)
    return eastHint && chinese ? "eastAsia" : "primary";
  if ((cp >= 0x2b0 && cp <= 0x3cf) || (cp >= 0x400 && cp <= 0x4ff) || (cp >= 0x2000 && cp <= 0x27bf)
    || (cp >= 0x2e80 && cp <= 0x2eff) || (cp >= 0xe000 && cp <= 0xf8ff)
    || (cp >= 0xfb00 && cp <= 0xfb1c))
    return eastHint ? "eastAsia" : "primary";
  if ((cp >= 0x1100 && cp <= 0x11ff) || (cp >= 0x2f00 && cp <= 0x2fdf)
    || (cp >= 0x2ff0 && cp <= 0x319f) || (cp >= 0x3200 && cp <= 0x33ff) || (cp >= 0x3400 && cp <= 0x4dbf)
    || (cp >= 0x4e00 && cp <= 0x9faf) || (cp >= 0xa000 && cp <= 0xa4cf)
    || (cp >= 0xac00 && cp <= 0xd7af) || (cp >= 0xd800 && cp <= 0xdfff)
    || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe6f)
    || (cp >= 0xff00 && cp <= 0xffef) || cp > 0xffff)
    return "eastAsia";
  return "primary";
}
export interface FontScriptSlice<T> {
  readonly index: number;
  readonly from: number;
  readonly to: number;
  readonly slot: FontScriptSlot;
  readonly value: T | null;
}
/**
 * Whether a cluster is punctuation, space or a format control only.
 *
 * The same test the generation writer applies before it decides which run a
 * character joins: a space or a comma belongs to the script around it, not to
 * a run of its own, and a run that declares itself complex script draws every
 * character it holds from `w:cs`. Reading it the same way here keeps the page
 * and the printed page from disagreeing on where a word ends.
 */
const NEUTRAL_CLUSTER = /^[\p{P}\p{Z}\p{C}\s]*$/u;
/** Resolve a complete cluster from its base's slots, including mark-boundary
 * splits such as Han + a combining mark in an adjacent differently-bold run. */
export function resolveFontScriptSlices<T>(
  spans: readonly FontScriptSpan<T>[],
): FontScriptSlice<T>[] {
  const starts: number[] = [];
  let size = 0;
  for (const span of spans) {
    starts.push(size);
    size += span.text.length;
  }
  const indexAt = (position: number) => {
    let lo = 0,
      hi = starts.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (starts[mid] <= position) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const slices: FontScriptSlice<T>[] = [];
  const text = spans.map((span) => span.text).join("");
  // Resolve every cluster's slot first: the run a neutral cluster joins is
  // decided by the clusters around it, the way the writer decides it.
  const resolved = fontScriptClusters(text).map((cluster) => {
    const baseIndex = indexAt(cluster.base),
      base = spans[baseIndex];
    const hinted = base.word ? wordFontScriptSlot(text.codePointAt(cluster.base)!, base.word) : cluster.slot;
    // A span that names no complex-script face paints its complex-script text
    // from the Latin slot, because that is the face the writer puts in w:cs
    // when the document has no face of its own for the script. So a document
    // with no complex-script face routes exactly as it did before the slot
    // existed, down to the decorations it does not get.
    const slot: FontScriptSlot =
      cluster.slot === "cs" ? (base.complexScript ? "cs" : "primary") : hinted;
    const value =
      slot === "cs"
        ? base.complexScript
        : slot === "eastAsia"
          ? (base.eastAsia ?? base.primary)
          : base.primary;
    return { cluster, slot, value, baseIndex };
  });
  // Preceding first, then following, exactly as the writer does — and only
  // inside one span, because that is all the writer ever looks at: it splits a
  // single text node into segments. Two adjacent nodes stay two runs however
  // neutral the text between them reads.
  const joinsNeighbour = (entry: (typeof resolved)[number], neighbour: (typeof resolved)[number]) =>
    entry.slot !== "cs" && neighbour.slot === "cs" && neighbour.baseIndex === entry.baseIndex &&
    NEUTRAL_CLUSTER.test(text.slice(entry.cluster.from, entry.cluster.to));
  for (let i = 1; i < resolved.length; i++)
    if (joinsNeighbour(resolved[i], resolved[i - 1]))
      resolved[i] = { ...resolved[i], slot: "cs", value: resolved[i - 1].value };
  for (let i = resolved.length - 2; i >= 0; i--)
    if (joinsNeighbour(resolved[i], resolved[i + 1]))
      resolved[i] = { ...resolved[i], slot: "cs", value: resolved[i + 1].value };
  for (const { cluster, slot, value } of resolved) {
    let position = cluster.from;
    while (position < cluster.to) {
      const index = indexAt(position),
        span = spans[index],
        to = Math.min(cluster.to, starts[index] + span.text.length);
      const previous = slices.at(-1),
        from = position - starts[index],
        localTo = to - starts[index];
      if (
        previous &&
        previous.index === index &&
        previous.to === from &&
        previous.slot === slot &&
        previous.value === value
      )
        slices[slices.length - 1] = { ...previous, to: localTo };
      else slices.push({ index, from, to: localTo, slot, value });
      position = to;
    }
  }
  return slices;
}
