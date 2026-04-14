"use client";

import { useChat } from "@ai-sdk/react";
import type { FormEvent, KeyboardEvent } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

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
  { labelKo: "이 작품 한 줄 소개", labelEn: "One-line intro", question: "이 작품을 한 줄로 소개해 줘." },
  { labelKo: "왜 금정역인가요?", labelEn: "Why Geumjeong Station?", question: "왜 금정역을 입지로 택했어?" },
  { labelKo: "Extra Space가 뭐예요?", labelEn: "What is Extra Space?", question: "extra space가 뭔지 쉽게 설명해 줘." },
  { labelKo: "산본천과 설계", labelEn: "Sanboncheon & design", question: "산본천이 이 설계에서 어떤 역할이야?" },
  { labelKo: "레이어와 노드", labelEn: "Layers & nodes", question: "여기서 레이어와 노드는 각각 무슨 뜻이야?" },
  { labelKo: "전시에서 뭘 보나요?", labelEn: "What to see at the exhibit", question: "전시에서 어떤 자료나 내용을 볼 수 있어?" },
  { labelKo: "금정역 맥락 한눈에", labelEn: "Geumjeong context at a glance", question: "금정역 맥락을 한 번에 이해할 수 있게 설명해 줘." },
];

function readStoredLang(): UiLang {
  if (typeof window === "undefined") return "ko";
  return window.localStorage.getItem("es-lang") === "en" ? "en" : "ko";
}

export function ChatPanel() {
  const [sessionId, setSessionId] = useState(newSessionId);
  const [lang, setLang] = useState<UiLang>("ko");
  const [rawSearching, setRawSearching] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const submitIdRef = useRef("");
  const launchScrollRef = useRef<HTMLDivElement | null>(null);
  const launchPausedUntilRef = useRef<number>(0);
  const suppressClickRef = useRef(false);
  const dragRef = useRef<{ active: boolean; startX: number; startScrollLeft: number }>({
    active: false,
    startX: 0,
    startScrollLeft: 0,
  });

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
      lang === "en" ? "Extra Space — Exhibit assistant" : "Extra Space — 졸업전시 작품 안내";
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

  useEffect(() => {
    if (messages.length > 0) setHasStarted(true);
  }, [messages.length]);

  const t = useMemo(() => {
    if (lang === "en") {
      return {
        kicker: "Graduation exhibit",
        title: "Extra Space",
        sub: "Ask anything related to the project and exhibit.",
        empty: "Tap a sample question below, or type your own and press Enter.",
        visitor: "Visitor",
        guide: "Guide",
        received: "Request received. Generating a response…",
        generating: "Generating a response…",
        searchingSources: "Searching sources for a better answer…",
        suggestions: "Sample questions",
        launchHint: "Choose a question to start the conversation.",
        launchCta: "Experience Extra Space",
        launchSwipeHint: "Swipe horizontally to explore all cards.",
        placeholder: "Type a question, then Enter (new line: Shift+Enter)",
        send: "Send",
        sending: "Sending…",
        refresh: "New chat",
        errorPrefix: "Something went wrong.",
        errorSuffix: 'Use "New chat" to clear the thread and try again.',
        langGroupAria: "Language",
        adminFooter: "Admin · daily gap review",
      };
    }
    return {
      kicker: "Graduation exhibit",
      title: "Extra Space",
      sub: "작품과 관련된 내용이면 무엇이든 물어보세요.",
      empty: "예시 질문을 누르거나, 아래에 직접 입력한 뒤 Enter 로 보내세요.",
      visitor: "방문자",
      guide: "안내",
      received: "요청을 받았습니다. 답변을 생성하는 중입니다…",
      generating: "답변을 생성하는 중입니다…",
      searchingSources: "더 나은 답변을 위해 자료 검색 중입니다…",
      suggestions: "예시 질문",
      launchHint: "질문을 누르면 바로 답변이 시작됩니다.",
      launchCta: "Extra Space 경험하기",
      launchSwipeHint: "카드를 좌우로 밀어 모든 질문을 볼 수 있어요.",
      placeholder: "질문 입력 후 Enter (줄바꿈: Shift+Enter)",
      send: "보내기",
      sending: "응답 중…",
      refresh: "새로고침",
      errorPrefix: "요청 중 오류가 났습니다.",
      errorSuffix: "아래「새로고침」으로 대화를 비운 뒤 다시 시도해 주세요.",
      langGroupAria: "언어",
      adminFooter: "관리자 · 일일 gap 정리",
    };
  }, [lang]);

  const refreshChat = () => {
    if (busy) stop();
    setSessionId(newSessionId());
    setInput("");
    setHasStarted(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    if (busy || !input.trim()) return;
    handleSubmit(e as unknown as FormEvent<HTMLFormElement>);
  };

  const sendExample = (question: string) => {
    if (busy) return;
    setHasStarted(true);
    void append({ role: "user", content: question });
  };

  const onFormSubmit = (e: FormEvent<HTMLFormElement>) => {
    if (!hasStarted) setHasStarted(true);
    handleSubmit(e);
  };

  const shouldBlockClick = () => {
    if (!suppressClickRef.current) return false;
    suppressClickRef.current = false;
    return true;
  };

  const launchItems = useMemo(() => {
    const promptItems = EXAMPLE_PROMPTS.map((p) => ({
      key: `q-${p.question}`,
      label: lang === "en" ? p.labelEn : p.labelKo,
      kind: "question" as const,
      question: p.question,
    }));
    return [
      ...promptItems,
      {
        key: "cta-control",
        label: t.launchCta,
        kind: "cta" as const,
      },
    ];
  }, [lang, t.launchCta]);

  // 한 줄 4개 구성을 3번 반복해, 한 줄 12개를 1사이클로 만든다.
  const launchCycleItems = useMemo(
    () => [...launchItems, ...launchItems, ...launchItems],
    [launchItems],
  );

  useEffect(() => {
    if (hasStarted) return;
    const scroller = launchScrollRef.current;
    if (!scroller) return;
    const oneSetWidth = scroller.scrollWidth / 3;
    scroller.scrollLeft = oneSetWidth;
    const timer = window.setInterval(() => {
      const now = Date.now();
      if (now >= launchPausedUntilRef.current) {
        scroller.scrollLeft += 0.99;
        if (scroller.scrollLeft >= oneSetWidth * 2) {
          scroller.scrollLeft -= oneSetWidth;
        }
      }
    }, 16);
    return () => window.clearInterval(timer);
  }, [hasStarted]);

  useEffect(() => {
    if (hasStarted) return;
    const scroller = launchScrollRef.current;
    if (!scroller) return;
    const normalize = () => {
      const oneSetWidth = scroller.scrollWidth / 3;
      if (!Number.isFinite(oneSetWidth) || oneSetWidth <= 0) return;
      if (scroller.scrollLeft < oneSetWidth) {
        scroller.scrollLeft += oneSetWidth;
      } else if (scroller.scrollLeft >= oneSetWidth * 2) {
        scroller.scrollLeft -= oneSetWidth;
      }
    };
    scroller.addEventListener("scroll", normalize, { passive: true });
    return () => scroller.removeEventListener("scroll", normalize);
  }, [hasStarted]);

  const last = messages[messages.length - 1];
  const showGeneratingBubble =
    busy &&
    (!last ||
      last.role === "user" ||
      (last.role === "assistant" && !messageText(last).trim()));

  const typingLine =
    rawSearching && busy
      ? t.searchingSources
      : status === "submitted"
        ? t.received
        : t.generating;

  return (
    <div className="es-page">
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
          <h1 className="es-title">{t.title}</h1>
          <p className="es-sub">{t.sub}</p>
        </header>

        {!hasStarted && messages.length === 0 ? (
          <section className="es-launch">
            <p className="es-launch-hint">{t.launchHint}</p>
            <div
              className="es-launch-marquee"
              ref={launchScrollRef}
              onPointerDown={(e) => {
                const scrollerEl = launchScrollRef.current;
                if (!scrollerEl) return;
                launchPausedUntilRef.current = Date.now() + 6000;
                dragRef.current = {
                  active: true,
                  startX: e.clientX,
                  startScrollLeft: scrollerEl.scrollLeft,
                };
                scrollerEl.classList.add("is-dragging");
              }}
              onPointerUp={() => {
                launchPausedUntilRef.current = Date.now() + 2200;
                dragRef.current.active = false;
                launchScrollRef.current?.classList.remove("is-dragging");
              }}
              onPointerCancel={() => {
                launchPausedUntilRef.current = Date.now() + 2200;
                dragRef.current.active = false;
                launchScrollRef.current?.classList.remove("is-dragging");
              }}
              onPointerLeave={() => {
                dragRef.current.active = false;
                launchScrollRef.current?.classList.remove("is-dragging");
              }}
              onPointerMove={(e) => {
                const scrollerEl = launchScrollRef.current;
                if (!scrollerEl || !dragRef.current.active) return;
                const dx = e.clientX - dragRef.current.startX;
                scrollerEl.scrollLeft = dragRef.current.startScrollLeft - dx;
                launchPausedUntilRef.current = Date.now() + 3200;
                if (Math.abs(dx) > 7) suppressClickRef.current = true;
              }}
              onWheel={() => {
                launchPausedUntilRef.current = Date.now() + 2600;
              }}
            >
              <div className="es-launch-track">
                {[...launchCycleItems, ...launchCycleItems, ...launchCycleItems].map((item, idx) =>
                  item.kind === "cta" ? (
                    <a
                      key={`${item.key}-${idx}`}
                      className="es-launch-cta"
                      href="/control"
                      onClick={(e) => {
                        if (shouldBlockClick()) e.preventDefault();
                      }}
                    >
                      {item.label}
                    </a>
                  ) : (
                    <button
                      key={`${item.key}-${idx}`}
                      type="button"
                      className="es-launch-item"
                      disabled={busy}
                      onClick={() => {
                        if (shouldBlockClick()) return;
                        sendExample(item.question);
                      }}
                    >
                      {item.label}
                    </button>
                  ),
                )}
              </div>
            </div>
            <p className="es-launch-swipe">{t.launchSwipeHint}</p>
          </section>
        ) : (
          <>
            <div className="es-card">
              {error && (
                <p className="es-error" role="alert">
                  {t.errorPrefix} {error.message} — {t.errorSuffix}
                </p>
              )}
              {messages.length === 0 && !error && <p className="es-empty">{t.empty}</p>}
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

            <div className="es-suggestions">
              <span className="es-suggestions-label">{t.suggestions}</span>
              <div className="es-chips">
                {EXAMPLE_PROMPTS.map((p) => (
                  <button
                    key={p.question}
                    type="button"
                    className="es-chip"
                    disabled={busy}
                    onClick={() => sendExample(p.question)}
                  >
                    {lang === "en" ? p.labelEn : p.labelKo}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {hasStarted && (
          <form className="es-form" onSubmit={onFormSubmit}>
          <textarea
            className="es-input"
            value={input}
            onChange={handleInputChange}
            onKeyDown={onKeyDown}
            placeholder={t.placeholder}
            rows={2}
          />
          <div className="es-form-actions">
            <button type="submit" className="es-btn" disabled={busy}>
              {busy ? t.sending : t.send}
            </button>
            <button type="button" className="es-btn es-btn--secondary" onClick={refreshChat}>
              {t.refresh}
            </button>
          </div>
          </form>
        )}

        <footer className="es-footer">
          <a href="/admin/gaps">{t.adminFooter}</a>
          <span> · </span>
          <a href="/control">{lang === "en" ? "Scenario control" : "시나리오 제어"}</a>
        </footer>
      </div>
    </div>
  );
}
