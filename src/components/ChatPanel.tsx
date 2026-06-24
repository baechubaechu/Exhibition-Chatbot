"use client";

import { useChat } from "@ai-sdk/react";
import Image from "next/image";
import type { FormEvent, KeyboardEvent, PointerEvent, RefObject } from "react";
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
  { labelKo: "관람 순서", labelEn: "Viewing order", question: "전시 부스 관람 순서를 추천해 줘." },
  { labelKo: "이 작품 한 줄 소개", labelEn: "One-line intro", question: "이 작품을 한 줄로 소개해 줘." },
  { labelKo: "왜 금정역인가요?", labelEn: "Why Geumjeong Station?", question: "왜 금정역을 입지로 택했어?" },
  { labelKo: "X-tra Space가 뭐예요?", labelEn: "What is X-tra Space?", question: "X-tra Space가 뭔지 쉽게 설명해 줘." },
  { labelKo: "산본천과 설계", labelEn: "Sanboncheon & design", question: "산본천이 이 설계에서 어떤 역할이야?" },
  { labelKo: "레이어와 노드", labelEn: "Layers & nodes", question: "여기서 레이어와 노드는 각각 무슨 뜻이야?" },
  { labelKo: "전시에서 뭘 보나요?", labelEn: "What to see at the exhibit", question: "전시에서 어떤 자료나 내용을 볼 수 있어?" },
  { labelKo: "금정역 맥락 한눈에", labelEn: "Geumjeong context at a glance", question: "금정역 맥락을 한 번에 이해할 수 있게 설명해 줘." },
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const hintsViewportRef = useRef<HTMLDivElement>(null);
  const hintsDragRef = useRef({ active: false, startX: 0, startScroll: 0, dragged: false });
  const hintsAutoPauseRef = useRef(false);

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
        empty: "Your conversation shows up here. Tap a sample above the input, or type below.",
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
      empty: "대화가 여기에 쌓입니다. 입력창 위 예시를 누르거나 직접 입력해 보세요.",
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

  const onHintClick = (question: string) => {
    if (hintsDragRef.current.dragged) return;
    sendExample(question);
  };

  const onHintsPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const el = hintsViewportRef.current;
    if (!el) return;
    hintsDragRef.current = { active: true, startX: e.clientX, startScroll: el.scrollLeft, dragged: false };
    hintsAutoPauseRef.current = true;
    el.setPointerCapture(e.pointerId);
    el.classList.add("es-hints-viewport--dragging");
  };

  const onHintsPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const state = hintsDragRef.current;
    const el = hintsViewportRef.current;
    if (!state.active || !el) return;
    const dx = e.clientX - state.startX;
    if (Math.abs(dx) > 5) state.dragged = true;
    el.scrollLeft = state.startScroll - dx;
  };

  const endHintsPointer = (e: PointerEvent<HTMLDivElement>) => {
    const el = hintsViewportRef.current;
    if (!el) return;
    const wasDragged = hintsDragRef.current.dragged;
    hintsDragRef.current.active = false;
    hintsAutoPauseRef.current = false;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    el.classList.remove("es-hints-viewport--dragging");
    if (wasDragged) {
      window.setTimeout(() => {
        hintsDragRef.current.dragged = false;
      }, 0);
    } else {
      hintsDragRef.current.dragged = false;
    }
  };

  useEffect(() => {
    const el = hintsViewportRef.current;
    if (!el) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    let raf = 0;
    const step = () => {
      if (!hintsAutoPauseRef.current && !hintsDragRef.current.active) {
        el.scrollLeft += 0.35;
        const loopAt = el.scrollWidth / 2;
        if (loopAt > 0 && el.scrollLeft >= loopAt - 1) el.scrollLeft = 0;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    const pause = () => {
      hintsAutoPauseRef.current = true;
    };
    const resume = () => {
      if (!hintsDragRef.current.active) hintsAutoPauseRef.current = false;
    };

    el.addEventListener("mouseenter", pause);
    el.addEventListener("mouseleave", resume);

    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("mouseenter", pause);
      el.removeEventListener("mouseleave", resume);
    };
  }, []);

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

  const lastMessageText = useMemo(() => {
    const m = messages[messages.length - 1];
    return m ? messageText(m) : "";
  }, [messages]);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
      return;
    }
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "instant" });
  }, []);

  useLayoutEffect(() => {
    scrollToBottom();
  }, [messages.length, lastMessageText, showGeneratingBubble, typingLine, scrollToBottom]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const ro = new ResizeObserver(() => scrollToBottom());
    ro.observe(el);
    for (const child of el.children) ro.observe(child);

    return () => ro.disconnect();
  }, [messages.length, scrollToBottom]);

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

        <div className="es-chat-shell">
          <div className="es-card">
            <div className="es-card-scroll" ref={scrollRef}>
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
              <div ref={bottomRef} className="es-scroll-anchor" aria-hidden="true" />
            </div>

            <section className="es-hints-strip es-hints-strip--in-card" aria-label={t.suggestions}>
              <p className="es-hints-label">{t.suggestions}</p>
              <div
                ref={hintsViewportRef}
                className="es-hints-viewport"
                onPointerDown={onHintsPointerDown}
                onPointerMove={onHintsPointerMove}
                onPointerUp={endHintsPointer}
                onPointerCancel={endHintsPointer}
              >
                <div className="es-hints-track">
                  {[...EXAMPLE_PROMPTS, ...EXAMPLE_PROMPTS].map((p, i) => (
                    <button
                      key={`${p.question}-${i}`}
                      type="button"
                      className="es-hint-slat es-hint-slat--slide"
                      disabled={busy}
                      onClick={() => onHintClick(p.question)}
                    >
                      {lang === "en" ? p.labelEn : p.labelKo}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <form className="es-composer es-composer--in-card" onSubmit={onFormSubmit}>
              <div className="es-input-wrap">
                <textarea
                  className="es-input"
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={onKeyDown}
                  placeholder={t.placeholder}
                  rows={2}
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
          </div>
        </div>

        <footer className="es-footer">
          {variant !== "kiosk" ? <a href="/admin/gaps">{t.adminFooter}</a> : null}
        </footer>
      </div>
    </div>
  );
}
