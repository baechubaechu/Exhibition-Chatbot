# 10분 커스텀 체크리스트 (백업 템플릿용)

이 문서만 따라 하면, 다른 사람이 템플릿을 받아 **프로젝트 이름/설명/색 테마/콘텐츠/DB**를 빠르게 바꿀 수 있습니다.

## 0) 시작

```bash
git clone <repo-url>
cd exhibition-chatbot
git checkout backup/chat-ui-template-20260414
npm install
```

## 1) 프로젝트 이름/설명 바꾸기 (2분)

### 파일: `src/app/layout.tsx`

- `metadata.title` 변경
- `metadata.description` 변경

예)

```ts
export const metadata: Metadata = {
  title: "My Exhibit Assistant",
  description: "My graduation project interactive assistant",
};
```

### 파일: `src/components/ChatPanel.tsx`

- 헤더/설명/버튼 문구: `t` 객체 수정
- 예시 질문: `EXAMPLE_PROMPTS` 수정
- 첫 화면 CTA 문구: `launchCta` 수정

## 2) 색 테마 바꾸기 (3분)

### 파일: `src/app/globals.css`

먼저 상단 색 변수(`:root`)를 바꾸세요.

- `--bg`, `--bg-deep`
- `--text`, `--muted`
- `--accent`
- `--border`, `--panel`

그 다음 필요하면 아래만 추가 조정:

- `.es-title` (타이틀 그라데이션)
- `.es-launch-item`, `.es-launch-cta` (첫 화면 카드)
- `.es-btn` (입력창 버튼)
- `.control-card`, `.control-actions button` (시나리오 페이지)

## 3) DB/키 교체 (1분)

### 파일: `.env.local`

아래 값을 새 프로젝트 것으로 교체:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `ADMIN_SECRET`

## 4) 콘텐츠 교체 (2분)

- `wiki/canonical/*` : 정본 문서
- `wiki/sources/*` : 원문 자료

반영 명령:

```bash
npm run sync:knowledge
```

PDF/이미지 포함 시:

```bash
npm run sync:knowledge:with-media
```

## 5) 실행/검증 (이 챗봇만)

```bash
npm run clean
npm run dev:webpack
npm run build
```

- 채팅 UI: `http://localhost:3000` (또는 점유 시 다른 포트)

전시 제어·조명·이벤트 버스는 **`exhibition-suite/exhibition-agent/`** 를 참고합니다. 이 챗봇과는 **코드 연동 없음**.

---

## 커스텀 최소 파일 요약

- 이름/설명: `src/app/layout.tsx`
- 문구/예시: `src/components/ChatPanel.tsx`
- 색 테마: `src/app/globals.css`
- DB/키: `.env.local`
- 콘텐츠: `wiki/canonical/*`, `wiki/sources/*`
