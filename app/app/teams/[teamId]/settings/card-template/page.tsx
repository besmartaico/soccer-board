"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const DARK = "#0d1117";
const MID = "#161b22";
const BORDER = "#30363d";
const TEXT = "#e6edf3";
const MUTED = "#7d8590";

type Slot = { row: number; col: number; field: string };

const CORE_FIELDS: { key: string; label: string }[] = [
  { key: "photo", label: "Photo" },
  { key: "name", label: "Name" },
  { key: "jersey_number", label: "Jersey #" },
];

function fieldLabel(field: string): string {
  if (field === "photo") return "Photo";
  if (field === "name") return "Name";
  if (field === "jersey_number") return "Jersey #";
  if (field.startsWith("extra:")) return field.slice(6);
  return field;
}

export default function CardTemplatePage() {
  const router = useRouter();
  const params = useParams() as { teamId?: string | string[] } | null;
  const teamIdRaw = params?.teamId;
  const teamId = Array.isArray(teamIdRaw) ? teamIdRaw[0] : teamIdRaw;

  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<string>("");
  const [rows, setRows] = useState<number>(4);
  const [cols, setCols] = useState<number>(3);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [extraFields, setExtraFields] = useState<string[]>([]);
  const [dragField, setDragField] = useState<string | null>(null);

  // Load template + extras
  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const authH: Record<string, string> = sess?.session ? { Authorization: `Bearer ${sess.session.access_token}` } : {};
        const [tplRes, rosterRes] = await Promise.all([
          fetch(`/api/teams/${teamId}/card-template`, { cache: "no-store", headers: authH }),
          fetch(`/api/teams/${teamId}/roster`, { cache: "no-store", headers: authH }),
        ]);
        if (cancelled) return;
        if (!tplRes.ok) { setError(`Could not load template (${tplRes.status})`); setLoaded(true); return; }
        const tplJ = await tplRes.json();
        setRole(tplJ.role ?? "");
        if (tplJ.template) {
          setRows(tplJ.template.rows ?? 4);
          setCols(tplJ.template.cols ?? 3);
          setSlots(Array.isArray(tplJ.template.slots) ? tplJ.template.slots : []);
        }
        if (rosterRes.ok) {
          const rJ = await rosterRes.json();
          const players = Array.isArray(rJ.players) ? rJ.players : [];
          const extraKeys = new Set<string>();
          for (const p of players) {
            const ex = p?.extra ?? {};
            for (const k of Object.keys(ex)) extraKeys.add(k);
          }
          setExtraFields(Array.from(extraKeys).sort());
        }
        setLoaded(true);
      } catch (err: any) {
        setError(String(err?.message ?? err));
        setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [teamId]);

  const canEdit = role === "admin";

  const usedFieldsAtCell = useCallback((r: number, c: number) => slots.find(s => s.row === r && s.col === c), [slots]);
  const placedFields = useMemo(() => new Set(slots.map(s => s.field)), [slots]);

  function clearCell(r: number, c: number) {
    setSlots(prev => prev.filter(s => !(s.row === r && s.col === c)));
  }

  function placeFieldAt(r: number, c: number, field: string) {
    if (!field) return;
    // remove field if it was anywhere else (each field appears once), and clear any existing slot at (r,c)
    setSlots(prev => {
      const filtered = prev.filter(s => s.field !== field && !(s.row === r && s.col === c));
      return [...filtered, { row: r, col: c, field }];
    });
  }

  function handleResize(newRows: number, newCols: number) {
    // drop slots outside the new bounds
    setSlots(prev => prev.filter(s => s.row < newRows && s.col < newCols));
    setRows(newRows);
    setCols(newCols);
  }

  async function handleSave() {
    if (!canEdit || saving) return;
    // Validate core fields are placed
    const placed = new Set(slots.map(s => s.field));
    const missing = ["photo", "name", "jersey_number"].filter(f => !placed.has(f));
    if (missing.length > 0) {
      setError("Required fields missing: " + missing.map(fieldLabel).join(", "));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (sess?.session) headers.Authorization = `Bearer ${sess.session.access_token}`;
      const r = await fetch(`/api/teams/${teamId}/card-template`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ rows, cols, slots }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${r.status}`);
      }
    } catch (err: any) {
      setError("Save failed: " + (err?.message ?? String(err)));
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return <div style={{ minHeight: "100vh", background: DARK, color: MUTED, padding: 24 }}>Loading…</div>;
  }

  // Available palette: core fields not yet placed + extras not yet placed
  const palette: { key: string; label: string; required: boolean }[] = [
    ...CORE_FIELDS.map(f => ({ key: f.key, label: f.label, required: true })),
    ...extraFields.map(k => ({ key: `extra:${k}`, label: k, required: false })),
  ];

  return (
    <div style={{ minHeight: "100vh", background: DARK, color: TEXT, padding: "16px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <button onClick={() => router.push("/app/teams")} style={{ background: "transparent", border: "none", color: MUTED, cursor: "pointer", fontSize: 13 }}>← Teams</button>
        <div style={{ width: 1, height: 18, background: BORDER }} />
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Player Card Template</h1>
        <div style={{ fontSize: 12, color: MUTED }}>· role: {role || "viewer"}</div>
      </div>

      {!canEdit && (
        <div style={{ background: "#7c2d12", color: "#fed7aa", padding: 10, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          You can view the template but only team admins can save changes.
        </div>
      )}

      {error && (
        <div style={{ background: "#7f1d1d", color: "#fecaca", padding: 10, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{error}</div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          Rows:
          <input type="number" min={1} max={12} value={rows} disabled={!canEdit} onChange={e => handleResize(Math.max(1, Math.min(12, Number(e.target.value) || 1)), cols)} style={{ width: 60, background: MID, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 6, padding: "4px 6px" }} />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          Columns:
          <input type="number" min={1} max={12} value={cols} disabled={!canEdit} onChange={e => handleResize(rows, Math.max(1, Math.min(12, Number(e.target.value) || 1)))} style={{ width: 60, background: MID, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 6, padding: "4px 6px" }} />
        </label>
        {canEdit && (
          <button onClick={handleSave} disabled={saving} style={{ marginLeft: "auto", background: "#0ea5e9", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 14, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1 }}>{saving ? "Saving…" : "💾 Save Template"}</button>
        )}
      </div>

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
        {/* Field Palette */}
        <div style={{ width: 240, background: MID, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Field Palette</div>
          <div style={{ fontSize: 11, color: MUTED, marginBottom: 12 }}>Drag fields onto the grid. Each field can appear once.</div>
          {palette.length === 0 && <div style={{ fontSize: 12, color: MUTED }}>No fields available yet. Import a roster first.</div>}
          {palette.map(p => {
            const isPlaced = placedFields.has(p.key);
            return (
              <div
                key={p.key}
                draggable={canEdit && !isPlaced}
                onDragStart={e => { setDragField(p.key); e.dataTransfer.setData("text/plain", p.key); }}
                onDragEnd={() => setDragField(null)}
                style={{
                  padding: "8px 10px",
                  marginBottom: 6,
                  background: isPlaced ? "#1e293b" : DARK,
                  border: `1px solid ${isPlaced ? "#475569" : (p.required ? "#dc2626" : BORDER)}`,
                  borderRadius: 6,
                  fontSize: 12,
                  color: isPlaced ? MUTED : TEXT,
                  textDecoration: isPlaced ? "line-through" : "none",
                  cursor: !canEdit ? "default" : (isPlaced ? "not-allowed" : "grab"),
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span>{p.label}</span>
                {p.required && <span style={{ fontSize: 10, color: isPlaced ? MUTED : "#dc2626" }}>required</span>}
              </div>
            );
          })}
        </div>

        {/* Grid */}
        <div style={{ flex: 1, background: MID, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Large Card Layout ({rows} × {cols})</div>
          <div style={{ fontSize: 11, color: MUTED, marginBottom: 12 }}>This is how the LARGE player card will look. Drop fields into cells. Click a cell to clear it.</div>
          <div style={{
            display: "grid",
            gridTemplateRows: `repeat(${rows}, minmax(60px, 1fr))`,
            gridTemplateColumns: `repeat(${cols}, minmax(60px, 1fr))`,
            gap: 4,
            background: DARK,
            padding: 6,
            borderRadius: 8,
            aspectRatio: `${cols} / ${rows}`,
            maxWidth: 600,
          }}>
            {Array.from({ length: rows * cols }).map((_, i) => {
              const r = Math.floor(i / cols);
              const c = i % cols;
              const slot = usedFieldsAtCell(r, c);
              return (
                <div
                  key={`${r}-${c}`}
                  onDragOver={canEdit ? e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } : undefined}
                  onDrop={canEdit ? e => { e.preventDefault(); const f = e.dataTransfer.getData("text/plain") || dragField; if (f) placeFieldAt(r, c, f); } : undefined}
                  onClick={() => canEdit && slot && clearCell(r, c)}
                  style={{
                    background: slot ? (slot.field === "photo" ? "#1e3a8a" : "#1e293b") : "#0d1117",
                    border: `2px dashed ${slot ? "#3b82f6" : "#30363d"}`,
                    borderRadius: 6,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    color: slot ? "#fff" : MUTED,
                    cursor: canEdit ? (slot ? "pointer" : "default") : "default",
                    textAlign: "center",
                    padding: 4,
                    overflow: "hidden",
                    minHeight: 60,
                  }}
                  title={slot ? "Click to clear" : ""}
                >
                  {slot ? fieldLabel(slot.field) : ""}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 20, fontSize: 11, color: MUTED }}>
        Note: This template only affects the LARGE player card size. Small/Medium/X-Small sizes use their existing fixed layouts.
      </div>
    </div>
  );
}
