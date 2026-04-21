# Triage
- Problem: `git-submodule` is still a command-dense legacy skill instead of a decision-first operator guide for adding, updating, automating, or escaping Git submodules safely.
- Audience: developers and agents maintaining repositories that vendor external code as separate Git histories, especially in multi-repo, fork, or CI-heavy workflows.
- Why now: the utilities/developer-workflow lane already has cleaner anchors for Git collaboration and Git-based package delivery; `git-submodule` is one of the remaining high-utility skills without support files or evals, and its current shape hides the real boundary between submodules, subtrees, vendoring, and package-manager alternatives.
