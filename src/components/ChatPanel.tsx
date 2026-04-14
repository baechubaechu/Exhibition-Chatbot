"use client";

import { useChat } from "@ai-sdk/react";
import type { FormEvent, KeyboardEvent } from "react";
import { useState } from "react";

function newSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function messageText(m: { content?: string; parts?: Array<{ type: string; text?: string }> }): string {
  if (typeof m.content === "string" && m.content.length > 0) return m.content;
  if (!m.parts?.length) return "";
  return m.parts
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text as string)
    .join("");
}

const EXAMPLE_PROMPTS: { label: string; question: string }[] = [
  { label: "이 작품 한 줄 소개", question: "이 작품을 한 줄로 소개해 줘." },
  { label: "왜 금정역인가요?", question: "왜 금정역을 입지로 택했어?" },
  { label: "extra space가 뭐예요?", question: "extra space가 뭔지 쉽게 설명해 줘." },
  { label: "산본천과 설계", question: "산본천이 이 설계에서 어떤 역할이야?" },
  { label: "레이어와 노드", question: "여기서 레이어와 노드는 각각 무슨 뜻이야?" },
  { label: "전시에서 뭘 보나요?", question: "전시에서 어떤 자료나 내용을 볼 수 있어?" },
];

export function ChatPanel() {
  const [sessionId, setSessionId] = useState(newSessionId);
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    status,
    append,
    setInput,
    stop,
    error,
  } = useChat({
    id: sessionId,
    api: "/api/chat",
    body: { sessionId },
    onError: (e) => {
      console.error("[chat]", e);
    },
  });

  const busy = status === "streaming" || status === "submitted";

  const refreshChat = () => {
    if (busy) stop();
    setSessionId(newSessionId());
    setInput("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    if (busy || !input.trim()) return;
    handleSubmit(e as unknown as FormEvent<HTMLFormElement>);
  };

  const sendExample = (question: string) => {
    if (busy) return;
    void append({ role: "user", content: question });
  };

  return (
    <div className="es-page">
      <div className="es-inner">
        <header className="es-header">
          <p className="es-kicker">Graduation exhibit</p>
          <h1 className="es-title">Extra Space</h1>
          <p className="es-sub">작품과 관련된 내용이면 무엇이든 물어보세요.</p>
        </header>

        <div className="es-card">
          {error && (
            <p className="es-error" role="alert">
              요청 중 오류가 났습니다. {error.message} — 아래「새로고침」으로 대화를 비운 뒤 다시 시도해 주세요.
            </p>
          )}
          {messages.length === 0 && !error && (
            <p className="es-empty">예시 질문을 누르거나, 아래에 직접 입력한 뒤 Enter 로 보내세요.</p>
          )}
          {messages.map((m, i) => (
            <div
              key={m.id || `m-${i}`}
              className={`es-row ${m.role === "user" ? "es-row--user" : "es-row--bot"}`}
            >
              <div className="es-meta">{m.role === "user" ? "방문자" : "안내"}</div>
              <div className={`es-bubble ${m.role === "user" ? "es-bubble--user" : "es-bubble--bot"}`}>
                {messageText(m)}
              </div>
            </div>
          ))}
        </div>

        <div className="es-suggestions">
          <span className="es-suggestions-label">예시 질문</span>
          <div className="es-chips">
            {EXAMPLE_PROMPTS.map((p) => (
              <button
                key={p.label}
                type="button"
                className="es-chip"
                disabled={busy}
                onClick={() => sendExample(p.question)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <form className="es-form" onSubmit={handleSubmit}>
          <textarea
            className="es-input"
            value={input}
            onChange={handleInputChange}
            onKeyDown={onKeyDown}
            placeholder="질문 입력 후 Enter (줄바꿈: Shift+Enter)"
            rows={2}
          />
          <div className="es-form-actions">
            <button type="submit" className="es-btn" disabled={busy}>
              {busy ? "응답 중…" : "보내기"}
            </button>
            <button type="button" className="es-btn es-btn--secondary" onClick={refreshChat}>
              새로고침
            </button>
          </div>
        </form>

        <footer className="es-footer">
          <a href="/admin/gaps">관리자 · 일일 gap 정리</a>
        </footer>
      </div>
    </div>
  );
}
