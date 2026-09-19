# Shopping Shorts Harness Architecture

## Pattern

기본 패턴은 **supervisor + gated pipeline + research fan-out/fan-in + producer-reviewer**다.

```text
                         ┌─ platform-revenue-researcher ──┐
shopping-shorts-director ┤                                ├─ research fan-in
                         └─ product-evidence-researcher ──┘
                                      ↓
                       commerce-eligibility-auditor
                                      ↓ route + G0 receipt
                           creative-strategist
                                      ↓ concept approval
                     open-generative-ai-operator
                                      ↓ clips
                              assembly-editor
                                      ↓ final.mp4
                           policy-qa-reviewer
                                      ↓ PASS/FIX/BLOCK
                             release-controller
                                      ↓ external confirmation
                                  publish
```

플랫폼 수익 경로와 제품 근거 조사만 병렬화한다. 경로 선택은 두 조사 결과를 받은 뒤 실행하며, 렌더·조립·QA·공개는 선후 관계가 있어 직렬로 실행한다.

## File-based rule

에이전트 역할은 Task 프롬프트에 즉석으로 넣지 않는다. 모두 `.claude/agents/{name}.md`에 저장하고 재사용한다. 오케스트레이션 계약은 `.claude/skills/shopping-shorts-orchestrator/SKILL.md`에 둔다.

Claude Code Agent Teams를 사용할 때:

```bash
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
```

기능을 사용할 수 없는 런타임에서는 같은 파일 계약을 따라 순차 서브에이전트로 실행한다. 에이전트 팀 기능은 결과의 진실성을 보장하지 않으므로 산출물 파일과 독립 검증이 진실원이다.

## Agents

### 1. shopping-shorts-director

책임:

- 실행 생성·재개·종료.
- 단계 전환과 gate 판정.
- 병렬 리서치 fan-out과 fan-in.
- 한 실행 한 상품·한 선택 콘셉트·최대 한 출력 강제.
- `run.json`, `run-summary.md` 단독 소유.

금지:

- 리서치가 미완인데 렌더 요청.
- specialist 결과를 근거 없이 PASS로 변경.
- 공개·유료 호출 확인을 대신 승인.

### 2. platform-revenue-researcher

책임:

- YouTube·Instagram·TikTok·X·쿠팡·지그재그·네이버 카탈로그 20개 프로그램의 현재 공식 조건 조사.
- 게시 표면·수익 레일·상품 출처 분리.
- 자격·등록·attribution·요율·정산·고지·자동화·자산 권리 정규화.
- 소스 freshness와 미확인 항목 기록.

소유 파일: `research/commerce-platforms.json`.

### 3. commerce-eligibility-auditor

책임:

- 플랫폼 매트릭스 검증과 선택 경로 SHA-256 봉인.
- 상품 범주 위험과 현재 계정 자격 검토.
- 제휴 매체 등록, 협찬·제품 제공·본인 브랜드 관계.
- `commerce-ready|creative-only|blocked` 판정.

소유 파일: `intake/product.json`의 commerce section, `research/screens/*`, `strategy/commerce-route.json`, `validation/commerce.json`.

### 4. product-evidence-researcher

책임:

- 제품 identity와 material claims 확인.
- 제조사/매뉴얼/공공 안전정보/독립 리뷰 분리.
- 자산 권리, 출처, 해시, 사람·워터마크 검수.
- 실제 사용 경험의 부재를 명시.

소유 파일: `research/evidence.json`, `research/rights.json`.

### 5. creative-strategist

책임:

- 최대 세 콘셉트.
- 시청자·문제·첫 1초 시각 약속·증거·단서·CTA.
- 경쟁 영상에서는 추상 구조만 연구.
- 선택 콘셉트를 3~8 shot storyboard로 변환하고 selected-concept/render-plan SHA-256, 샷 순서·누적 시간·claim·asset ID를 봉인.

소유 파일: `strategy/concepts.json`, `strategy/selected-concept.json`, `production/storyboard.md`.

### 6. open-generative-ai-operator

책임:

- 고정 SHA 카탈로그에서 모델 계약 확인.
- MuAPI/GUI/Wan2GP 실행 lane 선택. Higgsfield CLI는 HOLD admission 전까지 선택 금지.
- 9:16, 입력 자산, 길이, endpoint, 견적, 잔액 확인.
- 승인 후 job 제출과 폴링.
- output 다운로드와 provenance.

소유 파일: `production/render-plan.json`, `production/provider-requests.json`, `production/jobs.json`, `production/clips/`.

금지:

- 키 출력.
- 비용 미확정 호출.
- 가짜 clipping 좌표 사용.
- 모델 합성 글씨·자막·워터마크가 남거나 제품 정체성이 바뀐 샷 수락.
- 읽히는 글씨·자막·로고·워터마크 생성을 요구하는 prompt/provider payload 사용.

### 7. assembly-editor

책임:

- ffmpeg 타임라인.
- voiceover/BGM과 typewriter·최대 2줄 후반 자막의 9:16 출력. ASS는 caption plan에서 재생성한 전체 바이트와 정확히 일치.
- 입력·출력 중간 경로와 output leaf symlink 차단.
- 시작·중간·끝 프레임, 전체 재생, 오디오 waveform, ffprobe 측정.

소유 파일: `assembly/timeline.json`, `assembly/captions.json`, `assembly/captions.ass`, `assembly/final.mp4`. 측정 결과는 policy QA에 넘겨 `validation/qa.json`에 기록한다.

### 8. policy-qa-reviewer

책임:

- 제작자와 독립된 evidence-first QA.
- claim coverage, 가짜 체험담, AI 공개, 상업 고지, 가상인물 라벨.
- 제품 시각 정체성과 시연 정확성.
- 레퍼런스 표현 복제와 대량 템플릿 여부.
- 최종 MP4·고유 원본 클립·시작/중간/끝 프레임 SHA-256에 묶인 generated-text review receipt.
- TikTok/X screen control의 공식 source·판정·KST 시각·검수자·화면 이미지 SHA-256.
- PASS/FIX/BLOCK.

소유 파일: `validation/qa.json`, `validation/frames/*`.

수정은 직접 하지 않고 findings와 acceptance criteria만 반환한다.

### 9. release-controller

책임:

- 최종 MP4와 메타데이터 패킷의 exact digest.
- 제목, 설명, 고지, AI 표시, 제품 태그, 채널 일치.
- 외부 확인 아티팩트 작성.
- 확인 후 업로드·게시, 공개 후 read-back.

소유 파일: `release/package.json`, `release/receipt.json`.

금지:

- director나 이전 확인을 현재 공개 승인으로 해석.
- 파일·문구·채널·비용이 바뀌었는데 확인 재사용.

## Ownership matrix

| Path | Sole writer | Readers |
|---|---|---|
| `run.json` | director | all |
| `intake/product.json` | commerce auditor | platform research, evidence, creative, QA |
| `research/commerce-platforms.json` | platform revenue researcher | commerce auditor, director, QA |
| `research/evidence.json`, `research/rights.json` | evidence researcher | creative, operator, QA |
| `research/screens/*`, `strategy/commerce-route.json` | commerce auditor | creative, operator, QA, release |
| `strategy/concepts.json`, `strategy/selected-concept.json` | creative strategist | operator, QA, release |
| `validation/commerce.json` | commerce auditor | director, QA, release |
| `production/*` | OGA operator | assembly, QA |
| `assembly/*` | assembly editor | QA, release |
| `validation/qa.json`, `validation/frames/*` | policy QA | director, release |
| `release/*` | release controller | director |

같은 파일의 병렬 편집을 금지한다. 요청이 겹치면 director가 새 path를 할당하거나 순서를 정한다.

## Inter-agent messages

메시지는 자유 산문보다 아래 형식을 쓴다.

```json
{
  "from": "product-evidence-researcher",
  "to": "creative-strategist",
  "run_id": "...",
  "type": "handoff",
  "artifact_paths": ["research/evidence.json", "research/rights.json"],
  "decision": "PASS",
  "blocking_findings": [],
  "assumptions": [],
  "next_action": "Draft up to three concepts using verified claim ids only."
}
```

다른 에이전트의 결론을 수정하려면 원 소유자에게 `challenge` 메시지를 보내고 새 근거를 첨부한다.

## Stage transitions

### Stage 0: Intake

Director가 정확한 상품과 현재 실행의 출력 범위를 봉인한다.

Exit:

- 상품 URL과 identity 있음.
- 입력 자산 경로 목록 있음.
- 출력 최대 한 편.

### Stage 1: Parallel research and route selection

Platform revenue researcher와 evidence researcher를 동시에 실행한다. 두 결과가 완성된 뒤 commerce auditor가 현재 계정 UI를 대조해 한 경로를 선택한다.

Fan-in exit:

- 한국 카탈로그의 필수 20개 수익·커머스·고지 프로그램과 공식 소스·freshness 완성.
- material claim 목록과 rights manifest 완성.
- 선택 경로, 계정 자격, 매체 등록, 자산 조건, 고지 방법 확정.
- platform research와 route SHA-256이 `validation/commerce.json`과 일치.
- commerce mode 확정, `blocked`가 하나도 없음.

### Stage 2: Concept

Creative strategist가 세 후보 이내로 작성한다.

Exit:

- 한 콘셉트 선택.
- 선택 근거와 기각 이유.
- storyboard가 verified claim만 사용.
- 사람 승인 또는 명시적 자동화 승인 범위 일치.

### Stage 3: Render

OGA operator가 비용 전 단계까지 준비한다. 유료 실행은 별도 확인 뒤 시작한다.

Exit:

- 모든 shot job 완료.
- output hash와 provenance.
- 제품 identity spot-check.

### Stage 4: Assembly

Assembly editor가 final.mp4를 만든다.

Exit:

- ffprobe 기술 조건 통과.
- 전체 재생과 3 frame visual check.

### Stage 5: Independent QA

Policy QA reviewer가 PASS/FIX/BLOCK을 반환한다.

- FIX: director가 한 번의 수정 범위를 지정.
- 두 번의 수정 뒤에도 material defect: BLOCK.
- PASS: release package 작성 가능.

### Stage 6: Release

Release controller가 exact package를 보여주고 외부 행동 확인을 받는다.

Exit:

- 공개 URL read-back.
- 라벨·설명·제품 태그 확인.
- receipt에 공개 시각과 URL 기록.

## Harness invariants

1. 한 실행에서 최종 MP4는 최대 하나.
2. `revision_loops <= 2`.
3. `creative-only`는 제품 태그·제휴 링크·수익 보장·자동 유료 렌더를 사용할 수 없음.
4. 권리 근거 없는 자산이 하나라도 있으면 pre-render FAIL.
5. live 플랫폼 조사는 7일을 넘기지 않으며 상품별 요율·재고는 공개 직전에 다시 확인.
6. 계정 자격·매체 등록·자산 조건 중 하나라도 미확인이면 `commerce-ready` 금지.
7. YouTube Shorts 이외의 Instagram Reels·TikTok·X·네이버 클립은 release adapter가 없는 연구·creative-plan 표면이다.
8. `announced|retiring|enrollment-closed|ended|not-available|unknown` 프로그램과 catalog의 `research-only|supporting-only`를 primary commerce rail로 선택하지 않음.
9. `unverified` claim은 대사·자막·화면 시연에 등장할 수 없음.
10. 현실적인 AI 시연은 선택 플랫폼의 AI 공개 대상 여부를 별도 판정.
11. 가상인물 추천은 등장 동안 인접 라벨.
12. QA 작성자는 production·assembly writer와 달라야 함.
13. 유료 호출과 공개는 각각 독립 확인 필요.
14. 외부 결과는 API 성공이 아니라 다운로드 파일·공개 URL을 다시 읽어 확인.
