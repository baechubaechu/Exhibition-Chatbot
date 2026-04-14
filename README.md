# 전시용 챗봇 (위키 우선 + 원문 RAG)

## 폴더 구조

- `docs/` — 비개발자 초기 설정(`setup-first-time-ko.md`), Vercel 배포(`vercel-deploy-ko.md`).
- `wiki/canonical/` — 전시 **정본** Markdown (RAG 1차). 파일명 예: `00_project_overview.md` … `09_critic_faq.md`.
- `wiki/sources/` — 원천 로그 (`chatgpt`, `other_ai`, `critics`, `scripts`, `references` …). RAG 2차(원문) 인제스트 대상. **PDF·PNG·JPG 등**도 여기 두고 `npm run extract:media`로 텍스트를 뽑으면 `wiki/sources/_media_extracts/`에 `.md`가 생기며, 이후 `digest` / `ingest:raw`가 그대로 소화합니다.
- `wiki/archived/` — 참고용 보관. **기본 인제스트 대상 아님** (필요 시 스크립트 확장).
- `wiki/DIGEST_ALGORITHM.md` — 원문 → canonical 소화 절차 설명.

## 준비

1. Supabase에서 Postgres + `pgvector` 활성화 후, **`supabase/migrations/20250414000000_init.sql`** 전체를 SQL Editor에 붙여넣고 Run (스키마 단일 소스).
2. `.env.example`을 참고해 `.env.local` 작성 (`OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_SECRET` 등).
3. 비개발자용 단계별 안내: **[docs/setup-first-time-ko.md](docs/setup-first-time-ko.md)**.
4. **`.env.local`** 은 Git에 올라가지 않습니다. 키는 **본인만** 채우고 GitHub/카톡에 공유하지 마세요.
5. `npm install` 후:
   - **원문만 넣고 빠르게 검색만 갱신**: `1_벡터만_올리기.bat` 더블클릭 (= `extract:media` + `npm run sync:knowledge`)
   - **소화 알고리즘까지 전부**: `2_원문소화후_벡터올리기.bat` 더블클릭 (= `extract:media` + `digest:all-canonical` + `sync:knowledge`, API 비용·시간 큼)
   - 또는 터미널: `npm run digest:canonical -- --canonical 03_site_analysis.md` (한 파일만 소화)
6. `npm run dev` → http://localhost:3000

## Vercel 배포 (인터넷 URL)

[docs/vercel-deploy-ko.md](docs/vercel-deploy-ko.md) 참고. 환경 변수는 Vercel 대시보드에만 설정합니다.

## 챗봇이 쓰는 API (연결)

- **OpenAI** HTTP API를 **서버에서만** 호출합니다.
- 라이브러리: **Vercel AI SDK** `streamText` / `generateObject` + **`@ai-sdk/openai`** 어댑터.
- 모델: `.env`의 `OPENAI_CHAT_MODEL`(기본 `gpt-4o-mini`), 임베딩은 `OPENAI_EMBEDDING_MODEL`.
- 별도의 “Responses API 전용 URL”을 붙일 필요는 없고, **`OPENAI_API_KEY`만 유효하면** 동일 베이스 URL로 연결됩니다.

## 기능

- **오프토픽**: 질문이 전시 범위 밖이면 거절(`refused`, gap 아님). 범위 문구는 `PROJECT_SCOPE_SNIPPET` 또는 `wiki/canonical/00_project_overview.md` 앞부분. 끄려면 `DISABLE_TOPIC_GUARD=1`.
- **2단계 검색**: 위키 유사도 + 마진 게이트 통과 시 위키만 사용; 실패 시 원문 청크 검색.
- **근거**: 서버에서만 RAG로 검색하며, 답변 본문에는 출처·번호 표기를 넣지 않습니다.
- **전시 운영**: IP 기준 메모리 레이트리밋, 동일 질문 짧은 메모리 캐시, `STATIC_FAQ_JSON` 정적 FAQ.
- **일일 gap**: `chat_turns`에 `gap_candidate` 기록. `/admin/gaps`에서 목록·Markdown/CSV보내기·처리 완료 표시.

## 인터랙티브 통합 (MVP)

- 이벤트 버스 API: `/api/events/*` (`publish`, `pull`, `state`, `heartbeat`, `recover`)
- 컨트롤 패널: `/control` (사람수/dB/감정 상태 override 발행, 안전 복귀 트리거)
- 챗 연동: `chat.scene_hint` 이벤트가 질문 완료 시 자동 발행
- 계약 문서: [docs/event-bus-contract-ko.md](docs/event-bus-contract-ko.md)
- 환경 서비스(로컬 노트북 실행): `spatial-environment-agent/README.md`

## 환경 변수

자세한 키는 `.env.example` 참고.

## PDF·이미지(렌더·도면 등)

1. 파일을 `wiki/sources/` 아래 원하는 폴더에 둡니다 (예: `wiki/sources/diagrams/plan.pdf`).
2. `npm run extract:media` 실행 → `wiki/sources/_media_extracts/`에 `.md`가 생성됩니다. (이미지는 Vision, PDF는 텍스트 레이어 우선·부족 시 PDF 비전)
3. 이후 기존과 동일하게 `npm run digest:canonical …` 또는 배치 파일로 소화·`ingest` 하면 됩니다. 한 번에 돌리려면 `npm run sync:knowledge:with-media`.

옵션: `--force` (항상 다시 추출), `--only=pdf` / `--only=image`. 모델은 `.env`의 `OPENAI_VISION_MODEL`, `OPENAI_PDF_VISION_MODEL`로 조절합니다.
