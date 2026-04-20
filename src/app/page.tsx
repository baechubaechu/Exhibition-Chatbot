"use client";

import { ChatPanel } from "@/components/ChatPanel";
import Image from "next/image";
import { useEffect, useState } from "react";
import logoImage from "../../logo.png";

const SPLASH_HOLD_MS = 1000;
const SPLASH_FADE_MS = 700;

export default function HomePage() {
  const [showSplash, setShowSplash] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const holdTimer = window.setTimeout(() => setFadeOut(true), SPLASH_HOLD_MS);
    const exitTimer = window.setTimeout(() => setShowSplash(false), SPLASH_HOLD_MS + SPLASH_FADE_MS);
    return () => {
      window.clearTimeout(holdTimer);
      window.clearTimeout(exitTimer);
    };
  }, []);

  if (showSplash) {
    return (
      <main className={`es-splash ${fadeOut ? "is-fading" : ""}`} aria-label="Extra Space Intro">
        <Image src={logoImage} alt="Extra Space logo" className="es-splash-logo-image" priority />
      </main>
    );
  }

  return <ChatPanel variant="kiosk" />;
}
