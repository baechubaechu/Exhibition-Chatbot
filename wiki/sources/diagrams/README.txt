도면 PNG + (선택) PDF 페어 업로드 폴더

같은 이름으로 두면 extract:media 가 한 md 로 병합합니다.
  plan_floor1.pdf  ← 텍스트 레이어 (pdf-parse)
  plan_floor1.png  ← 고해상도 도면 (Vision, gpt-4o)

PNG 만 있어도 됩니다 (diagrams 폴더는 도면 전용 프롬프트·모델 사용).

실행:
  npm run extract:media
  npm run ingest:raw
