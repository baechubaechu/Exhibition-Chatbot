"use client";

import { useChat } from "@ai-sdk/react";
import Image from "next/image";
import type { FormEvent, KeyboardEvent, RefObject } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import logoImage from "../../logo.png";

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

type UiLang = "ko" | "en";

const EXAMPLE_PROMPTS: { labelKo: string; labelEn: string; question: string }[] = [
  {
    labelKo: "졸업전시 한 줄",
    labelEn: "Exhibit in one line",
    question: "홍익대 건축학과 졸업전시 부스를 한 줄로 소개해 줘.",
  },
  {
    labelKo: "전시 언제·어디?",
    labelEn: "When & where",
    question: "졸업전시는 언제 어디서 하나요? 부스에서 무엇을 보면 되나요?",
  },
  {
    labelKo: "인터랙션 체험",
    labelEn: "Try the interaction",
    question: "이 전시가 설계 전시와 뭐가 다른지, 태블릿·모니터 인터랙션은 어떻게 체험하나요?",
  },
  {
    labelKo: "벽 패널 2·3·4",
    labelEn: "Wall panels 2–4",
    question: "벽에 붙은 패널 2, 3, 4번 다이어그램이 각각 무엇을 말하는 거예요?",
  },
  {
    labelKo: "모형 두 개 차이",
    labelEn: "Two models",
    question: "테이블 위 전체 모형과 상세 모형의 차이, 크기, 역할을 알려 줘.",
  },
  {
    labelKo: "태블릿·모니터",
    labelEn: "Tablet & monitor",
    question: "태블릿에서 환승·산책·X-tra Space를 고르면 모니터에 어떤 설명이 나와요?",
  },
  {
    labelKo: "X-tra Space",
    labelEn: "What is X-tra Space?",
    question: "X-tra Space가 뭔지 쉽게 설명해 줘.",
  },
  {
    labelKo: "관람 순서",
    labelEn: "Suggested tour",
    question: "전시장에 처음 왔을 때 벽·모형·태블릿을 어떤 순서로 보면 좋아요?",
  },
];

function readStoredLang(): UiLang {
  if (typeof window === "undefined") return "ko";
  return window.localStorage.getItem("es-lang") === "en" ? "en" : "ko";
}

export type ChatPanelVariant = "default" | "kiosk";

type ChatPanelProps = {
  variant?: ChatPanelVariant;
  hideHeaderLogo?: boolean;
  headerLogoRef?: RefObject<HTMLSpanElement | null>;
};

export function ChatPanel({ variant = "default", hideHeaderLogo = false, headerLogoRef }: ChatPanelProps) {
  const [sessionId, setSessionId] = useState(newSessionId);
  const [lang, setLang] = useState<UiLang>("ko");
  const [rawSearching, setRawSearching] = useState(false);
  const submitIdRef = useRef("");

  useLayoutEffect(() => {
    setLang(readStoredLang());
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("es-lang", lang);
  }, [lang]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = lang === "en" ? "en" : "ko";
    document.title =
      lang === "en" ? "X-tra Space — Exhibit assistant" : "X-tra Space — 졸업전시 작품 안내";
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute(
      "content",
      lang === "en" ? "Graduation exhibit project Q&A assistant." : "졸업전시 작품 안내",
    );
  }, [lang]);

  const prepareRequestBody = useCallback(
    ({ id: chatThreadId, messages }: { id: string; messages: unknown[] }) => {
      const submitId =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
      submitIdRef.current = submitId;
      return {
        id: chatThreadId,
        messages,
        sessionId,
        locale: lang,
        clientSubmitId: submitId,
      };
    },
    [sessionId, lang],
  );

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
    data,
  } = useChat({
    id: sessionId,
    api: "/api/chat",
    headers: { "x-es-locale": lang },
    experimental_prepareRequestBody: prepareRequestBody,
    onError: (e) => {
      console.error("[chat]", e);
    },
  });

  const busy = status === "streaming" || status === "submitted";

  useEffect(() => {
    if (status === "submitted") setRawSearching(false);
  }, [status]);

  useEffect(() => {
    if (!data?.length) return;
    const last = data[data.length - 1];
    if (
      typeof last === "object" &&
      last !== null &&
      (last as { type?: string }).type === "rag_status" &&
      (last as { phase?: string }).phase === "raw_search" &&
      (last as { clientSubmitId?: string }).clientSubmitId === submitIdRef.current
    ) {
      setRawSearching(true);
    }
  }, [data]);

  useEffect(() => {
    if (status === "streaming" || status === "ready") setRawSearching(false);
  }, [status]);

  const t = useMemo(() => {
    if (lang === "en") {
      return {
        kicker: "Graduation exhibit",
        title: "X-tra Space",
        sub: "Ask about the project and exhibit.",
        empty: "Your conversation shows up here. Try a sample below, or write your own.",
        visitor: "You",
        guide: "Guide",
        generating: "Generating a reply…",
        searchingSources: "Thinking deeply for a better answer…",
        suggestions: "Try asking…",
        placeholder: "Type here… press Enter to send, or Shift+Enter for a new line",
        send: "Send",
        sending: "Sending…",
        refresh: "Refresh",
        errorPrefix: "Something went wrong.",
        errorSuffix: "Clear and try again.",
        langGroupAria: "Language",
        adminFooter: "Admin · daily gap review",
      };
    }
    return {
      kicker: "Graduation exhibit",
      title: "X-tra Space",
      sub: "작품이나 전시 이야기, 편하게 물어보세요.",
      empty: "대화가 여기에 쌓입니다. 아래 예시 질문들을 누르거나 직접 입력할 수 있어요.",
      visitor: "방문",
      guide: "안내",
      generating: "답변 생성중",
      searchingSources: "더 나은 답변을 위해 깊게 생각중",
      suggestions: "이런 질문은 어때요?",
      placeholder: "보내기는 Enter, 줄바꿈은 Shift + Enter",
      send: "보내기",
      sending: "보내는 중…",
      refresh: "새로고침",
      errorPrefix: "오류가 났습니다.",
      errorSuffix: "새로고침한 뒤 다시 시도해 주세요.",
      langGroupAria: "언어",
      adminFooter: "관리자 · 일일 gap 정리",
    };
  }, [lang]);

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

  const onFormSubmit = (e: FormEvent<HTMLFormElement>) => {
    handleSubmit(e);
  };

  const last = messages[messages.length - 1];
  const showGeneratingBubble =
    busy &&
    (!last ||
      last.role === "user" ||
      (last.role === "assistant" && !messageText(last).trim()));

  const typingLine =
    rawSearching && busy ? t.searchingSources : t.generating;

  return (
    <div className="es-page">
      <div className="es-linear es-linear--tl" aria-hidden="true" />
      <div className="es-linear es-linear--br" aria-hidden="true" />
      <div className="es-inner">
        <div className="es-lang-bar" role="group" aria-label={t.langGroupAria}>
          <button
            type="button"
            className={`es-lang-btn ${lang === "ko" ? "es-lang-btn--on" : ""}`}
            aria-pressed={lang === "ko"}
            onClick={() => setLang("ko")}
          >
            Kr
          </button>
          <button
            type="button"
            className={`es-lang-btn ${lang === "en" ? "es-lang-btn--on" : ""}`}
            aria-pressed={lang === "en"}
            onClick={() => setLang("en")}
          >
            En
          </button>
        </div>

        <header className="es-header">
          <p className="es-kicker">{t.kicker}</p>
          <h1 className="es-title">
            <span
              ref={headerLogoRef}
              className={`es-title-logo-slot${hideHeaderLogo ? " es-title-logo-slot--hidden" : ""}`}
            >
              <Image src={logoImage} alt={t.title} className="es-title-logo" priority={false} />
            </span>
          </h1>
          <p className="es-sub">{t.sub}</p>
        </header>

        <div className="es-card">
          {error && (
            <p className="es-error" role="alert">
              {t.errorPrefix} {error.message} — {t.errorSuffix}
            </p>
          )}
          {messages.length === 0 && !error && (
            <div className="es-empty-state">
              <p className="es-empty">{t.empty}</p>
            </div>
          )}
          {messages.map((m, i) => (
            <div
              key={m.id || `m-${i}`}
              className={`es-row ${m.role === "user" ? "es-row--user" : "es-row--bot"}`}
            >
              <div className="es-meta">{m.role === "user" ? t.visitor : t.guide}</div>
              <div className={`es-bubble ${m.role === "user" ? "es-bubble--user" : "es-bubble--bot"}`}>
                {messageText(m)}
              </div>
            </div>
          ))}
          {showGeneratingBubble && (
            <div className="es-row es-row--bot es-row--typing" aria-live="polite">
              <div className="es-meta">{t.guide}</div>
              <div className="es-bubble es-bubble--bot es-bubble--typing">{typingLine}</div>
            </div>
          )}
        </div>

        <section className="es-hints" aria-label={t.suggestions}>
          <p className="es-hints-label">{t.suggestions}</p>
          <div className="es-hints-grid">
            {EXAMPLE_PROMPTS.map((p) => (
              <button
                key={p.question}
                type="button"
                className="es-hint-slat"
                disabled={busy}
                onClick={() => sendExample(p.question)}
              >
                {lang === "en" ? p.labelEn : p.labelKo}
              </button>
            ))}
          </div>
        </section>

        <form className="es-composer" onSubmit={onFormSubmit}>
          <div className="es-input-wrap">
            <textarea
              className="es-input"
              value={input}
              onChange={handleInputChange}
              onKeyDown={onKeyDown}
              placeholder={t.placeholder}
              rows={3}
            />
          </div>
          <div className="es-form-actions">
            <button type="submit" className="es-btn es-btn--slit" disabled={busy}>
              {busy ? t.sending : t.send}
            </button>
            <button type="button" className="es-btn es-btn--slit es-btn--ghost" onClick={refreshChat}>
              {t.refresh}
            </button>
          </div>
        </form>

        <footer className="es-footer">
          {variant !== "kiosk" ? <a href="/admin/gaps">{t.adminFooter}</a> : null}
        </footer>
      </div>
    </div>
  );
}
