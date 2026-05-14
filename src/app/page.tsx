"use client";

import { ChatPanel } from "@/components/ChatPanel";
import Image from "next/image";
import { useEffect, useState } from "react";
import logoImage from "../../logo.png";

const SPLASH_HOLD_MS = 1600;
const SPLASH_CROSSFADE_MS = 1000;

type EntryPhase = "splash" | "crossfade" | "done";

export default function HomePage() {
  const [phase, setPhase] = useState<EntryPhase>("splash");
  const [splashIn, setSplashIn] = useState(false);
  const [chatIn, setChatIn] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setSplashIn(true), 30);
    return () => window.clearTimeout(t);
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

  useEffect(() => {
    const holdTimer = window.setTimeout(() => setPhase("crossfade"), SPLASH_HOLD_MS);
    const exitTimer = window.setTimeout(() => setPhase("done"), SPLASH_HOLD_MS + SPLASH_CROSSFADE_MS);
    return () => {
      window.clearTimeout(holdTimer);
      window.clearTimeout(exitTimer);
    };
  }, []);

  return (
    <div className="es-entry-root">
      {phase !== "splash" && (
        <div
          className={`es-entry-chat ${chatIn ? "es-entry-chat--in" : ""} ${phase === "done" ? "es-entry-chat--done" : ""}`}
        >
          <ChatPanel variant="kiosk" />
        </div>
      )}
      {phase !== "done" && (
        <main
          className={`es-splash ${splashIn ? "es-splash--in" : ""} ${phase === "crossfade" ? "is-fading" : ""}`}
          aria-label="X-tra Space intro"
        >
          <Image src={logoImage} alt="X-tra Space" className="es-splash-logo-image" priority />
        </main>
      )}
    </div>
  );
}
