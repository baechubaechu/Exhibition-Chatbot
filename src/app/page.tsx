"use client";

import { ChatPanel } from "@/components/ChatPanel";
import Image from "next/image";
import type { CSSProperties, TransitionEvent } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import logoImage from "../../logo.png";

const SPLASH_HOLD_MS = 1600;
const SPLASH_CROSSFADE_MS = 1000;

type EntryPhase = "splash" | "crossfade" | "done";

function rectToFlyStyle(rect: DOMRect): CSSProperties {
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

export default function HomePage() {
  const [phase, setPhase] = useState<EntryPhase>("splash");
  const [splashIn, setSplashIn] = useState(false);
  const [chatIn, setChatIn] = useState(false);
  const [headerLogoVisible, setHeaderLogoVisible] = useState(false);
  const [flyStyle, setFlyStyle] = useState<CSSProperties | null>(null);
  const [flyAnimating, setFlyAnimating] = useState(false);

  const splashLogoRef = useRef<HTMLSpanElement>(null);
  const headerLogoRef = useRef<HTMLSpanElement>(null);
  const splashRectRef = useRef<DOMRect | null>(null);
  const flightDoneRef = useRef(false);

  const finishFlight = () => {
    if (flightDoneRef.current) return;
    flightDoneRef.current = true;
    setFlyStyle(null);
    setFlyAnimating(false);
    setHeaderLogoVisible(true);
    setPhase("done");
  };

  useEffect(() => {
    const t = window.setTimeout(() => setSplashIn(true), 30);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const holdTimer = window.setTimeout(() => {
      const el = splashLogoRef.current;
      if (el) splashRectRef.current = el.getBoundingClientRect();
      flightDoneRef.current = false;
      setPhase("crossfade");
    }, SPLASH_HOLD_MS);
    return () => window.clearTimeout(holdTimer);
  }, []);

  useEffect(() => {
    if (phase !== "crossfade") return;
    let cancelled = false;
    let raf2 = 0;
    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        if (!cancelled) setChatIn(true);
      });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
    };
  }, [phase]);

  useLayoutEffect(() => {
    if (phase !== "crossfade") return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setChatIn(true);
      setHeaderLogoVisible(true);
      setPhase("done");
      return;
    }

    const from = splashRectRef.current;
    const toEl = headerLogoRef.current;
    if (!from || !toEl) {
      const fallback = window.setTimeout(finishFlight, SPLASH_CROSSFADE_MS);
      return () => window.clearTimeout(fallback);
    }

    const to = toEl.getBoundingClientRect();
    setFlyStyle(rectToFlyStyle(from));
    setFlyAnimating(false);

    let raf2 = 0;
    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        setFlyAnimating(true);
        setFlyStyle(rectToFlyStyle(to));
      });
    });

    const fallback = window.setTimeout(finishFlight, SPLASH_CROSSFADE_MS + 120);

    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
      window.clearTimeout(fallback);
    };
  }, [phase]);

  const onFlyTransitionEnd = (event: TransitionEvent<HTMLDivElement>) => {
    if (event.propertyName !== "width") return;
    finishFlight();
  };

  return (
    <div
      className="es-entry-root"
      style={{ ["--splash-crossfade-ms" as string]: `${SPLASH_CROSSFADE_MS}ms` }}
    >
      {phase !== "splash" && (
        <div
          className={`es-entry-chat ${chatIn ? "es-entry-chat--in" : ""} ${phase === "done" ? "es-entry-chat--done" : ""}`}
        >
          <ChatPanel variant="kiosk" hideHeaderLogo={!headerLogoVisible} headerLogoRef={headerLogoRef} />
        </div>
      )}

      {flyStyle && (
        <div
          className={`es-logo-fly ${flyAnimating ? "es-logo-fly--animating" : ""}`}
          style={flyStyle}
          onTransitionEnd={onFlyTransitionEnd}
          aria-hidden="true"
        >
          <Image src={logoImage} alt="" className="es-logo-fly-image" priority />
        </div>
      )}

      {phase !== "done" && (
        <main
          className={`es-splash ${splashIn ? "es-splash--in" : ""} ${phase === "crossfade" ? "is-fading" : ""}`}
          aria-label="X-tra Space intro"
        >
          {phase === "splash" && (
            <span ref={splashLogoRef} className="es-splash-logo-wrap">
              <Image src={logoImage} alt="X-tra Space" className="es-splash-logo-image" priority />
            </span>
          )}
        </main>
      )}
    </div>
  );
}
