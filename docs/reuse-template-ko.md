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

## 5) 인터랙티브 기능 점검

- `npm run dev:webpack`
- `/` : 채팅 + 예시질문 무한스크롤
- `/control` : 시나리오 오버라이드 발행
- `/api/events/state` : 이벤트 버스 상태 확인

## 6) 환경서비스 실행

```powershell
cd spatial-environment-agent
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:EVENT_BRIDGE_BASE_URL="http://127.0.0.1:3000"
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## 7) 장치 연동 시 교체 지점

- `spatial-environment-agent/app/device/light_driver.py`
- `spatial-environment-agent/app/device/speaker_driver.py`

위 2개 파일의 TODO 부분을 실제 장치 SDK 호출로 바꾸면 됩니다.
