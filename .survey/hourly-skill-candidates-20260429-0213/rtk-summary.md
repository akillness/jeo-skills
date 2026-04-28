# RTK Summary

- Method: token-efficient extraction via `rtk read` on raw evidence artifacts.
- Transport: gh api fallback (web_search returned INVALID_API_KEY).

## Lane: invalid-api-key
- raw_count: 2
- Story 2.8: Auth Error Codes (https://github.com/cirruslycurious/ai-learning-hub/issues/140)
- Error in website blog writer (https://github.com/AJaySi/ALwrity/issues/178)

## Lane: obsidian-cli
- raw_count: 1
- Obsidian, silently fails, no errors, doesn't start the program (https://github.com/NixOS/nixpkgs/issues/359254)

## Lane: graph-links
- raw_count: 10
- DiGraphExport (https://github.com/kaeawc/krit/issues/64)
- Move Dagre layout to Web Worker for large graph performance (https://github.com/NTCoding/living-architecture/issues/279)
- Add RTFM — open-source multi-domain retrieval layer for AI agents (https://github.com/aimcp/awesome-mcp/issues/24)

## Decision
- Selected ratchet: require storing `requestId`/`tag` from web_search transport failures in survey transport_status artifacts/checklists.
