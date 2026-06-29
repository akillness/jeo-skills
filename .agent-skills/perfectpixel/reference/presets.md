# PerfectPixel 동작 프리셋 카탈로그

`-states` 에 쓰는 영문 상태 키 목록. `ppgen -dump` 의 `presets` 와 동일한 단일 소스에서 생성됨.
각 항목: `키` (한국어 라벨) — 기본 프레임수 / fps / 반복여부.

## 기본 동작

- `idle` (대기) — 4프레임 / 6fps / 반복
- `idle-combat` (전투 대기) — 4프레임 / 8fps / 반복
- `walk` (걷기) — 6프레임 / 10fps / 반복
- `run` (달리기) — 6프레임 / 12fps / 반복
- `sprint` (전력 질주) — 6프레임 / 14fps / 반복
- `jump` (점프) — 5프레임 / 10fps / 단발
- `fall` (낙하) — 4프레임 / 10fps / 반복
- `land` (착지) — 4프레임 / 12fps / 단발
- `crouch` (웅크리기) — 4프레임 / 8fps / 단발
- `crawl` (기어가기) — 6프레임 / 8fps / 반복
- `climb` (오르기) — 6프레임 / 8fps / 반복
- `swim` (수영) — 6프레임 / 8fps / 반복
- `dash` (대시) — 4프레임 / 14fps / 단발
- `roll` (구르기) — 5프레임 / 14fps / 단발
- `slide` (슬라이딩) — 4프레임 / 12fps / 단발
- `sit` (앉기) — 4프레임 / 8fps / 단발
- `sleep` (잠자기) — 4프레임 / 4fps / 반복
- `turn` (돌아서기) — 4프레임 / 10fps / 단발

## 전투

- `attack` (공격) — 5프레임 / 12fps / 단발
- `attack-heavy` (강공격) — 6프레임 / 10fps / 단발
- `combo` (연속 공격) — 6프레임 / 14fps / 단발
- `slash` (베기) — 5프레임 / 14fps / 단발
- `stab` (찌르기) — 4프레임 / 14fps / 단발
- `punch` (주먹) — 4프레임 / 14fps / 단발
- `kick` (발차기) — 5프레임 / 14fps / 단발
- `uppercut` (어퍼컷) — 4프레임 / 14fps / 단발
- `block` (막기) — 3프레임 / 10fps / 반복
- `parry` (패링) — 4프레임 / 16fps / 단발
- `dodge` (회피) — 4프레임 / 16fps / 단발
- `backstep` (백스텝) — 4프레임 / 14fps / 단발
- `shoot` (사격) — 4프레임 / 14fps / 단발
- `reload` (재장전) — 5프레임 / 10fps / 단발
- `aim` (조준) — 3프레임 / 10fps / 반복
- `throw` (던지기) — 5프레임 / 12fps / 단발
- `charge-attack` (차지 공격) — 6프레임 / 12fps / 단발
- `spin-attack` (회전 공격) — 6프레임 / 14fps / 단발
- `guard-break` (가드 브레이크) — 4프레임 / 12fps / 단발
- `counter` (반격) — 5프레임 / 14fps / 단발
- `taunt` (도발) — 4프레임 / 8fps / 반복
- `draw-weapon` (무기 뽑기) — 5프레임 / 10fps / 단발

## 마법·스킬

- `cast` (시전) — 5프레임 / 12fps / 단발
- `cast-fire` (화염 시전) — 6프레임 / 12fps / 단발
- `cast-ice` (빙결 시전) — 6프레임 / 10fps / 단발
- `cast-lightning` (번개 시전) — 5프레임 / 14fps / 단발
- `cast-heal` (치유 시전) — 5프레임 / 8fps / 단발
- `summon` (소환) — 5프레임 / 10fps / 단발
- `channel` (집중) — 4프레임 / 8fps / 반복
- `buff` (강화) — 4프레임 / 10fps / 단발
- `shield-up` (보호막) — 4프레임 / 10fps / 단발
- `teleport` (순간이동) — 5프레임 / 14fps / 단발
- `transform` (변신) — 6프레임 / 10fps / 단발
- `power-up` (파워업) — 5프레임 / 10fps / 반복
- `meditate` (명상) — 4프레임 / 4fps / 반복
- `explode` (폭발) — 5프레임 / 16fps / 단발

## 피해·상태이상

- `hurt` (피격) — 3프레임 / 10fps / 단발
- `hurt-heavy` (강피격) — 4프레임 / 10fps / 단발
- `knockback` (넉백) — 4프레임 / 12fps / 단발
- `knockdown` (넘어짐) — 4프레임 / 10fps / 단발
- `get-up` (일어서기) — 5프레임 / 8fps / 단발
- `stun` (기절) — 4프레임 / 8fps / 반복
- `dizzy` (어지러움) — 4프레임 / 8fps / 반복
- `frozen` (빙결) — 3프레임 / 6fps / 반복
- `burning` (화상) — 4프레임 / 12fps / 반복
- `poisoned` (중독) — 4프레임 / 6fps / 반복
- `stagger` (비틀거림) — 4프레임 / 10fps / 단발
- `death` (사망) — 5프레임 / 8fps / 단발
- `death-fall` (추락사) — 4프레임 / 8fps / 단발
- `revive` (부활) — 6프레임 / 8fps / 단발
- `low-hp` (빈사) — 4프레임 / 6fps / 반복
- `defeat` (패배) — 4프레임 / 8fps / 단발

## 감정·표현

- `wave` (인사) — 4프레임 / 8fps / 반복
- `cheer` (환호) — 4프레임 / 10fps / 반복
- `clap` (박수) — 4프레임 / 10fps / 반복
- `bow` (절) — 4프레임 / 8fps / 단발
- `nod` (끄덕임) — 3프레임 / 8fps / 단발
- `shake-head` (도리질) — 4프레임 / 8fps / 단발
- `laugh` (웃음) — 4프레임 / 8fps / 반복
- `cry` (울음) — 4프레임 / 6fps / 반복
- `angry` (분노) — 4프레임 / 8fps / 반복
- `surprised` (놀람) — 3프레임 / 12fps / 단발
- `think` (생각) — 4프레임 / 6fps / 반복
- `point` (가리키기) — 4프레임 / 10fps / 단발
- `salute` (경례) — 4프레임 / 8fps / 단발
- `dance` (춤) — 6프레임 / 10fps / 반복
- `victory` (승리) — 4프레임 / 8fps / 반복
- `sad` (슬픔) — 4프레임 / 4fps / 반복
- `scared` (겁먹음) — 4프레임 / 8fps / 반복
- `yawn` (하품) — 4프레임 / 6fps / 단발

## 상호작용

- `pick-up` (줍기) — 4프레임 / 10fps / 단발
- `carry` (들기) — 6프레임 / 8fps / 반복
- `push` (밀기) — 6프레임 / 8fps / 반복
- `pull` (당기기) — 6프레임 / 8fps / 반복
- `open` (열기) — 4프레임 / 10fps / 단발
- `eat` (먹기) — 4프레임 / 8fps / 단발
- `drink` (마시기) — 4프레임 / 8fps / 단발
- `read` (읽기) — 4프레임 / 6fps / 반복
- `dig` (파기) — 6프레임 / 8fps / 반복
- `mine` (채굴) — 6프레임 / 10fps / 반복
- `chop` (베어내기) — 6프레임 / 10fps / 반복
- `fish` (낚시) — 5프레임 / 6fps / 반복

