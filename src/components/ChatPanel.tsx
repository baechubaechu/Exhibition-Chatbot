"use client";

import { useChat } from "@ai-sdk/react";
import type { FormEvent, KeyboardEvent } from "react";
import { useRef } from "react";

export function ChatPanel() {
  const sessionId = useRef(crypto.randomUUID());
  const { messages, input, handleInputChange, handleSubmit, status } = useChat({
    api: "/api/chat",
    body: { sessionId: sessionId.current },
  });

  const busy = status === "streaming" || status === "submitted";

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    if (busy || !input.trim()) return;
    handleSubmit(e as unknown as FormEvent<HTMLFormElement>);
  };

  return (
    <div className="es-page">
      <div className="es-inner">
        <header className="es-header">
          <p className="es-kicker">Graduation exhibit</p>
          <h1 className="es-title">Extra Space</h1>
          <p className="es-sub">
            작품과 관련된 내용이면 무엇이든 물어보세요. 입지, 개념, 설계 논리, 전시까지 편하게 질문해 주세요.
          </p>
        </header>

        <div className="es-card">
          {messages.length === 0 && (
            <p className="es-empty">아래에 질문을 적고 Enter 로 보낼 수 있습니다.</p>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={`es-row ${m.role === "user" ? "es-row--user" : "es-row--bot"}`}
            >
              <div className="es-meta">{m.role === "user" ? "방문자" : "안내"}</div>
              <div className={`es-bubble ${m.role === "user" ? "es-bubble--user" : "es-bubble--bot"}`}>
                {m.content}
              </div>
            </div>
          ))}
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
          <button type="submit" className="es-btn" disabled={busy}>
            {busy ? "응답 중…" : "보내기"}
          </button>
        </form>

        <footer className="es-footer">
          <a href="/admin/gaps">관리자 · 일일 gap 정리</a>
        </footer>
      </div>
    </div>
  );
}
