# 원문(`wiki/sources`) → 정리 위키(`wiki/canonical`) 소화 알고리즘

## 목표

`wiki/sources` 아래의 **대화·메모·스크립트·참고자료**를 사람이 읽기 좋은 **`wiki/canonical/*.md`** 문장으로 옮기되, **환각을 줄이기 위해** “주장 단위”로 쪼갠 뒤 합성한다.

## 단계 개요

1. **수집(Collection)**  
   - 대상: `wiki/sources/**/*.{md,txt}` (선택적으로 하위 폴더만, 예: `chatgpt/`)  
   - PDF·이미지는 먼저 `npm run extract:media`로 `wiki/sources/_media_extracts/**/*.md`로 바꾼 뒤, 그 `.md`도 동일하게 수집된다.  
   - 각 파일에 **출처 경로**(`sources/chatgpt/…`)를 메타로 붙인다.

2. **정규화(Normalize)**  
   - 줄바꿈 통일, 빈 줄 정리, `lightScrubPII` 수준의 **경량 PII 마스킹**(이메일·전화 등).

3. **맵(Map): 청크 → 주장 후보**  
   - 긴 텍스트는 단락 기준으로 잘라 각 청크에 대해 LLM이 JSON으로 출력:  
     - `claims[]`: 짧은 사실/결정/가설 문장  
     - `confidence`: high / medium / low  
     - `verbatim_excerpt`: 원문에서 **복붙 수준**의 짧은 인용(근거 추적용)  
   - **규칙**: 원문에 없는 내용은 `claims`에 넣지 않는다.

4. **리듀스(Reduce): 주장 → 위키 초안**  
   - `--canonical`으로 지정한 파일(예: `03_site_analysis.md`)의 **역할**에 맞게, 수집된 `claims`만 사용해 Markdown 본문을 생성한다.  
   - `open_questions`: 원문만으로 확정할 수 없는 점을 **질문 형태**로 남긴다.

5. **기록(Write)**  
   - 기본: `wiki/canonical/<파일>` 하단에  
     `## 자동 소화 초안 (검수 필요)` + 날짜 + 본문을 **append**한다.  
   - 사람이 검수·편집 후 `npm run ingest:wiki`로 벡터 DB를 갱신한다.

## 스크립트

```bash
# (선택) PDF·이미지 → wiki/sources/_media_extracts/*.md
npm run extract:media

# 예: 대지 분석 문서로 소화 (sources 전체를 입력으로)
npx tsx scripts/digest-sources-to-canonical.ts --canonical 03_site_analysis.md

# 특정 소스 폴더만
npx tsx scripts/digest-sources-to-canonical.ts --canonical 08_public_faq.md --sources other_ai
```

## 한계

- LLM이 “요약” 과정에서 왜곡할 수 있으므로 **반드시 canonical에 검수 단계**를 둔다.  
- 법적·저작권이 있는 `references`는 자동 반영 전 **인용 범위**를 사람이 확인한다.
- Vision·PDF 파일 해석은 **모델이 틀릴 수 있으므로** `_media_extracts`와 canonical 초안을 사람이 확인한다.
