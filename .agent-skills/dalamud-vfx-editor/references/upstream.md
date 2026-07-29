# Upstream reference

- Repository: https://github.com/0ceal0t/Dalamud-VFXEditor
- Installation surface: XIVLauncher/Dalamud plugin repositories, with a main and beta channel described by the upstream project.

Repository metadata, Dalamud API requirements, SDK versions, release URLs, and repository manifest fields can change. Treat the current upstream `README`, `repo.json`, project file, lock files, and release page as authoritative. This skill does not vendor FFXIV game assets, plugin binaries, or copied copyrighted resources.

The operational workflow is intentionally conservative: use the supported plugin channel for the user's installed Dalamud version, snapshot user-owned files before editing, and report exact hashes and rollback paths. A source build is not considered verified merely because `dotnet restore` succeeds; the compatible Dalamud development environment and a controlled in-game test are required.
