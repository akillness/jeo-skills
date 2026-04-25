# oh-my-skills hourly run report (hourly-skill-candidates-20260426-021803)

## 실행 시각
- 2026-04-26 02:25:01

## backlog(이전 합의 항목) 처리 현황
- 명시적 합의(agreed/합의)된 미처리 항목을 찾지 못해 이번 실행은 신규 조사 기반으로 진행.

## 조사 키워드별 핵심 발견(링크)
- agentic ai skill: lane_status=pass, kept=3/40
  - AbdelhakRazi/flutter-bloc-clean-architecture-skill (14★): https://github.com/AbdelhakRazi/flutter-bloc-clean-architecture-skill
  - VoDaiLocz/Enhance-Prompt (10★): https://github.com/VoDaiLocz/Enhance-Prompt
  - iwe-org/skills (7★): https://github.com/iwe-org/skills
- web frontend skill: lane_status=degraded, kept=0/4
  - getdave/Frontend-Developers-Toolkit (29★): https://github.com/getdave/Frontend-Developers-Toolkit
  - luvletterldl/fdutil (1★): https://github.com/luvletterldl/fdutil
  - tjyuanpeng/ffd (0★): https://github.com/tjyuanpeng/ffd
- web backend skill: lane_status=pass, kept=3/19
  - cloudforet-io/python-core (13★): https://github.com/cloudforet-io/python-core
  - apollosoftwarexyz/cinnamon (4★): https://github.com/apollosoftwarexyz/cinnamon
  - JasonMetal/gin-develop-template (3★): https://github.com/JasonMetal/gin-develop-template
- cli open source skill: lane_status=pass, kept=5/25
  - jeremylongshore/claude-code-plugins-plus-skills (2020★): https://github.com/jeremylongshore/claude-code-plugins-plus-skills
  - Security-Phoenix-demo/security-skills-claude-code (25★): https://github.com/Security-Phoenix-demo/security-skills-claude-code
  - frank-luongt/faos-skills-marketplace (13★): https://github.com/frank-luongt/faos-skills-marketplace
- game development skill: lane_status=pass, kept=1/40
  - tjboudreaux/cc-plugin-unity-gamedev (3★): https://github.com/tjboudreaux/cc-plugin-unity-gamedev

## 신규 스킬 제안 TOP 3 (이유/근거 링크/예상 파일 경로)
1. jeremylongshore/claude-code-plugins-plus-skills
   - 이유: 신규 스킬 후보(라이선스/활동/신호 충족)
   - 링크: https://github.com/jeremylongshore/claude-code-plugins-plus-skills
   - 예상 파일: .agent-skills/claude-code-plugins-plus-skills/SKILL.md
2. Security-Phoenix-demo/security-skills-claude-code
   - 이유: 신규 스킬 후보(라이선스/활동/신호 충족)
   - 링크: https://github.com/Security-Phoenix-demo/security-skills-claude-code
   - 예상 파일: .agent-skills/security-skills-claude-code/SKILL.md
3. AbdelhakRazi/flutter-bloc-clean-architecture-skill
   - 이유: 신규 스킬 후보(라이선스/활동/신호 충족)
   - 링크: https://github.com/AbdelhakRazi/flutter-bloc-clean-architecture-skill
   - 예상 파일: .agent-skills/flutter-bloc-clean-architecture-skill/SKILL.md

## 기존 스킬 개선 제안 TOP 3 (개선 포인트/근거 링크/예상 수정 파일)
1. iwe-org/skills
   - 개선 포인트: 기존 스킬(marketing-skills-collection)에 최신 레퍼런스/운영 팁 보강 가능
   - 링크: https://github.com/iwe-org/skills
   - 예상 수정 파일: .agent-skills/marketing-skills-collection/SKILL.md, .agent-skills/marketing-skills-collection/references/*.md

## CLI 오픈소스 스포트라이트 (>=3: 이름/링크/라이선스/적용 아이디어)
- jeremylongshore/claude-code-plugins-plus-skills
  - 링크: https://github.com/jeremylongshore/claude-code-plugins-plus-skills
  - 라이선스: MIT License
  - 적용 아이디어: CLI 워크플로우/스킬 배포 레퍼런스에 반영
- Security-Phoenix-demo/security-skills-claude-code
  - 링크: https://github.com/Security-Phoenix-demo/security-skills-claude-code
  - 라이선스: MIT License
  - 적용 아이디어: CLI 워크플로우/스킬 배포 레퍼런스에 반영
- frank-luongt/faos-skills-marketplace
  - 링크: https://github.com/frank-luongt/faos-skills-marketplace
  - 라이선스: Apache License 2.0
  - 적용 아이디어: CLI 워크플로우/스킬 배포 레퍼런스에 반영

## 중복/리스크 체크
- duplicate risk: 기존 디렉터리명 유사도 기반으로 신규/개선 분류 수행
- degraded lane: web frontend skill:degraded
- single_lane_concentration: false

## 이전 실행 대비 diff 요약
- 이번 실행에서 survey reference에 noisy-lane stage-2 recovery 규칙 추가
- survey evals에 noisy-kept_count=0 프런트엔드 케이스 추가(id=19)
- 신규 skill 추가: `.agent-skills/claudekit/`

## 최종 상태
- PR 생성 완료(머지 대기)
