# Solutions

## Solutions

### Upstream source of truth

- `revfactory/harness` README
- `skills/harness/SKILL.md`
- `skills/harness/references/*.md`

### Local packaging strategy

1. Create `.agent-skills/harness/SKILL.md`
2. Bundle curated upstream references in `references/upstream/`
3. Add a maintenance script to refresh those references
4. Update visible catalog surfaces

## Categories

- upstream research
- cross-platform adaptation
- skill packaging
- catalog/documentation sync

## Curated Sources

- `https://github.com/revfactory/harness`
- `https://raw.githubusercontent.com/revfactory/harness/main/README.md`
- `https://raw.githubusercontent.com/revfactory/harness/main/skills/harness/SKILL.md`
- GitHub contents API for `skills/harness/references`

## Key Insight

- 이미 존재하는 `docs/harness` 는 "추천 OSS" 문서이고, 사용자가 원하는 것은 "트리거 가능한 실제 skill" 이다.
- 따라서 가장 가치 있는 작업은 새로운 설명문을 쓰는 것이 아니라, upstream Harness를 `oh-my-skills` 스타일로 패키징하는 것이다.
