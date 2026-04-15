# Migration Playbook

Use this when the repo is already messy.

## Goal
Improve structure without forcing a heroic rewrite.

## Sequence
1. **Name the target vocabulary**
   - top-level folders
   - what counts as a feature/domain
   - when code becomes shared
   - naming conventions for files and folders

2. **Pick one migration slice**
   - one feature
   - one backend module
   - one docs section
   - one game system/content area

3. **Move the hottest path first**
   Prefer the area people edit every week, not the oldest dead zone.

4. **Preserve stability while moving**
   - aliases or compatibility exports if needed
   - small README notes for changed paths
   - package/public-API guards if using workspaces

5. **Freeze junk-drawer growth**
   New code should stop entering `misc/`, `common/`, `helpers/`, `utils/`, or equivalent buckets unless they have an explicit owner and rule.

6. **Backfill deliberately**
   Clean old areas only after the new placement rules are already being followed.

## Migration do/don't
### Do
- move one boundary at a time
- publish simple placement rules
- track exceptions explicitly
- let old and new coexist temporarily when necessary

### Don't
- rename everything in one PR unless the repo is tiny
- invent new shared folders just to avoid choosing an owner
- turn migration into a tooling rewrite unless that is the actual bottleneck
- confuse file movement with environment or deployment work

## Signs the migration is working
- contributors know where the next file goes
- fewer files land in generic shared buckets
- route/domain changes stay locally scoped
- package extraction becomes rarer and more intentional
- repo docs describe the shape in a few lines, not a wall of exceptions
