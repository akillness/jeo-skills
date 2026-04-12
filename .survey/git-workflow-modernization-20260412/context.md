# Context: git-workflow modernization

## Workflow Context
Modern teams still use PR platforms for review and merge policy, but the most failure-prone collaboration steps remain local Git operations: rebasing onto an updated base branch, resolving conflicts, force-pushing safely after history rewrites, and recovering from bad resets or rebases. Official GitHub and GitLab guidance both document hands-on rebase conflict loops (`git rebase --continue`, `--abort`, `--skip`) rather than abstracting them away in the UI. Git’s own docs continue to frame `--force-with-lease` and `reflog` as key safety tools for rewritten history and recovery.

Inside this repo, `git-workflow` is still a generic CLI cheat sheet with only a placeholder PR step, while adjacent skills already own planning (`task-planning`), review (`code-review`), and debugging/root-cause analysis (`debugging`). That makes `git-workflow` a high-value modernization target: sharpen it into the local Git collaboration and recovery anchor instead of letting it remain a blurry mega-skill.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| AI coding agent operator | Keep agent-generated branches, commits, rebases, and pushes safe and reviewable | Intermediate |
| Individual developer | Create clean branches/commits, rebase safely, recover from mistakes | Beginner to intermediate |
| Repo maintainer | Enforce safe collaboration habits and clean history without overwriting teammates | Intermediate to advanced |
| Small team lead | Teach pragmatic Git hygiene without turning every task into GitHub UI instructions | Intermediate |

## Current Workarounds
1. Use `git-workflow` for branch/commit mechanics, then mentally switch to other skills for review, planning, or debugging.
2. Follow official GitHub/GitLab docs for rebase conflict handling when the local branch diverges.
3. Rely on `git push --force-with-lease` after rebases instead of raw `--force` to avoid clobbering teammate updates.
4. Use `git reflog` as an emergency undo log after resets, rebases, and lost-commit mistakes.
5. Fall back to merge instead of rebase when the conflict cost is too high or the branch is already shared.

## Adjacent Problems
- Long-lived branches still create merge pain even in PR-centric workflows.
- Rebase improves linear history but increases risk if users do not understand history rewrites or lease-safe pushes.
- Recovery knowledge is uneven: many users can commit and open a PR, but cannot confidently undo resets or recover “lost” commits.
- This repo’s README currently markets `git-workflow` as covering PR workflows even though actual PR lifecycle guidance is thin and better handled by separate GitHub-focused skills or adjacent review workflows.

## User Voices
- Git push documentation: “`--force-with-lease` … will protect all remote refs that are going to be updated by requiring their current value to be the same as the remote-tracking branch we have for them.”  
  Source: https://git-scm.com/docs/git-push
- Git reflog documentation: “Reference logs, or ‘reflogs’, record when the tips of branches and other references were updated in the local repository.”  
  Source: https://git-scm.com/docs/git-reflog
- GitHub rebase-conflict guidance explicitly instructs users to resolve files locally, then run `git add` and `git rebase --continue`, which shows how much of collaboration safety still lives in CLI mechanics.  
  Source: https://docs.github.com/en/get-started/using-git/resolving-merge-conflicts-after-a-git-rebase
- Durable community evidence of recurring recovery pain: “How do I undo the most recent local commits in Git?”  
  Source: https://stackoverflow.com/questions/927358/how-do-i-undo-the-most-recent-local-commits-in-git
