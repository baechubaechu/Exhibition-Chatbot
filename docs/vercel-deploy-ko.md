# Vercel 배포 가이드 (Extra Space 전시 챗봇)

## 1. 코드를 GitHub에 올리기

1. [GitHub](https://github.com)에 새 저장소를 만듭니다.
2. `exhibition-chatbot` 폴더를 그 저장소의 **루트**로 푸시합니다.  
   (이미 상위에 다른 프로젝트가 있다면 Vercel에서 **Root Directory**만 `exhibition-chatbot`으로 지정하면 됩니다.)

> `.env.local`은 `.gitignore`에 있어서 **올라가지 않습니다.** 키는 Vercel 대시보드에서만 넣습니다.

## 2. Vercel 연결

1. [vercel.com](https://vercel.com) 로그인 → **Add New… → Project**.
2. **Import**에서 위 GitHub 저장소를 선택합니다.
3. **Framework Preset**: Next.js (자동 인식)
4. **Root Directory**: 저장소 루트가 `exhibition-chatbot`이면 비워 두고, 상위 폴더면 `exhibition-chatbot` 입력.
5. **Deploy** 전에 아래 **환경 변수**를 먼저 넣는 것을 권장합니다 (Settings → Environment Variables에서도 추가 가능).

## 3. 필수 환경 변수 (Production)

| 이름 | 설명 |
|------|------|
| `OPENAI_API_KEY` | OpenAI API 키 |
| `SUPABASE_URL` | Supabase Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase **service_role** 시크릿 (서버 전용, 절대 공개 금지) |
| `ADMIN_SECRET` | `/admin/gaps` 로그인용 비밀번호 |

선택:

| 이름 | 설명 |
|------|------|
| `NEXT_PUBLIC_APP_NAME` | 브라우저 탭 제목 등 (비우면 기본 `Extra Space`) |
| `OPENAI_CHAT_MODEL` | 기본 `gpt-4o-mini` |
| `OPENAI_EMBEDDING_MODEL` | 기본 `text-embedding-3-small` |
| `PROJECT_SCOPE_SNIPPET` | 오프토픽 판별용 짧은 범위 문구 |
| `STATIC_FAQ_JSON` | JSON 배열 `[{"q":"...","a":"..."}]` |
| `WIKI_MATCH_THRESHOLD` 등 | `.env.example` 참고 |

**Environment**는 최소 **Production**에 넣고, 프리뷰도 쓰면 **Preview**에도 동일하게 복사합니다.

## 4. 배포 후 할 일

1. 배포가 끝나면 `https://프로젝트명.vercel.app` 같은 URL이 생깁니다. 브라우저에서 열어 채팅이 되는지 확인합니다.
2. **Supabase 데이터**는 클라우드에 이미 올려둔 상태여야 합니다. 로컬에서만 `ingest` 했다면, 그 데이터는 **Supabase 프로젝트에 그대로** 있으므로 같은 `SUPABASE_URL`/키를 쓰면 배포 앱도 같은 DB를 봅니다.
3. 위키/원문을 바꾼 뒤 벡터를 갱신하려면 **로컬에서** `npm run ingest:wiki` / `ingest:raw`를 다시 실행하면 됩니다 (같은 Supabase를 가리키므로).

## 5. CLI로만 배포하고 싶을 때

```bash
cd exhibition-chatbot
npx vercel login
npx vercel        # 첫 연결·환경 변수 안내
npx vercel --prod # 프로덕션
```

## 6. 자주 나는 문제

- **500 / Supabase 오류**: 환경 변수 이름 오타, `service_role` 키가 아닌 `anon` 키를 넣은 경우.
- **채팅은 되는데 답이 빈약함**: DB에 `wiki_chunks` / `raw_chunks`가 비어 있음 → 로컬에서 `ingest` 후 재시도.
- **관리자 페이지 401**: `ADMIN_SECRET`이 Vercel에 없거나 다름.

## 7. 전시장에서

- 배포 URL만 크롬 등에 띄우면 되고, **집 PC를 켜 둘 필요는 없습니다.**
- 안정적으로 쓰려면 Vercel **Pro** 여부·OpenAI **결제 한도**만 전시 전에 한 번 확인하세요.
