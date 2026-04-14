"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Zone = "zoneA" | "zoneB" | "all";
type Emotion = "calm" | "neutral" | "active" | "stressed";

type EventStateResponse = {
  seq: number;
  queueSize: number;
  services: Array<{
    service: string;
    status: "ok" | "degraded" | "down";
    effectiveStatus: "ok" | "degraded" | "down";
    detail?: string;
    at: string;
    ageMs: number;
    stale: boolean;
  }>;
  latest: Partial<Record<string, { payload: Record<string, unknown>; envelope: { timestamp: string } }>>;
};

export default function ControlPage() {
  const [peopleCount, setPeopleCount] = useState<number>(0);
  const [decibel, setDecibel] = useState<number>(45);
  const [emotionState, setEmotionState] = useState<Emotion>("neutral");
  const [durationSec, setDurationSec] = useState<number>(120);
  const [profileName, setProfileName] = useState<string>("visitor-override");
  const [targetZone, setTargetZone] = useState<Zone>("all");
  const [state, setState] = useState<EventStateResponse | null>(null);
  const [lastResult, setLastResult] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    const tick = async () => {
      try {
        const res = await fetch("/api/events/state", { cache: "no-store" });
        if (!res.ok || !mounted) return;
        const j = (await res.json()) as EventStateResponse;
        setState(j);
        const sensor = j.latest?.["sensor.state"]?.payload;
        if (sensor) {
          if (typeof sensor.peopleCount === "number") setPeopleCount(sensor.peopleCount);
          if (typeof sensor.decibel === "number") setDecibel(sensor.decibel);
          if (
            typeof sensor.emotionState === "string" &&
            ["calm", "neutral", "active", "stressed"].includes(sensor.emotionState)
          ) {
            setEmotionState(sensor.emotionState as Emotion);
          }
        }
      } catch {
      }
    };

    void tick();
    const id = setInterval(() => {
      void tick();
    }, 4000);

    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  const envHealth = useMemo(() => {
    const env = state?.services.find((s) => s.service === "env-service");
    if (!env) return "unknown";
    return env.effectiveStatus;
  }, [state]);

  const publishOverride = async () => {
    setBusy(true);
    setLastResult("");
    try {
      const res = await fetch("/api/events/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: "scenario.override",
          source: "control-ui",
          payload: {
            peopleCount,
            decibel,
            emotionState,
            durationSec,
            profileName,
            targetZone,
          },
        }),
      });
      const text = await res.text();
      setLastResult(res.ok ? "Override sent" : `Failed: ${text}`);
    } catch {
      setLastResult("Network error");
    } finally {
      setBusy(false);
    }
  };

  const safeRecover = async () => {
    setBusy(true);
    setLastResult("");
    try {
      const res = await fetch("/api/events/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetZone, reason: "manual safe recovery" }),
      });
      const text = await res.text();
      setLastResult(res.ok ? "Safe scene requested" : `Failed: ${text}`);
    } catch {
      setLastResult("Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="control-page">
      <section className="control-card">
        <div className="control-topbar">
          <Link href="/" className="control-back">
            ← 메인으로 돌아가기
          </Link>
        </div>
        <h1>Exhibit Scenario Control</h1>
        <p className="control-sub">기본 센서값 위에 관람객 가정값을 덮어써 환경 에이전트를 트리거합니다.</p>

        <div className="control-health">
          <span>Env service: </span>
          <strong>{envHealth}</strong>
          <span> | queue: {state?.queueSize ?? 0}</span>
        </div>

        <label>
          People count
          <input type="number" min={0} max={300} value={peopleCount} onChange={(e) => setPeopleCount(Number(e.target.value))} />
        </label>

        <label>
          Decibel
          <input type="number" min={0} max={160} value={decibel} onChange={(e) => setDecibel(Number(e.target.value))} />
        </label>

        <label>
          Emotion
          <select value={emotionState} onChange={(e) => setEmotionState(e.target.value as Emotion)}>
            <option value="calm">calm</option>
            <option value="neutral">neutral</option>
            <option value="active">active</option>
            <option value="stressed">stressed</option>
          </select>
        </label>

        <label>
          Duration (sec)
          <input type="number" min={5} max={3600} value={durationSec} onChange={(e) => setDurationSec(Number(e.target.value))} />
        </label>

        <label>
          Profile name
          <input value={profileName} onChange={(e) => setProfileName(e.target.value)} />
        </label>

        <label>
          Target zone
          <select value={targetZone} onChange={(e) => setTargetZone(e.target.value as Zone)}>
            <option value="all">all</option>
            <option value="zoneA">zoneA</option>
            <option value="zoneB">zoneB</option>
          </select>
        </label>

        <div className="control-actions">
          <button onClick={publishOverride} disabled={busy}>Send override</button>
          <button onClick={safeRecover} disabled={busy} className="warn">Emergency safe scene</button>
        </div>

        {lastResult && <p className="control-result">{lastResult}</p>}
      </section>
    </main>
  );
}
