## Summary
- 시간별 5개 lane survey를 수행하고 slug 고정 아티팩트를 생성했습니다.
- lane health metric, recovery query, provenance를 evidence에 기록했습니다.
- 저위험 개선으로 survey 레퍼런스 가드레일 문서를 추가했습니다.

## Evidence / Provenance
- Artifact:
  - .survey/hourly-skill-candidates-20260506-060208/evidence.json
  - .survey/hourly-skill-candidates-20260506-060208/rtk-summary.md
- Provenance labels used: indexed snippet, feed recovery, direct page retrieval, thin evidence

## Risk
- 일부 lane에서 결과 품질이 낮아 degraded로 분류될 수 있습니다.
- no-checks-reported 환경에서는 merge를 보류합니다.

## Rollback Plan
- 본 PR revert 1회로 원복 가능 (문서/아티팩트 변경 중심).

## Validation
- survey validator: validator script not found
- git diff --check: clean
- skill validator:   Issues: 0 errors, 0 warnings
