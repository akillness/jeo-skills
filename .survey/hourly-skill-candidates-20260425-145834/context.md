# Context

## Workflow Context
- 대상 리포지토리: https://github.com/akillness/oh-my-skills
- 실행 방식: gh search 기반 survey + relevance gate + artifact validator
- 실행 시간: 2026-04-25T14:59:32Z [provenance: indexed snippet]

## Affected Users
- 스킬 유지보수자: 후보 품질과 재현성 보장이 필요
- PR 리뷰어: 레인별 근거/위험/검증 결과를 빠르게 판단해야 함

## Current Workarounds
- sparse/noisy lane 발생 시 lane-specific recovery query를 추가 실행
- graphify query 실패 시 fallback graphify-refined.json 생성

## Adjacent Problems
- web/frontend/backend/cli/game 레인 중 다수 degraded가 반복될 때 추천 편향 증가
- low-signal/unknown-license 후보가 추천으로 승격될 위험

## User Voices
- 운영 요구사항: 매 실행마다 RTK 요약, Graphify 정제, Obsidian/LLM-Wiki 반영 필수
- 운영 요구사항: 무근거 승격 금지, 실패 시 머지 금지
