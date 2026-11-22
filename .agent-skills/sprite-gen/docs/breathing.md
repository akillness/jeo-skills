# Breathe 레이어: 호흡(idle breathing) · 정지 자세 행 — 스프젠 후처리 레이어 계약

> Owns: The idle-breathing post-process layer and the static-pose row recipe · Index: [docs/README.md](README.md)

## 두 모드 — pixel 과 smooth

Breathe 레이어는 큐레이션 사이드카의 행마다 `states.<state>.breathe`로 설정하는 후처리 레이어다. `mode` 값으로 `pixel`과 `smooth`를 지원한다.

모드 선택 기준은 다음과 같다.
- `pixel`: 기본값이다 (`mode` 키를 생략하거나 `"pixel"`로 지정). 픽셀 아트를 위한 모드로, 정수 행과 열 단위의 워프를 사용해 픽셀 그리드를 온전히 유지한다. 출력 바이트와 정규화된 사이드카는 기존과 동일하며 기본 동작도 바뀌지 않았다. 작은 스프라이트와 픽셀 아트에 적합하다.
- `smooth`: 대형 일러스트, 채색된 캐릭터, 비디오 프레임에 사용한다. 픽셀 워프를 적용했을 때 몸통과 함께 머리 전체가 들리거나, 복제된 행이 셀 사이에서 깜빡임(flicker)으로 읽히는 문제를 해결한다.

`pixel`은 늘어난 내용이 셀의 위쪽, 왼쪽, 오른쪽 밖으로 나가면 자르지 않고 굽기를 거부한다. 거부 메시지는 넘어간 변마다 셀 밖의 불투명 픽셀 수를 밝히며, 모서리 밖의 픽셀은 두 변에 모두 센다. 넘어간 변이 그림 자체의 테두리인지도 굽는 프레임에서 읽는다. 바깥 행이나 열을 그림이 그 변 길이의 2% 이상 덮으면 테두리로 본다([docs/video-pipeline.md](video-pipeline.md) 3절). 이때 메시지는 그림이 그 변에서 덮는 픽셀 수를 밝히고, 프레임에 잘린 큰 그림이나 비디오 셀에는 머리와 프레임 가장자리가 제자리에 남는 `--mode smooth`(사이드카에서는 `mode: "smooth"`)를 안내한다. 셀에 여백을 더해 구운 뒤 다시 자르면 밖으로 밀린 부분이 알림 없이 사라지므로 그렇게 처리하지 않는다. 픽셀 스프라이트에는 셀 여백을 넓히거나 숨의 크기(`depth`, 또는 아래 "숨의 크기" 절의 최소와 최대)를 줄이라고 안내하며, 큐레이터 미리보기도 같은 프레임을 같은 문구로 거부한다. 프레임의 왼쪽이나 오른쪽에 닿은 소매는 `pixel`의 가로 늘림에서 셀 밖으로 밀려 거부될 수 있고, 내쉬는 단계에서는 안으로 당겨져 가장자리에 틈이 생긴다. 아래쪽에 닿은 그림에서는 1 px 윤곽선 가늘게 만들기가 잘린 단면을 윤곽선으로 읽어 변형된 프레임의 픽셀 몇 개를 지울 수 있다.

smooth 모드의 고정 영역과 동작 방식은 다음과 같다.
- 머리와 강체 경계(해부학 측정이 찾은 목 라인) 위의 모든 픽셀은 모든 셀에서 바이트 단위로 제자리를 유지한다. 인물 하단 역시 제자리에 고정된다.
- rigid row, body axis, torso half width, basis rows로 이루어진 pixel 모드의 자동 해부학 측정에 강체 경계상의 목 너비를 추가해 사용한다. 모든 측정은 행의 첫 셀에서 한 번만 수행되며 해당 셀의 배치가 행 전체에 그대로 쓰인다. 비디오 셀 사이에서 정수리가 1픽셀 흔들려도 경계는 움직이지 않는다.
- 가슴은 목 아래 몸통의 `chest_y` 지점, 몸통 중심축에 위치한 원형 가중치(cos^2)를 중심으로 호흡한다. 가중치 너비는 몸통 반폭의 `chest_rx`배, 높이는 목 아래 몸통 높이의 `chest_ry`배다. 들숨 시 가슴 중심은 기준 행의 `depth`배만큼 상승하고, 가슴 타원 중심이 아닌 정점 P에서 바깥쪽으로 `depth_x`만큼 부풀어 오른다.
- 목 바로 아래 중심축 양쪽에 위치한 원형 어깨 가중치 두 개는 가슴 상승량의 `shoulder`배만큼, 가슴보다 `shoulder_lag` 호흡 주기만큼 늦게 올라간다. 측정된 너비 안쪽의 목과 목과 어깨 사이의 칼라(collar)는 움직이지 않는다. 행 전체가 통째로 오르내리지 않는다.
- 한 번의 호흡은 정지 상태에서 솟아오르는 형태다. 들숨이 호흡에서 차지하는 비율은 `inhale` 키로 정한다 (기본값 0.40, 따라서 기본적으로 들숨 40%, 날숨 60%). 다른 곳에서 만든 호흡은 이 키로 자신의 들숨 비율을 명시할 수 있다. 위상 0의 셀이 원본과 바이트 단위로 일치하므로 루프의 이음매와 루프 간 연결부가 온전히 유지된다. `breaths`는 1부터 8까지의 정수로 루프 길이에 정확히 맞춘다. 외부에서 호흡 타이밍을 맞추기 위해(예: 클립 내 큰 손 동작을 피하려는 경우) 각 들숨이 정점에 도달하는 셀 목록인 `breath_peaks`를 지정할 수 있다. 호흡 횟수는 정점의 개수가 되며, `breaths`를 함께 지정할 경우 일치해야 한다. 첫 셀은 정지 상태를 유지하고 루프는 정지 상태로 끝난다. 호흡은 셀 0, 두 정점 사이에서 날숨이 간격의 1 - inhale을 차지하고 다음 들숨이 inhale을 차지하는 지점(기본값에서는 60%와 40%), 루프 끝의 정지 상태로 구분된다.
- 한 행은 루프 자체일 수도 있고, 어떤 루프에서 빠져나가거나 루프로 들어오는 짧은 구간(루프의 한 토막)일 수도 있다. `loop_cells`는 그 행이 호흡을 이어받는 루프의 셀 수이고 (2 이상의 정수), `start_cell`은 그 행이 시작하는 루프의 셀이다 (0 이상 loop_cells 미만의 정수, 기본값 0). 행의 셀 i는 루프의 셀 (start_cell + i) mod loop_cells의 위상을 같은 부동소수점 값 그대로 갖고, 박자(`breaths`, 또는 정점 셀이 그 루프의 셀인 `breath_peaks`)는 루프의 것이다. 따라서 행의 첫 셀이 반드시 정지 상태인 것은 아니다. `loop_cells`를 생략하거나 null로 두면 행은 자신의 셀 수를 가진 자기 자신의 루프이고, 두 키를 모두 생략하면 위상과 베이크는 이전과 바이트 단위로 동일하다. 정규화된 smooth 설정, 즉 `breathe.json`의 `config`에는 두 키가 항상 담기며, 생략하면 `start_cell: 0`과 `loop_cells: null`로 기록된다.

몸이 한쪽으로 돌아간 경우 다음 키들을 조절한다.
- `chest_tilt`: 가슴 가중치를 회전한다 (도 단위, 화면 기준 시계 방향).
- `chest_bias`: 가슴 타원 장축을 따라 가중치 정점 P를 가로 반폭의 비율로 이동한다 (-0.9에서 0.9까지, 음수는 화면 왼쪽). 가중치는 P에서 각 점을 지나는 반직선을 따라 타원 가장자리로 떨어지므로, 가까운 쪽은 짧은 거리에 걸쳐 떨어지고 먼 쪽은 긴 거리에 걸쳐 떨어진다. 가슴 또한 타원 중심이 아닌 P에서 바깥쪽으로 부풀어 오른다.
- `chest_bias_y`: 장축의 수직 방향으로 정점 P를 세로 반높이의 비율로 이동한다 (-0.9에서 0.9까지, 양수는 아래쪽). 정점 P는 타원 내부에 머물러야 하므로, `chest_bias`와 `chest_bias_y`를 합쳐 반지름의 최대 0.9까지만 허용된다 (그렇지 않으면 거부).
- `chest_dir`: 가슴 이동 방향을 수직에서 회전한다 (도 단위, 음수는 위쪽 왼쪽 방향).
- `chest_x`: 몸통 중심축에서 가슴 타원의 중심을 몸통 반폭 단위로 이동한다 (-1에서 1까지). 긴 머리 등으로 인해 몸통 중심축이 한쪽으로 쏠린 인물의 경우 가슴이 중심축 위에 위치하지 않는다. 어깨는 몸통 중심축 기준 기존 위치를 유지한다.
- `chest_flat`: 정점 P에서 가장자리까지 완전히 상승하는 구간의 비율이다 (0에서 0.9까지).
- 왼쪽을 바라보는 몸체에는 음수 값을 사용한다. 이들 키의 기본값은 모두 0이며, 새 값들이 0이거나 생략되면 기존과 동일한 바이트를 출력하고 아무 변화가 없다.

사이드카 키와 기본값, 허용 범위는 다음과 같다.

| 키 | 기본값 | 허용 범위 | 설명 |
|---|---|---|---|
| `depth` | 0.0085 | 0.005에서 0.20 | 들숨 시 가슴 중심 상승 배율 (흉상 일러스트 기준 프레임 높이의 약 0.5%) |
| `depth_x` | 0.028 | 0에서 0.20 | 정점 P에서 바깥쪽으로 부풀어 오르는 폭 |
| `chest_y` | 0.31 | 0.05에서 0.95 | 목 아래 몸통 기준 가슴 중심 세로 위치 |
| `chest_rx` | 0.83 | 0.2에서 3.0 | 몸통 반폭 대비 가슴 가중치 가로 배율 |
| `chest_ry` | 0.28 | 0.05에서 1.5 | 목 아래 몸통 높이 대비 가슴 가중치 세로 배율 |
| `shoulder` | 0.5 | 0에서 1.5 | 가슴 상승량 대비 어깨 상승 배율 |
| `shoulder_lag` | 0.08 | 0에서 0.3 | 가슴 대비 어깨 상승 지연 주기 |
| `chest_tilt` | 0 | -60에서 60 | 가슴 가중치 회전 각도 (도 단위, 시계 방향) |
| `chest_bias` | 0 | -0.9에서 0.9 | 가슴 타원 장축 방향 정점 P 이동 (가로 반폭 비율, 음수는 화면 왼쪽) |
| `chest_bias_y` | 0 | -0.9에서 0.9 | 장축 수직 방향 정점 P 이동 (세로 반높이 비율, 양수는 아래쪽) |
| `chest_dir` | 0 | -90에서 90 | 가슴 이동 방향 각도 (도 단위, 음수는 위쪽 왼쪽) |
| `chest_x` | 0 | -1에서 1 | 몸통 중심축 기준 가슴 타원 중심 이동 (몸통 반폭 단위) |
| `chest_flat` | 0 | 0에서 0.9 | 정점 P에서 가장자리까지 완전히 상승하는 구간 비율 |
| `inhale` | 0.40 | 0.2에서 0.8 | 한 번의 호흡에서 들숨이 차지하는 비율. 들숨은 이 위상에서 정점에 이르고 나머지는 날숨이다 |
| `loop_cells` | 행 자신의 셀 수 | 2 이상의 정수 | 행이 호흡을 이어받는 루프의 셀 수. 생략하면 행이 곧 자신의 루프다 |
| `start_cell` | 0 | 0 이상 loop_cells 미만의 정수 | 행이 시작하는 루프의 셀. 행의 셀 i는 루프의 셀 (start_cell + i) mod loop_cells의 위상을 갖는다 |
| `breaths` | - | 1에서 8 | 루프에 들어맞는 정수 호흡 횟수 |
| `breath_peaks` | - | - | 각 들숨 정점 셀 목록 (외부 타이밍 조절용) |
| `chest_round` | 0 (꺼짐) | 0에서 0.20 | pixel 둥근 가슴: 들숨 정점에서 가슴 테두리가 꼭대기 P 에서 바깥으로 나가는 양 (목 아래 몸통 높이 비율, 아래 "둥근 가슴" 절) |
| `arms_x` | 0 (꺼짐) | 0에서 0.20 | pixel 둥근 가슴: 들숨 정점에서 팔이 몸 바깥쪽으로 가로로 통째 밀리는 양 (목 아래 몸통 높이 비율) |
| `width_min`, `width_max` | - (세기를 쓴다) | -0.20에서 0.20 | 숨의 크기를 세기 대신 양 끝으로 적는다: 몸통 가로의 최소와 최대 (아래 "숨의 크기" 절). 두 모드 공통 |
| `height_min`, `height_max` | - (세기를 쓴다) | -0.20에서 0.20 | 같은 방식의 세로 최소와 최대. `depth`, `depth_x`와 같이 적으면 거부된다 |

거부 조건은 다음과 같다.
- 허용 범위를 벗어난 값은 무시되지 않고 거부된다. pixel 행에 smooth 전용 형상 키(`chest_y`, `chest_rx`, `chest_ry`, `shoulder`, `shoulder_lag`, `chest_tilt`, `chest_bias`, `chest_bias_y`, `chest_dir`, `chest_x`, `chest_flat`, `inhale`)나 `breath_peaks`, 또는 역시 smooth 전용인 `start_cell`과 `loop_cells`를 지정해도 무시되지 않고 거부된다. 예외는 둥근 가슴 pixel 행(`chest_round`나 `arms_x`가 0보다 큼)이다. 이 행은 가슴 타원 키(`chest_y`, `chest_rx`, `chest_ry`, `chest_tilt`, `chest_bias`, `chest_bias_y`, `chest_x`)와 `inhale`, `breath_peaks`, `start_cell`, `loop_cells`를 smooth 와 같은 검사로 받는다.
- 루프의 한 토막에 대한 값도 조정하거나 감싸지 않고 거부한다. `start_cell`이 음수이거나 정수가 아닌 경우, `loop_cells`가 2 미만이거나 정수가 아닌 경우, `start_cell`이 `loop_cells` 이상인 경우, `loop_cells`를 생략한 채 `start_cell`이 행의 셀 수 이상인 경우(베이크 시점에 거부), 그리고 `breath_peaks`의 마지막 정점이 `loop_cells`의 끝에서 한 셀 이내인 경우가 그렇다.
- 정점 P는 타원 내부에 머물러야 하므로, `chest_bias`와 `chest_bias_y`를 합쳐 반지름의 0.9를 초과하면 거부된다.
- `breath_peaks`에 셀 0의 정점이 포함되거나, 정점이 증가하는 순서가 아니거나, 정점 간격이 2셀보다 가깝거나, 마지막 정점이 루프 끝에서 1셀 이내인 경우 거부된다. `breaths`가 함께 지정되었으나 정점 개수와 일치하지 않는 경우도 거부된다.
- smooth 모드에 `lag`(pixel 모드의 진행파)를 지정하면 첫 셀을 움직이게 되므로 무시되지 않고 거부된다.
- 세기(`depth`, `depth_x`)와 최소, 최대(`width_min`, `width_max`, `height_min`, `height_max`)를 한 행에 같이 적으면 어느 쪽을 따를지 고르지 않고 거부한다. 최소가 최대보다 큰 축, 수가 아닌 값(참거짓 포함)도 거부한다.
- 행별 변형 한도(0.25)를 넘는 신장, 접히는(fold) 변위장, 불투명 픽셀이 캔버스 밖으로 밀려나는 경우는 조용히 한도 내로 자르지 않고 즉시 거부한다.
- 기본 형상에서는 가슴 가중치가 몸체 내부에서 0으로 떨어지므로, 인물이 화면 가장자리나 하단에서 잘려 있어도 거부되지 않으며 픽셀이 손실되지 않는다.
- 합성한 960 x 960 셀을 Apple M1에서 측정한 굽기 시간은 셀당 `smooth` 약 0.1초, 1 px 윤곽선이 있는 그림의 `pixel` 약 0.05초다. PNG 읽기와 쓰기는 측정에서 제외했다.

비디오 루프 셀처럼 큐레이션 실행이 아닌 프레임 폴더를 처리할 때는 독립 명령어를 사용한다.

```bash
sprite-gen breathe <frames> <out> [--mode pixel|smooth] [--depth D] [--depth-x D] [--width-min W] [--width-max W] [--height-min H] [--height-max H] [--breaths N] [--breath-peaks ...] [--lag L] [--rigid-row R] [--axis-x X] [--torso-half T] [--chest-y ...] [--chest-rx ...] [--chest-ry ...] [--shoulder ...] [--shoulder-lag ...] [--chest-tilt ...] [--chest-bias ...] [--chest-bias-y ...] [--chest-dir ...] [--chest-x ...] [--chest-flat ...] [--inhale S] [--loop-cells N] [--start-cell K] [--reference FRAME.png] [--avoid-region X0,Y0,X1,Y1 [--avoid-anchor X0,Y0,X1,Y1] [--fps F]] [--chest-round S] [--arms-x S] [--hold-mask MASK.png] [--props-mask MASK.png] [--props-behind-mask MASK.png] [--props-groups piece|colour]
```

`<frames>`는 파일 이름 순서대로 재생되는 PNG 프레임 폴더다. 사이드카와 동일한 검증과 베이크 처리를 거치므로 같은 값이면 동일한 바이트를 출력한다. 변환된 프레임들을 원본과 동일한 이름으로 저장하고, 적용된 설정과 위상 및 해부학 측정값을 담은 `breathe.json`을 새 폴더에 한 번에 작성한다. 심볼릭 링크를 추적하고 대소문자를 구분하지 않는 디스크의 서로 다른 표기를 동일하게 취급하는 실제 위치를 기준으로, `<out>`과 `<frames>`가 같은 폴더이거나 어느 한쪽이 다른 쪽 내부에 있는 경우 및 이미 존재하면서 비어 있지 않은 폴더는 아무것도 생성하거나 삭제하지 않고 거부하되 기존의 빈 폴더는 허용한다. `<frames>` 폴더에는 어떤 파일도 새로 쓰지 않으며, 프레임을 비롯한 기존 파일을 변경하거나 삭제하지 않는다. 결과물은 `<out>` 옆에 다른 폴더와 겹치지 않는 고유한 이름의 자체 임시 폴더에서 빌드한 뒤 한 번에 제자리로 이동하며, 작업을 완료하지 못했을 때도 오직 직접 만든 임시 폴더만 삭제하고 이전 작업의 잔여 폴더처럼 직접 만들지 않은 폴더는 그대로 둔다.

`--axis-x X`와 `--torso-half T`는 사이드카의 `axis_x`·`torso_half`(큐레이터 영역 UI 가 쓰는 사람의 오버라이드)와 같은 값이다. 몸통 축 열과 몸통 반폭을 주면 그 반폭 밖의 열이 부속(팔)이 된다. 둘 다 생략하면 이전과 같이 잰다.

## 숨의 크기: 세기, 또는 가로와 세로의 최소와 최대

숨이 얼마나 크게 오가는지는 두 방식 중 하나로 적는다. 곡선의 모양과 박자(`breaths`, `breath_peaks`, `lag`, `inhale`)는 어느 방식이든 같고, 크기를 적는 법만 다르다.

- 세기: `depth`와 `depth_x`(CLI `--depth`, `--depth-x`). pixel은 원래 크기를 가운데 두고 양쪽으로 같은 만큼 오가고, smooth는 쉼(원본)에서 들숨 꼭대기까지 오른다. 기존 방식이며 출력 바이트는 바뀌지 않았다.
- 가로와 세로 최소와 최대: `width_min`, `width_max`, `height_min`, `height_max`(CLI `--width-min`, `--width-max`, `--height-min`, `--height-max`). 숨이 오가는 양 끝을 원본 대비 비율로 직접 적는다. 0이 원래 크기라 최소를 0으로 두면 숨이 원본보다 작아지지 않는다.

단위는 다음과 같다.
- 가로: 숨이 가장 큰 행에서 몸통이 원래 폭보다 넓어지는 몫이다. pixel은 봉투가 가장 큰 행, smooth는 가슴이 부푸는 정점 P다. 음수는 좁아짐이다.
- 세로: 목 아래 몸 높이(기준 행 아래) 대비 pixel은 머리 끝이, smooth는 가슴이 올라가는 몫이다. 음수는 내려감이다.
- 범위는 -0.20에서 0.20이고 축마다 최소 ≤ 최대다. 적지 않은 경계는 0이고 null은 적지 않은 것과 같다.

두 끝이 곡선의 어디에 놓이는지는 모드마다 다르다.
- pixel: 같은 이득이 행을 가로로 1 + g 배, 세로로 1 / (1 + g) 배 하므로 몸통은 넓어질 때 낮아진다. 곡선 꼭대기에서 가로는 `width_max`, 세로는 `height_min`이고, 바닥에서 가로는 `width_min`, 세로는 `height_max`다. 행마다 이득은 봉투를 따라 줄고 진행파 지연(`lag`)도 그대로다.
- smooth: 쉼(곡선 0)이 두 최소, 들숨 꼭대기가 두 최대다. 최소가 0이 아니면 쉼 칸도 원본에서 그만큼 옮겨지므로 위상 0 칸이 원본 바이트가 아니다.

세기로 적은 줄과 최소와 최대로 적은 줄은 서로 옮겨 적을 수 있다. 세기 d인 pixel 줄은 세로 [-0.9009 d, 0.9009 d], 가로 [-a, a]와 같다. 0.9009는 숨 곡선의 꼭대기 값(`WAVE_PEAK`)이고, a는 0.9009 × `depth_x`(생략하면 `depth`) × 진폭 정규화 계수 × 봉투 최대다. smooth 세기 줄은 세로 [0, `depth`], 가로 [0, `depth_x`]와 같다. 이 값을 최소와 최대로 적으면 같은 바이트가 구워진다. `sprite-gen breathe`는 `breathe.json`의 `range`에 그 줄의 `{"width": [최소, 최대], "height": [최소, 최대]}`를 적는다. 세기로 구운 판을 최소와 최대로 옮길 때는 이 수를 그대로 쓴다. pixel은 정수 행과 열로 옮기므로 구운 판에서 잰 극값은 적은 값과 한 칸 안에서 맞는다.

행별 변형 한도(0.25)는 곡선이 닿는 가장 큰 이득으로 검사하고, 넘으면 줄일 키(`width_min`, `width_max` 또는 `height_min`, `height_max`)를 밝혀 거부한다. Sway 레이어(`video-sway --breathe`)와 박자 고르기(`--avoid-region`)는 smooth 가슴이 쉼에서 꼭대기까지 오르는 폭, 곧 (`height_max` - `height_min`) × 기준 높이를 읽는다.

`--reference FRAME.png`(모든 모드)를 주면 행의 해부학 측정값(머리 선, 가슴, 상승 높이, 프레임 안에서 해부학이 차지하는 위치)을 행의 첫 프레임 대신 그 프레임에서 측정한다. 프레임들과 같은 크기여야 하며 다르면 거부된다. 루프 세트의 첫 셀을 지정하면, 첫 프레임이 루프와 다른 토막(예: 머리를 든 상태로 시작하는 경우)도 루프의 해부학으로 베이크된다. 이때 `breathe.json`에는 그 파일의 `path`와 `sha256`을 담은 `reference`가 기록된다. 예를 들어 두 번 호흡하는 96셀 루프의 셀 40에서 시작하는, 루프에서 빠져나가는 토막은 다음과 같이 베이크한다.

```bash
sprite-gen breathe way-out/ way-out-breathed/ --mode smooth --breaths 2 --loop-cells 96 --start-cell 40 --reference loop/frame-000.png
```

손이 가슴 앞에서 크게 움직이는 idle에서는 들숨의 정점이 손의 상승과 겹치면 호흡이 손을 따라가거나 가슴이 손 아래로 가라앉는 것처럼 보인다. `--mode smooth --avoid-region X0,Y0,X1,Y1`은 손의 움직임을 피해 호흡 박자를 고른다.

- `--avoid-region`은 손의 사각형을 지정하며, 좌표는 그림 크기에 대한 0부터 1까지의 비율이다. `--avoid-anchor X0,Y0,X1,Y1`은 손 자체의 움직임을 읽을 기준 몸통 사각형을 지정한다. 생략하면 손의 열에서 손 높이의 0.65배만큼 위쪽부터 그림 높이의 0.02배만큼 위쪽까지의 띠를 쓴다.
- 두 사각형은 첫 셀을 기준으로 동작 앵커와 같은 마스크 NCC를 쓰는 `auto_motion.track_box`로 추적한다. 각 프레임은 사각형에 탐색 반경을 더한 범위로 잘라 읽으며, 반경은 그림의 긴 변의 5%, 최소 8픽셀이다. 위치는 정수 픽셀이다. 손 자체의 상승량은 손의 상승량에서 몸통의 상승량을 뺀 값이며, 위쪽을 양수로 둔다.
- 후보 호흡 횟수는 한 번의 호흡이 1.5초부터 4초가 되도록 고른다. 따라서 `--fps` 또는 비디오 루프 `cycle/` 폴더의 프레임 시간이 필요하다. 먼저 정점을 균등하게 둔다. 선택된 횟수의 각 들숨 정점은 최대 3셀까지 옮겨 볼 수 있다. 호흡이 3번 이하면 정점을 각각 옮기고, 더 많으면 모두 함께 옮긴다. 모든 후보는 그 행 자체의 `inhale` 곡선, 즉 베이크가 쓰는 것과 같은 `smooth_wave` 곡선으로 평가한다.
- 점수는 호흡 곡선과 몸통 상승량의 상관에서 호흡 곡선과 손 자체의 상승량의 상관을 뺀 값이다. 각 들숨 정점의 앞뒤 2셀 안에서 가슴 상승량인 `lift x w`가 손 자체의 상승량보다 작지 않아야 한다. 조건을 만족하는 균등 후보 중 점수가 가장 높은 것을 고르며, 동점이면 호흡 횟수가 적은 것을 고른다. 정점을 옮긴 후보는 점수가 0.1보다 더 높을 때만 채택한다. 조건을 만족하는 후보가 없으면 조용히 박자를 고르지 않고 거부한다. 0.1의 차이와 기본 띠는 적은 수의 루프에서 정했으며, 루프가 늘면 다시 측정해야 한다.
- 선택한 `breaths` 또는 `breath_peaks`는 사이드카 검사를 다시 거쳐 베이크된다. `breathe.json`의 `beat`에는 비율과 픽셀 단위의 사각형, 탐색 반경, 프레임 시간, 상승량, 셀별 손 자체의 상승량과 몸통 상승량, 선택 규칙의 수치가 기록된다. 모든 균등 후보의 호흡 횟수, 정점, 점수, 손과 몸통의 상관, `margin_px`, `keeps`와 가장 좋은 이동 정점 후보 및 `chosen`도 기록된다. `--avoid-region`이 없으면 이 과정은 실행되지 않고 `beat`도 쓰이지 않는다.
- `--avoid-region`은 `--breaths` 또는 `--breath-peaks`와 함께 쓸 수 없고, `pixel` 모드에서도 거부된다. `--loop-cells`나 `--start-cell`과도 함께 쓸 수 없다. 박자는 루프 전체의 프레임에서 고르는 것이고 토막은 자신이 속한 루프의 박자를 이어받으므로, 루프에서 박자를 고른 뒤 그 값을 토막에 넘긴다. `--avoid-anchor`와 `--fps`는 `--avoid-region` 없이 쓸 수 없다. 프레임 시간이 없거나 사각형을 추적할 수 없어도 거부된다. 이 `breathe.json`을 읽는 스웨이(Sway) 레이어는 같은 박자로 움직이며 그 `inhale`도 따른다. 그 기록의 `drive`에는 선택된 `breaths` 또는 `breath_peaks`와 `inhale`, 그리고 `start_cell`과 `loop_cells`가 담긴다.

비디오 루프 셀 처리 예시는 다음과 같다.

```bash
sprite-gen breathe frames/ out_frames/ --mode smooth --depth 0.0085 --breaths 2
```

큐레이션 웹뷰 사용 시 제한사항이 있다. 웹뷰의 실시간 미리보기는 pixel 봉투 워프만 반영하므로 smooth 행과 둥근 가슴 pixel 행은 미리보기를 지원하지 않는다. 웹뷰에서는 안내 문구와 함께 원본 프레임을 보여주며, 이 행들의 비디오 내보내기는 거부된다. 사이드카를 저장하면 이 행들의 설정은 작성한 내용 그대로 보존된다. 실제 결과는 compose 명령어(GIF, atlas) 또는 `sprite-gen breathe` 명령어로 확인해야 한다.

## 둥근 가슴 (pixel) — `chest_round`·`arms_x`

pixel 의 봉투 스쿼시는 가로줄을 통째로 눌렀다 늘인다. 머리가 몸통 위에서 통째로 오르내리고, 팔과 쥔 물건과 다리까지 옆으로 밀리며, 숨이 줄 단위로 읽힌다. 둥근 가슴은 같은 도트 그림에서 가슴 한 점을 중심으로 둥글게 부풀었다 줄고, 팔은 옆으로 벌어졌다 모이며, 머리와 선 발은 그대로 둔다.

- 켜기: `chest_round`(가슴)나 `arms_x`(팔) 중 하나가 0보다 크면 그 pixel 행은 봉투 스쿼시 대신 둥근 가슴 장을 굽는다. 둘 다 목 아래 몸통 높이(정규화 기준 행)의 비율이고 범위는 0에서 0.20이다. 생략하거나 0이면 꺼져 있고, 출력과 정규화된 사이드카 모두 이전과 바이트 단위로 같다.
- 가슴: smooth 와 같은 가슴 타원(`chest_y`, `chest_rx`, `chest_ry`, `chest_tilt`, `chest_bias`, `chest_bias_y`, `chest_x`)의 테두리가 들숨 정점에서 꼭대기 P 로부터 바깥으로 `chest_round` × 기준 높이 px 나간다. 타원 안은 P 에서 테두리까지 고르게 늘고, 타원 밖은 같은 px 만큼 통째로 밀려 1 px 윤곽선이 1 px 로 남는다. P 보다 위는 위와 옆으로, P 보다 아래는 옆으로만 간다. 아래로 밀면 선 발이 눌리기 때문이다. 가로 밀림은 타원의 아래 테두리에서 콘텐츠 맨 아래까지 0으로 줄어든다.
- 머리: 강체 경계 위는 모든 셀에서 자리와 바이트가 그대로다 (smooth 와 같다). 오르는 몫은 목 밴드(강체 경계에서 smooth 와 같은 폭)에서 켜진다. 목 너비 안은 밴드 전체에 걸쳐 켜지고, 그 밖은 오르는 px 의 12배나 밴드의 0.15 가운데 긴 쪽(밴드보다 길지는 않다)에 걸쳐 켜진다. 더 짧으면 머리 밑이 행당 상한을 넘게 눌리기 때문이다. 옆으로 가는 몫(가슴의 가로 밀기와 팔)은 강체 경계 아래에서 목 밴드의 0.15나 가로 px(`chest_round` 더하기 `arms_x` px)의 1.5배 가운데 긴 쪽에 걸쳐 켜지고, 몸이 쥔 물건을 따라가는 움직임은 밴드의 0.15나 가장 큰 조각 이동 px의 1.5배 가운데 긴 쪽에 걸쳐 켜진다. 더 짧으면 머리선 바로 아래 행들이 서로 행당 한 칸 넘게 미끄러져 머리선을 넘나드는 외곽선(어깨선)이 깨지기 때문이다. 1.5배에서는 어떤 행도 다음 행에 대해 대략 한 칸 넘게 미끄러지지 않는다(부드러운 켜짐의 가장 가파른 기울기가 길이 대비 1.5다).
- 팔: 부속 경계(봉투 스쿼시의 부속 보호가 시작하는 자리 — 사람이 준 `torso_half`면 그 반폭, 아니면 해부가 잰 몸통 반폭의 1.15배) 바깥의 열은 가슴이 미는 대로 통째로 밀리고, 거기에 더해 몸통 축에서 먼 쪽으로 `arms_x` × 기준 높이 px 만큼 가로로 통째 간다. 팔은 늘지 않는다. 팔 몫이 켜지는 길은 팔이 아니라 몸통 쪽에 둔다. 부속 경계 안쪽으로 그 px 의 12배(몸통 축을 넘지 않는다)에 걸쳐 옆구리가 팔을 따라 벌어진다. 더 짧으면 어깨가 행당 상한을 넘게 늘어난다. 해부가 부속을 못 찾았고 `torso_half`도 주지 않았으면 팔 몫은 없다. 팔이 몸통 실루엣 안에 붙어 있으면 `torso_half`로 몸통 반폭을 주거나, 팔이 쥔 것을 `--props-mask`로 준다.
- 숨: smooth 와 같은 한쪽 혹 곡선이고 `inhale`, `breaths`, `breath_peaks`, `loop_cells`, `start_cell`을 같은 뜻으로 받는다. 위상 0인 셀은 원본과 바이트 단위로 같아서 루프 이음이 쉼에 놓인다. 진행파(`lag`)는 없다.
- 정수 칸: 정사상의 역을 고정점 반복으로 풀고, 그 자리에 놓인 원본 칸 하나를 통째로 옮긴다. 사잇값이 없어서 출력의 칸은 모두 원본에 있던 칸이고 새 색이 생기지 않는다. 장의 기울기가 행당 변형 상한(0.25) 아래라 어느 행과 열에서도 칸 순서가 뒤집히지 않는다.
- 거부: smooth 행의 `chest_round`, `arms_x`, 둥근 가슴 행의 `depth`, `depth_x`, `lag`, `width_min`, `width_max`, `height_min`, `height_max`(봉투 값), smooth 만 쓰는 모양 값(`shoulder`, `shoulder_lag`, `chest_dir`, `chest_flat`), 범위 밖 값, 행당 변형 상한 초과, 셀 밖으로 밀리는 불투명 칸, 그리고 해부가 팔(부속)을 못 찾았고 쥔 물건도 없는데 준 `arms_x`는 모두 조용히 넘기지 않고 거부된다. 몸 자체의 셀 밖 거부는 고정 칸이나 조각 칸을 빼고 몸 칸만 세며 pixel 봉투 거부와 같은 형식(`왼쪽 변 밖 3`, 모서리 칸은 양쪽 변 모두에 셈)으로 건넌 변과 그 수를 밝힌다. 조각이 셀 밖으로 밀리는 경우, 무엇이든 그리기 전에 각 조각을 자신의 온전한 칸 목적지(조각의 칸에 조각이 움직이는 온전한 칸 수를 더한 자리)에서 검사한다. 이 거부는 마스크 플래그, 조각의 i/n과 칸 수, 벗어난 불투명 칸 수, pixel 봉투 거부와 같은 형식(`왼쪽 변 밖 3`, 모서리 칸은 양쪽 변 모두에 셈)으로 건넌 변과 그 수, 셀 크기, 조각의 이동량을 밝히고, 셀 여백을 넓히거나 `chest_round` 또는 `arms_x`를 줄이라고 안내한다. 이는 몸 뒤 조각(장이 건너뜀), 머리선 위처럼 몸이 온전히 따르지 않는 행의 조각, 그리고 둥글림 가장자리를 포괄한다.

### 고정 칸, 쥔 물건, 등 뒤 물건, 묶음: `--hold-mask`, `--props-mask`, `--props-behind-mask`, `--props-groups`

`sprite-gen breathe`는 사람이 준 마스크 셋(`--hold-mask`, `--props-mask`, `--props-behind-mask`)을 받는다. 모두 프레임과 같은 크기의 PNG이고, 밝은(명도 128 이상) 불투명(알파 128 이상) 칸이 그 마스크의 칸이다. 물건 마스크 안의 빈 칸(마스크가 덮은 투명 칸)은 그려지지 않고, 그림의 불투명 칸만 조각으로 움직인다. 크기가 다르거나 칸이 하나도 없으면 거부된다. 한 칸이 셋 가운데 둘 이상의 마스크에 들어가면 거부된다.

- `--hold-mask`(고정 칸): 그 칸은 모든 셀에서 그 셀의 바이트 그대로다. 굽기가 덮어서 되돌리는 것이 아니라 변위장 자체가 고정 칸에서 0이다. 장은 고정 칸에서 그 줄을 따라(가로 성분은 같은 행, 세로 성분은 같은 열) 멀어지며 다시 켜지고, 줄의 몸(고정 칸도 쥔 물건도 아닌 불투명 칸)이 가장 크게 움직이는 px 의 12배를 지나면 온전하다. 그래서 고정 칸 옆을 나란히 지나는 움직임(고정된 다리 위 몸통의 가로 부풂)은 줄지 않는다. smooth 행과 둥근 가슴 pixel 행이 받는다. 봉투 스쿼시 행은 가로줄을 통째로 옮겨 칸을 제자리에 둘 수 없어 거부한다.
- `--props-mask`(쥔 물건, 칼이나 방패처럼 팔이 쥔 것): 마스크의 조각마다 가로로 통째 옮겨진다. 조각은 8-이웃으로 이어진 칸이고, 서로 2 px 안에 떨어진 칸들(쥔 손 칸이 사이에 끼어 갈라진 칼자루와 칼날처럼)은 한 조각이다. 늘지 않는다. 옮기는 양은 쥔 손이 가는 만큼이다. 조각이 몸(고정 칸도 쥔 물건도 아닌 불투명 칸)에 닿은 칸들에서 읽은 가슴의 가로 몫의 평균에, 조각 가운데가 놓인 쪽 팔의 몫(`arms_x` × 기준 높이 px, 몸 바깥쪽)을 다 더한다. 몸에 닿은 칸이 없으면 조각 전체에서 읽는다. 조각 둘레 2 px 안의 몸(쥔 손)은 정확히 같은 칸만큼 옮겨지고, 거기서 몸에 닿은 자리에서 몸의 장과 다른 px 의 12배에 걸쳐 몸의 장으로 돌아간다(두 조각의 길이 겹친 몸은 둘을 섞는다). 머리(강체 경계 위)는 쥔 물건 옆에서도 그대로다. 그래서 손과 손잡이 사이가 벌어지거나 겹치지 않는다. 조각이 고정 칸 쪽으로 가면 고정 칸 밑으로 들어가 그려지지 않고, 고정 칸이 위에 남는다(칼날이 고정된 물 밴드 밑으로 잠기는 식이다). 엔진은 이 칸들을 조용히 버리지 않고, 조각마다 프레임마다 고정 칸 밑으로 들어간 조각의 불투명 칸 수를 센다. `breathe.json`은 이를 `props.pieces`의 각 조각에 `hidden`(프레임 순서대로 프레임당 수를 담은 목록)과 `hidden_max`(그 가운데 최댓값)로 기록한다. 가려진 칸이 있는 조각마다 `sprite-gen breathe`는 stderr에 `breathe: warning: --props-mask piece K of N (C cells) goes under held cells in F of T frames, up to M cells (frame X); those cells are not drawn` 형태 뒤에 공백과 `breathe.json props.pieces[K-1].hidden`이 붙는 경고를 한 줄 출력한다. 조각이 떠난 칸의 경우, 각 행에서 조각 바로 뒤(움직이는 방향의 반대쪽) 첫 칸을 본다. 몸 앞에 쥔 조각은 둘레의 몸이 같은 온전한 칸만큼 움직여 장이 이미 채운다. 그러나 바로 뒤의 그 칸이 고정 칸이면 고정 칸은 제자리에 머물러 장이 가져올 수 없으므로, 그 고정 칸이 조각이 떠난 칸들에 걸쳐 반복된다(칼날이 물 밴드를 벗어난 자리를 물이 채우고, 소매가 물러난 자리를 고정된 등이 채운다). 빈 칸을 지어내지 않는다. 엔진은 이처럼 앞 조각이 떠난 칸에 고정 칸이 반복되거나 몸이 조각을 완전히 따르지 않는 행에서 장이 남긴 복사본처럼 그 프레임에서 옮겨진 것이 아니라 조각의 이동이 지어낸 칸 수를 센다(고정 칸 자체는 결코 세지 않는다). `breathe.json`은 이를 `props.pieces`의 각 조각에 `filled`(프레임 순서대로 프레임당 수를 담은 목록)와 `filled_max`(그 가운데 최댓값)로 기록한다. 채워진 칸이 있는 조각마다 `sprite-gen breathe`는 stderr에 `breathe: warning: --props-mask piece K of N (C cells) leaves cells it fills by repeating a cell in F of T frames, up to M cells (frame X); those cells are made up, not moved` 형태 뒤에 공백과 `breathe.json props.pieces[K-1].filled`가 붙는 경고를 한 줄 출력한다. 어깨 아래 소매부터 손까지 팔 전체를 쥔 물건과 함께 하나의 `--props-mask` 조각(한 색)으로 마스크하면 팔 전체를 하나의 강체 블록으로 옮길 수 있으며, 블록 둘레의 몸은 다른 쥔 물건처럼 이를 따라간다. 가로 움직임이 켜지는 행들 아래에서 블록을 시작해야 하며, 그렇지 않으면 맨 위 행이 바로 윗행에 대해 미끄러진다. 둥근 가슴 pixel 행에 `arms_x`가 있어야 받는다.
- `--props-behind-mask MASK.png`(등 뒤에 쥔 물건, 기본값 꺼짐): 등 뒤에 맨 방패처럼 몸 뒤에 쥔 물건이다. `--props-mask` 조각과 같은 가로 움직임을 취한다(조각이 몸에 닿은 자리에서 가슴의 가로 몫을 평균하고, 그쪽 팔의 온전한 `arms_x`를 더하는 같은 규칙이다). 그러나 몸이 그 앞에 머문다. 몸은 이를 따라가지 않고, 장은 이를 제외하며(몸과 외곽선은 몸 자체의 장을 계속 따른다), 고정 칸 밑, 몸 밑, 그리고 앞에 쥔 조각 밑에 그려진다. 조각이 몸 뒤에서 빠져나오는 곳에서는 그 행에서 몸에 닿아 있던 조각의 칸이 조각이 떠난 칸들에 걸쳐 반복된다(몸 뒤에 숨어 있던 조각 부분이 밖으로 나온다). 앞에 아무것도 없던 자리에서는 조각이 떠난 칸이 빈 칸이 된다. 반복된 칸들 때문에 조각이 그 칸 수만큼 더 넓어 보인다(방패 가장자리 열이 반복된다). 목적지에서 벗어나 나타난 조각 자체 칸의 복사본(조각이 빠져나오며 떠난 칸에 몸에 닿아 있던 칸이 반복되어 방패가 더 넓어 보이는 까닭)은 옮겨진 것이 아니라 조각의 이동이 지어낸 칸으로 센다. `breathe.json`은 이를 `props_behind.pieces`의 각 조각에 `filled`(프레임 순서대로 프레임당 수를 담은 목록)와 `filled_max`(그 가운데 최댓값)로 기록한다. 채워진 칸이 있는 조각마다 `sprite-gen breathe`는 stderr에 `breathe: warning: --props-behind-mask piece K of N (C cells) leaves cells it fills by repeating a cell in F of T frames, up to M cells (frame X); those cells are made up, not moved` 형태 뒤에 공백과 `breathe.json props_behind.pieces[K-1].filled`가 붙는 경고를 한 줄 출력한다. 고정 칸 밑, 몸 밑, 또는 앞에 쥔 조각 밑으로 들어간 가려진 칸은 똑같이 세어 `breathe.json`의 `props_behind.pieces[i].hidden`과 `hidden_max`에 기록되고, 이제 `goes under held cells, the body or a piece held in front of it`로 읽히며 `--props-behind-mask`를 명시하는 경고 줄이 stderr에 출력된다.
- 조각 원장(piece ledger): 조각을 배치하는 동안 베이크는 모든 출력 칸에 대해 그 칸이 어떤 원본 칸을 보여주는지를 기록하는 원본 맵(source map)을 유지한다. 아래의 모든 수치는 그리는 특수 사례가 아니라 매 프레임 이 맵에서 읽는다. 레이어 순서는 몸 뒤의 모든 조각을 먼저 그리고, 그 프레임에서 움직이지 않는 조각을 포함하여 앞의 모든 조각을 그 다음에 그리므로 앞 조각은 항상 뒤 조각 위에 온다. 고정 칸은 언제나 맨 위에 놓인다. 이동 후 한 레이어의 두 조각(두 앞 조각, 또는 몸 뒤의 두 조각)이 한 칸에 내리는 것은 마스크가 어느 쪽이 앞인지 말해주지 않으므로 거부된다(메시지의 안내: `--props-groups colour`로 한 색으로 묶거나 둘 중 하나를 다른 마스크로 옮길 것). 몸 뒤 조각과 그 앞의 몸이 서로 벌어져 스틸에서 불투명했던 칸이 몸도 조각도 없이 비게 되는 경우도 거부된다. 이는 몸 뒤 조각이 몸 안쪽까지 칠해졌을 때 일어나며, 메시지에서 몸 바깥으로 드러난 부분만 `--props-behind-mask`로 주거나 그 부분을 `--props-mask`로 주라고 안내한다. 매 프레임 검사: 각 조각마다 목적지에 표시된 칸과 가려진 칸의 합은 스틸에서 그 조각의 불투명 칸 수와 같아야 하며, 그렇지 않으면 베이크는 엔진 결함으로 거부된다.
- `--props-groups piece|colour`(기본값 `piece`, 조각마다 제 손을 따름): `colour`를 주면 두 물건 마스크 모두 색으로 읽는다. 한 색의 밝은 불투명 칸(명도 128 이상, 알파 128 이상)이 한 묶음을 이루며, 어느 마스크에 있든 어디에 놓여 있든 한 묶음의 모든 조각은 같은 온전한 칸만큼 움직인다. 이동량은 그 묶음이 몸에 닿은 자리에서 읽는다(가슴의 가로 몫을 거기서 평균하고, 묶음 중심이 놓인 쪽 팔의 온전한 `arms_x`를 더한다). 손이 닿지 않는 조각, 예컨대 칼과 같은 색으로 칠한 물속의 칼 반사도 칼을 따라 움직인다. 각 조각의 기록에는 `colour`("#rrggbb")가 실리고 마스크 기록에는 `groups: "colour"`와 `colours`(마스크가 가진 색의 수)가 실린다. 물건 마스크 없이 `--props-groups`를 쓰면 거부된다. 칸으로 인정받으려면 색이 밝아야 한다.
- 마스크를 주면 행당 변형 검사는 몸(고정 칸도 쥔 물건도 아닌 불투명 칸)과 그 둘레 한 칸에서 잰다. 고정 칸, 쥔 물건 조각과 그 이웃, 그리고 고정 칸과 조각의 통째 둘레가 2 px 안에서 맞닿는 이음은 뺀다. 통째로 옮겨지는 조각과 제자리인 고정 칸이 맞닿은 자리의 끊김은 접힘이 아니라 조각이 고정 칸 밑으로 들어가거나 거기서 나오는 것이고, 빈 칸끼리 늘고 주는 것은 보이는 것이 없기 때문이다. 마스크가 없으면 예전과 같이 콘텐츠 상자 전체에서 잰다.
- `breathe.json`에는 `hold`(`path`, `sha256`, `cells`)와 `props`(같은 기록과 조각마다 `cells`, 들숨 정점의 가로 `shift_px`, `hidden`, `hidden_max`, `filled`, `filled_max`)가 실린다. `--props-behind-mask`를 주면 `props_behind`에도 같은 기록과 조각마다 `cells`, `shift_px`, `hidden`, `hidden_max`, `filled`, `filled_max`가 실린다. 세 마스크는 아직 큐레이션 사이드카의 키가 아니고 `sprite-gen breathe`에서만 받는다.

```bash
sprite-gen breathe still-loop/ breathed/ --chest-round 0.04 --arms-x 0.03 --breath-peaks 72,192 --inhale 0.6 --hold-mask feet.png --props-mask sword-shield.png --props-behind-mask shield.png --props-groups colour
```

## What Breathe does (from the README, 2026-09-09)

A still idle reads as frozen. **Breathe** turns a single pose into a living loop — deterministic squash & stretch baked on top of your curated frames. No regeneration, no re-extraction, no extra art. One sidecar field:

```json
"breathe": { "depth": 0.05, "breaths": 3 }
```

- **Anatomy-aware.** The engine measures the silhouette: neck bottleneck, symmetric eye pair on neckless blobs, torso-vs-appendage width. Heads stay **bit-identical** across every frame; wings and arms get pushed, never stretched.
- **Pixel-true.** Integer row/column mapping only — every output frame is still clean pixel art on the same grid. A 1px outline stays a 1px outline: the warp preserves silhouette edges and normalizes staircase doubling, anchored on the inner line.
- **A ruler you can grab.** Drag the rigid boundary (red), the body axis (blue), and the torso width (dashed) right on the live playback. The server re-derives the anatomy on release — and the preview keeps breathing while it recalculates.
- **Byte-identical preview.** The webview mirror and the Python bake produce the same bytes, enforced by golden tests. What you watch looping is exactly what ships in the atlas.

<p align="center">
  <img src="assets/breathe-editor.png" width="760" alt="breathe region editor: rigid boundary, body axis and torso width lines over live playback, with the baked phase filmstrip" />
</p>

The same deterministic bake applies to front, side, and back views of any silhouette, including humanoids, blobs, and tentacles.

> SKILL.md Script Map 에서 옮겨온 본문(2026-09-09, 허브 슬림화). `compose_sprite_gif.py` / `compose_sprite_atlas.py` 가 굽는 호흡 레이어, 정지 자세 행 레시피, 큐레이션 뷰의 호흡 편집기 계약을 소유한다. 실측 근거·프레임 게이트는 아래 "정지 자세(Static-Pose) 행 레시피" 절.

- **에이전트 주도 호흡** (사용자가 "숨쉬기 적용해서 뽑아줘" 라고만 해도 됨): 호흡은 사이드카 필드라 뷰 없이도 켤 수 있다 — (1) `states.<state>.breathe = {"depth": 0.06, "breaths": 1, "lag": 0.1}` 만 쓰면 된다. **경계는 선언하지 않는다** — `sprite_gen/anatomy.py` 가 검출한다. 큐레이터를 거치면 그 결과가 사이드카 `anatomy` 에 얼려지고(`GET /api/breathe-anatomy`), 뷰 없이 에이전트가 `breathe` 만 쓴 런은 `anatomy` 가 비어 있어 **굽기가 매번 다시 잰다** — 굽기는 사이드카에 쓰지 않는다. 어느 쪽이든 동작한다. **굽기는 얼린 값을 신뢰하지 않는다 — 언제나 자기 기준 프레임에서 다시 잰다** (얼린 값은 큐레이터 프리뷰용 캐시다). 사이드카와 어긋나면 manifest 의 `sidecar_drift` 로 값을 실어 보고한다. 그 캐시가 아직 유효한지는 기준 프레임의 **입력** 지문(원본 파일 스탬프·픽셀편집·변형·변종)으로 판정하고, 어긋나면 큐레이터가 프리뷰·영상 내보내기를 **거부하며 갱신하라고 알린다** — 조용히 낡은 숫자로 그리지 않는다. 사람이 특정 행에 고정하고 싶을 때만 `rigid_row` 를 준다. (에이전트 직접 쓰기는 `load_curation`→`stamp_curation` 도장 경로 필수, 열린 탭은 새로고침 안내 — 함정 상세: [`troubleshooting.md`](troubleshooting.md)), (2) `compose_sprite_gif.py`/`compose_sprite_atlas.py` 가 자동으로 굽는다. 검증: gif-manifest 의 `breathe.phases`. **구 `splits`/`amplitude`/`subpixel` 은 요란하게 거부된다** — 옮기려면 `sprite-gen migrate-breathe <run-dir> --apply`.
- **정지 자세(sit/lie/carry_idle 등) 행 레시피** — 정지 1컷 + 링크 복제 @ 4fps + 허리선 호흡(breaths 3) + 눈 보이는 방향만 깜빡임. **복제 수 = `recommended_breathe_frames(breathe) − 1`** (호흡당 `SMOOTH_CYCLE_FRAMES`=6 프레임 확보; breaths 3 → 총 18컷) — 짧은 루프(옛 11컷)에 다수 호흡을 우겨넣으면 1px 위상이 매 프레임 토글해 진동으로 읽히던 걸 막는다 (maintainer 2026-07-24). 깜빡임은 **시퀀스 끝 근처**(맨 끝 아님, 뒤에 눈뜬 rest ≥2)에 배치해 루프 이음새 전에 다시 떠 스냅을 없앤다. 실측 도출 근거·자동 적용 절차·프레임 게이트: 아래 "정지 자세(Static-Pose) 행 레시피" 절 (maintainer 확정 2026-07-19, 이징 게이트 2026-07-24).
- 호흡(idle breathing)은 **후처리 레이어**다 (maintainer 확정 2026-07-18) — 스크립트가 아니라 curation.json 사이드카 `states.<state>.breathe = {depth, depth_x?, breaths, lag, rigid_row?, anatomy}`(세기 대신 `width_min`, `width_max`, `height_min`, `height_max` 도 된다. "숨의 크기" 절) 로 선언하고, compose/GIF 가 재생 시퀀스 위에 결정론(봉투 워프, `sprite_gen/breathe.py`)으로 굽는다. 깜빡임 프레임도 그대로 숨쉰다 (프레임 선택과 직교).
  - **변형은 자르지 않고 강도를 떨군다** (2026-07-25 교체): 스프라이트 전체에 연속 변형장을 걸고 그 강도를 강체 경계에서 0 으로 테이퍼한다. `env=0` 인 행은 가로 사상이 항등이고 세로 누적이 정확히 1씩 늘어 **그 구간이 프레임 간 비트 동일**하다 — 눈·입이 몇 도트뿐이라 근사로는 표정이 뭉갠다. 가로는 행 안에서 밀도를 적분하므로 사상이 단조라 접힘이 없고, 날개 같은 부속은 밀리기만 하고 안 늘어난다.
  - **강체 경계는 가슴이 아니라 목이다.** 가슴은 해부학 개념이라 몬스터마다 다르지만 목은 기하학적 병목이라 안정적으로 잡힌다. 얼굴이 몸통에 있는 버섯, 슬라임은 대칭 눈쌍을 찾아 경계를 얼굴 아래로 내린다. 기존 탐색에서 눈쌍을 찾지 못하면 같은 어두운 픽셀을 다시 살피되, 최소 눈 면적은 목 위 불투명 픽셀의 0.2%, 눈의 너비 대 높이 상한은 3.0, 눈 중심과 몸통 축 사이의 최소 거리는 내용 너비의 0.02로 둔다. 프레임을 채운 흉상의 작은 눈, 4분의 3 방향 얼굴에서 가는 선처럼 보이는 먼쪽 눈, 긴 머리 때문에 먼쪽 눈에 가까워진 몸통 축을 읽기 위한 탐색이며, 두 눈이 축의 양쪽에 있고 쌍의 중심이 축에 가까우며 간격과 크기와 행 겹침이 맞아야 하는 조건은 그대로다. 기존 탐색이 읽던 그림은 바뀌지 않고, 두 번째 탐색이 얼굴을 찾아도 얼굴 끝이 목보다 아래에 있을 때만 경계가 내려간다. 병목도 얼굴도 없으면 어깨-기울기로 떨어지고 그 사실이 `anatomy.warnings` 에 남는다.
  - 큐레이션 뷰: 줄 헤더 호흡 체크박스(즉시 on/off) + 라벨 클릭 편집기(실재생 위 **강체 경계 1개 드래그** · 가로 최소~최대와 세로 최소~최대(% 입력, 0.1% 단위, -20~20. 2026-10-29 진폭 셀렉트를 대체했다. 세기만 적힌 줄은 그 세기가 오가는 범위를 보여 주고, 손잡이 하나를 고치면 줄이 네 키로 옮겨진다. 손대지 않은 손잡이는 반올림하지 않은 값 그대로라 그 축은 같은 바이트로 구워진다. pixel 세기 줄의 가로는 해부가 와야 보이고, 둥근 가슴 줄에서는 꺼진다) · 루프당 호흡 횟수 · `auto` 되돌리기 — 즉시 반영, Esc 복원, 최종 굽기 필름스트립). 루프 길이는 시퀀스 그대로 불변이고 위상이 연속값이라 breaths 는 요청 그대로 적용된다 (범위 1~8이고 **정수여야 한다**; 밖이거나 비정수면 조용히 깎지 않고 요란하게 거부한다 — `depth` 0.005~0.20, `depth_x` null|0~0.20, 최소와 최대 -0.20~0.20, `lag` 0~0.45 도 같다). 재추출/굽기 대기 없음.
  - 세로선(몸통 밴드)을 **사람이 조정하면** 보호 램프가 밴드 자체에 앵커된다 — 밴드 밖 열은 늘어나지 않고 밀리기만 한다. 자동 검출 밴드는 부속(날개·긴 팔)이 실재할 때만 켜지는 기존 계약 그대로다 (블롭에서 밴드 조정이 무력했던 버그 수리, 2026-07-30).

## 정지 자세(Static-Pose) 행 레시피

> `docs/static-pose-recipe.md` 에서 병합(2026-09-09, 본문 verbatim). 호흡 레이어와 정지 자세 레시피는 한 계약이라 한 문서가 소유한다.

합성 정지 자세 회귀에서 도출한 결정론적 레시피다.

### 적용 대상

이동/액션이 아닌 모든 "가만히 있는" 상태: `idle`, `sit`, `sit_chair`, `lie`,
`carry_idle` 등. 로코모션(walk/run/jump)과 action 행에는 적용하지 않는다.

### 레시피

1. **정지 1컷 + 링크 복제**: 추출 프레임 중 최적 정지 포즈 1장을 고르고
   (사람 검수 대상; 기본 후보 frame 0), 나머지 시퀀스는 전부 그 프레임의
   **링크 복제**로 채운다 — 편집 truth 1곳, 아틀라스 셀 공유(무비용).
2. **길이 = 호흡당 최소 프레임 확보** @ 4fps. 시퀀스 길이는
   `sprite_gen/effects/breathe.py` `recommended_breathe_frames(breathe)` 로 정한다
   (호흡당 `SMOOTH_CYCLE_FRAMES`=6 프레임): 기본 `breaths: 3` → **18컷**
   (~4.5s 루프, 호흡당 1.5s). **옛 11컷은 사이클당 ~3.7프레임이라 1px 위상이
   거의 매 프레임 토글해 호흡이 아니라 진동으로 읽힌다**. 이 게이트가 그 원인을 막는다. 깜빡임 프레임은 이 길이에
   포함되며 별도로 +하지 않는다 (아래 4).
3. **호흡 레이어**: `breathe = {depth: 0.06, breaths: 3, lag: 0.1}` 만 쓴다.
   **강체 경계는 선언하지 않는다** — `sprite_gen/effects/anatomy.py` 가 목 병목(없으면 대칭
   눈쌍 아래, 그것도 없으면 어깨-기울기)으로 검출해 사이드카 `anatomy` 에 채운다.
   **굽기는 그 값을 캐시로만 본다** — 매번 자기 기준 프레임에서 다시 재고, 사이드카와
   어긋나면 manifest 의 `sidecar_drift` 로 값을 실어 보고한다. 사이드카의 `anatomy` 는
   큐레이터 미리보기가 굽기와 같은 경계로 그리려고 들고 있는 것이고, 그게 아직 유효한지는
   `fingerprint`(기준 프레임의 **입력** 키 — `breathe.reference_key`)로 판정한다.
   특정 행에 고정해야 할 때만 `rigid_row`.
   위상이 연속값이라 이징을 위한 별도 옵션이 없다 — 부드러움은 프레임 수(위 2)로 얻는다.
4. **깜빡임은 눈이 보이는 방향만**: 시퀀스 **끝 근처**(맨 끝 아님)에 배치하고
   뒤에 눈-뜬 rest 프레임을 **최소 2장** 남긴다 — 그래야 감았다가 루프 이음새
   전에 다시 뜨며 이어진다 (맨 끝 1프레임이면 감은 채로 끝나 다음 루프 첫
   프레임에서 확 떠 스냅난다). 감은-눈은 rest 위상 프레임에
   얹어 몸통은 그대로 두고 눈만 바뀌게 한다.
   - 정면(down): 독립(unlink) 복제 2장에 감은-눈 픽셀 ops (open→closed→open
     읽히게), 뒤에 rest 프레임 ≥2.
   - 옆(side): 동일 (독립 복제 감은-눈 + 뒤 rest ≥2).
   - 뒤(up): 깜빡임 없음.
   감은-눈 픽셀은 **사람이 깎는다** — 자세마다 눈 위치가 달라 자동 이식
   금지 (포즈별 눈 좌표가 다르면 눈이 엉뚱한 데 감긴다).
5. **변형/픽셀 편집은 정지 원본 프레임에만** — 복제는 링크 동기화로 따라온다.

### 자동 적용 절차 (에이전트)

새 정지 자세 행이 추출되면 (큐레이션 없음 전제):

1. `curation.json` `states.<state>` 에: `selected=[still]`,
   `order=[still]+클론N`, `clones={새 idx: still}` (링크 기본 — 편집 복사 금지),
   breathe 위 레시피. **N = `recommended_breathe_frames(breathe) − 1`** (정지
   원본 1장 제외; 기본 breaths 3 → 17 클론 → 총 18컷). 링크 복제라 아틀라스
   셀은 안 늘어난다 — 호흡 위상당 유니크 셀만 굽는다. 18컷 `breaths: 3` 이면 유니크 칸 6개(위상이 6종만 반복).
2. fps 4 를 `sprite-request.json` 해당 상태에 기록.
3. 깜빡임(정면/옆)은 자동 생성하지 않는다 — "깜빡임 추가 대기" 로 보고하고
   사람이 정지 프레임 확정 후 눈을 깎는다.
4. 열린 큐레이션 탭이 있으면 두-작성자 충돌 방지를 위해 새로고침을 안내한다.

## Related

- [docs/README.md](README.md) — documentation index
