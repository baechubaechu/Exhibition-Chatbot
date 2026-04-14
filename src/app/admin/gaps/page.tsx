"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

type Row = {
  id: string;
  created_at: string;
  exhibition_day: string;
  session_id: string;
  user_message: string;
  assistant_message: string;
  outcome: string;
  gap_candidate: boolean;
  review_status: string;
  retrieval_debug: unknown;
};

export default function AdminGapsPage() {
  const [password, setPassword] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [day, setDay] = useState("");
  const [pendingOnly, setPendingOnly] = useState(true);
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState("");

  const selectedIds = useMemo(() => Object.keys(selected).filter((k) => selected[k]), [selected]);

  const login = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "로그인 실패");
      setLoggedIn(true);
      setPassword("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (day) q.set("day", day);
      if (pendingOnly) q.set("pendingOnly", "1");
      const res = await fetch(`/api/admin/gaps?${q.toString()}`, { credentials: "include" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "불러오기 실패");
      setItems(j.items ?? []);
      setSelected({});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [day, pendingOnly]);

  const resolveSelected = async () => {
    if (!selectedIds.length) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/gaps/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids: selectedIds, notes: notes || undefined }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "처리 실패");
      await load();
      setNotes("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const exportUrl = (format: "md" | "csv") => {
    if (!day) {
      setError("보내기는 날짜(YYYY-MM-DD)가 필요합니다.");
      return;
    }
    window.open(`/api/admin/gaps/export?day=${encodeURIComponent(day)}&format=${format}`, "_blank");
  };

  if (!loggedIn) {
    return (
      <div style={{ maxWidth: 420, margin: "80px auto", padding: 24 }}>
        <Link href="/" className="admin-back">
          ← 챗봇으로 돌아가기
        </Link>
        <h1 style={{ fontSize: "1.2rem" }}>관리자 로그인</h1>
        <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>일일 gap 목록을 보려면 ADMIN_SECRET을 입력하세요.</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호"
          style={{ width: "100%", padding: 10, marginTop: 12, borderRadius: 8 }}
        />
        {error && <p style={{ color: "#f88" }}>{error}</p>}
        <button type="button" onClick={login} disabled={loading} style={{ marginTop: 12, padding: "10px 16px" }}>
          {loading ? "…" : "로그인"}
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: 24 }}>
      <Link href="/" className="admin-back">
        ← 챗봇으로 돌아가기
      </Link>
      <h1 style={{ fontSize: "1.25rem" }}>일일 gap 정리</h1>
      <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
        `gap_candidate`이고 필요 시 `pending`만 필터합니다. 위키에 반영한 뒤 &quot;처리 완료&quot;로 표시하세요.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16, alignItems: "center" }}>
        <label>
          날짜{" "}
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)} style={{ padding: 8 }} />
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={pendingOnly} onChange={(e) => setPendingOnly(e.target.checked)} />
          pending만
        </label>
        <button type="button" onClick={load} disabled={loading}>
          불러오기
        </button>
        <button type="button" onClick={() => exportUrl("md")}>
          Markdown보내기
        </button>
        <button type="button" onClick={() => exportUrl("csv")}>
          CSV보내기
        </button>
      </div>
      <div style={{ marginTop: 12 }}>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="처리 메모(선택)"
          rows={2}
          style={{ width: "100%", padding: 8, borderRadius: 8 }}
        />
        <button type="button" onClick={resolveSelected} disabled={loading || !selectedIds.length} style={{ marginTop: 8 }}>
          선택 항목 처리 완료 ({selectedIds.length})
        </button>
      </div>
      {error && <p style={{ color: "#f88" }}>{error}</p>}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 20, fontSize: "0.85rem" }}>
        <thead>
          <tr>
            <th style={{ borderBottom: "1px solid #333", textAlign: "left", padding: 8 }}></th>
            <th style={{ borderBottom: "1px solid #333", textAlign: "left", padding: 8 }}>일</th>
            <th style={{ borderBottom: "1px solid #333", textAlign: "left", padding: 8 }}>상태</th>
            <th style={{ borderBottom: "1px solid #333", textAlign: "left", padding: 8 }}>질문</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r) => (
            <tr key={r.id}>
              <td style={{ borderBottom: "1px solid #222", padding: 8, verticalAlign: "top" }}>
                <input
                  type="checkbox"
                  checked={!!selected[r.id]}
                  onChange={(e) => setSelected((s) => ({ ...s, [r.id]: e.target.checked }))}
                />
              </td>
              <td style={{ borderBottom: "1px solid #222", padding: 8, verticalAlign: "top", whiteSpace: "nowrap" }}>
                {r.exhibition_day}
              </td>
              <td style={{ borderBottom: "1px solid #222", padding: 8, verticalAlign: "top" }}>
                {r.review_status} / {r.outcome}
              </td>
              <td style={{ borderBottom: "1px solid #222", padding: 8, verticalAlign: "top" }}>
                <div style={{ fontWeight: 600 }}>{r.user_message}</div>
                <div style={{ color: "var(--muted)", marginTop: 6 }}>{r.assistant_message}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!loading && items.length === 0 && <p style={{ color: "var(--muted)", marginTop: 16 }}>항목이 없습니다.</p>}
    </div>
  );
}
