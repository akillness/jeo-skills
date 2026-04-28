# Triage

- Problem: Hourly survey artifacts capture transport fallback but can miss HTTP status from structured provider errors.
- Audience: Maintainers reviewing unattended hourly survey PRs.
- Why now: This run observed repeated `INVALID_API_KEY` transport failures while surveying candidates, so richer envelope capture is immediately useful.

Provenance: direct page retrieval
