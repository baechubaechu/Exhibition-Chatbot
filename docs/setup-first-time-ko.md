# 전시 챗봇 — 처음 한 번만 하면 되는 설정 (비개발자용)

> AI는 Supabase·OpenAI 계정에 대신 로그인할 수 없습니다. 아래 순서대로 복사·붙여넣기·클릭만 하면 됩니다.

## 1) Supabase에서 vector 켜기 + 테이블 만들기

1. [supabase.com](https://supabase.com) 로그인 → 새 프로젝트(또는 기존 프로젝트).
2. 왼쪽 **SQL Editor** 클릭.
3. 이 저장소의 **`supabase/migrations/20250414000000_init.sql`** 파일을 메모장으로 열기 → **전체 복사**.
4. SQL Editor 빈 칸에 붙여넣기 → **Run**.
5. 에러 없이 끝나면 성공. (이미 있으면 `already exists` 류 메시지는 무시해도 됩니다.)

## 2) Supabase에서 복사해 둘 값 (나중에 `.env.local`에 붙임)

1. **Project Settings**(톱니) → **API**.
2. **Project URL** → `SUPABASE_URL`
3. **service_role** secret (절대 유출 금지) → `SUPABASE_SERVICE_ROLE_KEY`

## 3) OpenAI 키

1. [platform.openai.com](https://platform.openai.com) → API keys → Create new secret key  
2. 복사한 값 → `OPENAI_API_KEY`

## 4) `.env.local` 파일

1. 프로젝트 루트에 **`.env.local`** 파일 생성(또는 열기). 이름 앞의 점(`.`)이 있어야 합니다.
2. **`.env.example`** 을 참고해 `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_SECRET` 등을 채웁니다.
3. `ADMIN_SECRET` = 전시 관리자 페이지(`/admin/gaps`)용으로 쓸 본인만 아는 긴 비밀번호.

## 5) Node.js 설치 (한 번만)

[nodejs.org](https://nodejs.org) LTS 설치 → 설치 후 PC 재시작 한 번 권장.

## 6) 터미널에서 한 번만: `npm install`

`exhibition-chatbot` 폴더에서:

```bash
npm install
```

## 7) 원문 넣은 뒤 — 둘 중 하나

- **A) 소화(자동 초안)까지** — 시간·API 비용 많음  
  → `2_원문소화후_벡터올리기.bat` 더블클릭 (맨 앞에서 PDF·이미지도 `wiki/sources/_media_extracts`로 뽑음)  
  → 끝나면 `wiki/canonical/*.md` 맨 아래 초안·`_media_extracts` 내용 확인·수정 후 다시 실행 권장

- **B) 벡터만 갱신** (원문 폴더만 바꿨을 때)  
  → `1_벡터만_올리기.bat` 더블클릭 (PDF·이미지 추출 단계 포함)

**도면·렌더·다이어그램(PDF/이미지)** 는 `wiki/sources/` 아래에 두고, 배치를 돌리거나 터미널에서 `npm run extract:media`만 먼저 실행해도 됩니다.

## 8) 챗봇 실행

```bash
npm run dev
```

브라우저: http://localhost:3000

## 9) Cursor에서 AI에게 시킬 때 예시

- `exhibition-chatbot 폴더에서 npm run sync:knowledge:with-digest 실행해줘`
- `원문 넣었으니 ingest만 해줘`
