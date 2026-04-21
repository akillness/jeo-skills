# Triage
- Problem: `npm-git-install` is a legacy, command-dump skill that does not reflect modern Git-based package-install workflows, auth patterns, reproducibility concerns, package-manager differences, or the better alternatives teams now use.
- Audience: developers and AI coding agents working in Node/TypeScript repos who need to install packages from GitHub or other Git remotes, especially when packages are unpublished, private, branch-pinned, monorepo-scoped, or temporarily patched.
- Why now: the repo still has a high-utility CLI/developer-workflow gap here; the current skill has no support files or evals, and newer package-manager behavior plus real-world friction around prepare scripts, auth, and lockfile stability makes outdated guidance actively misleading.
