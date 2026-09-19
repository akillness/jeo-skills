# Pre-render Fixture

검증기와 Open-Generative-AI render-plan 변환기를 네트워크·API 키·유료 호출 없이 시험하는 가짜 상품 패킷이다.

- 실제 상품이 아니다.
- `example.invalid` URL은 의도적으로 해석되지 않는다.
- 한 픽셀 PNG는 로컬에서 생성한 권리 테스트 자산이다.
- 공개·업로드·모델 실행에 사용하면 안 된다.
- `open-generative-ai-gui` lane이므로 provider request는 manual-finish 패킷만 만든다.

```bash
node ../../scripts/validate-run.mjs --root . --stage pre-render
node ../../scripts/prepare-render-plan.mjs \
  --input production/render-plan.json \
  --out production/provider-requests.json
```
