# 템플릿 재사용 가이드 (DB 교체)

이 백업 브랜치는 UI/이벤트/환경서비스 구조를 유지한 채,
프로젝트별로 데이터베이스만 교체해서 재사용하기 위한 기준본입니다.

## 1) 새 프로젝트로 복제

```bash
git clone <this-repo-url> new-project
cd new-project
git checkout backup/chat-ui-template-20260414
```

## 2) 필수 환경 변수 교체

`.env.local`에 아래 항목만 새 프로젝트 값으로 교체하세요.

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_SECRET`
- (선택) `OPENAI_CHAT_MODEL`, `OPENAI_EMBEDDING_MODEL`

## 3) DB 스키마 적용

- `supabase/migrations/20250414000000_init.sql` 실행
- 필요하면 테이블명/컬럼명만 프로젝트 목적에 맞게 변경

## 4) 콘텐츠 교체

- `wiki/canonical/` 내용 교체
- `wiki/sources/` 원문 교체
- `npm run sync:knowledge` 실행

## 5) 챗봇 로컬 점검

- 이 폴더에서 `npm run dev` → `http://localhost:3000/`

## 6) 전시 스택 (별도 동작)

같은 상위 폴더의 **`exhibition-agent/`** 가 제어 웹·FastAPI·장치 브리지를 담당합니다. **이 챗봇과 이벤트·API 연동은 하지 않습니다.** 실행 방법은 `exhibition-suite/README.md` 및 `exhibition-agent/README.md` 를 따르세요.
