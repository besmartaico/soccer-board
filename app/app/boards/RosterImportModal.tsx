"use client";

import { useState, useRef } from "react";
import {
  parseCsvFile, parseExcelFile, parseGoogleSheet, applyMapping, autoMap,
  type ParsedSheet, type FieldMapping,
} from "@/lib/rosterParser";

interface Props {
  teamId: string;
  accessToken: string | null;
  onClose: () => void;
  onImported: (count: number) => void;
}

const MAROON = "#7f1630";
const DARK = "#0d1117";
const MID = "#161b22";
const BORDER = "#30363d";

export default function RosterImportModal({ teamId, accessToken, onClose, onImported }: Props) {
  const [step, setStep] = useState<"source" | "mapping" | "review">("source");
  const [source, setSource] = useState<"csv" | "excel" | "google" | null>(null);
  const [sheetId, setSheetId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedSheet | null>(null);
  const [mapping, setMapping] = useState<FieldMapping>({
    external_id: "", name: "", picture_url: "", jersey_number: "", extras: [],
  });
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>, kind: "csv" | "excel") {
    const f = e.target.files?.[0];
    if (!f) return;
    setLoading(true); setError(null);
    try {
      const p = kind === "csv" ? await parseCsvFile(f) : await parseExcelFile(f);
      if (!p.rows.length) throw new Error("No rows found in file");
      setParsed(p);
      const auto = autoMap(p.headers);
      setMapping((m) => ({ ...m, ...auto } as FieldMapping));
      setSource(kind);
      setStep("mapping");
    } catch (e: any) {
      setError(e?.message ?? "Failed to parse file");
    } finally { setLoading(false); }
  }

  async function loadGoogleSheet() {
    if (!sheetId.trim()) { setError("Enter a Google Sheet ID"); return; }
    setLoading(true); setError(null);
    try {
      const p = await parseGoogleSheet(sheetId.trim());
      if (!p.rows.length) throw new Error("Sheet has no rows. Make sure it's shared to anyone with the link.");
      setParsed(p);
      const auto = autoMap(p.headers);
      setMapping((m) => ({ ...m, ...auto } as FieldMapping));
      setSource("google");
      setStep("mapping");
    } catch (e: any) {
      setError(e?.message ?? "Failed to load sheet");
    } finally { setLoading(false); }
  }

  async function doImport() {
    if (!parsed) return;
    if (!mapping.external_id || !mapping.name || !mapping.picture_url || !mapping.jersey_number) {
      setError("All four required fields must be mapped");
      return;
    }
    const result = applyMapping(parsed.rows, mapping);
    if (!result.players.length) {
      setError("No valid rows after mapping. " + (result.errors[0]?.message ?? ""));
      return;
    }

    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/teams/${teamId}/roster`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ players: result.players }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Import failed");
      }
      const data = await res.json();
      onImported(data.count ?? result.players.length);
    } catch (e: any) {
      setError(e?.message ?? "Import failed");
    } finally { setLoading(false); }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", background: DARK, border: `1px solid ${BORDER}`,
    color: "#e6edf3", padding: "10px 12px", borderRadius: 8, fontSize: 14, outline: "none",
  };

  const selectStyle: React.CSSProperties = { ...inputStyle, cursor: "pointer" };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex",
        alignItems: "center", justifyContent: "center", zIndex: 300, padding: 20 }}
      onClick={onClose}
    >
      <div
        style={{ background: MID, borderRadius: 14, padding: 28, width: "100%", maxWidth: 720,
          border: `1px solid ${BORDER}`, maxHeight: "92vh", overflowY: "auto", color: "#e6edf3" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>
            Import Roster {step === "mapping" ? "— Map Fields" : ""}
          </h2>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#94a3b8", fontSize: 22, cursor: "pointer" }}>×</button>
        </div>

        {error && (
          <div style={{ background: "rgba(127,22,48,0.2)", border: `1px solid ${MAROON}`,
            color: "#ffa0b0", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            {error}
          </div>
        )}

        {step === "source" && (
          <div style={{ display: "grid", gap: 14 }}>
            <p style={{ color: "#94a3b8", fontSize: 13, margin: 0 }}>
              Choose how to import your roster. Required fields: ID, Player Name, Picture URL, and Jersey #.
            </p>

            <div style={{ background: DARK, padding: 16, borderRadius: 10, border: `1px solid ${BORDER}` }}>
              <div style={{ fontWeight: 700, marginBottom: 10 }}>📊 Google Sheet</div>
              <input
                placeholder="Sheet ID (the long string from the URL)"
                value={sheetId}
                onChange={(e) => setSheetId(e.target.value)}
                style={{ ...inputStyle, marginBottom: 10 }}
              />
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 10 }}>
                Sheet must be shared to "Anyone with the link can view".
              </div>
              <button
                onClick={loadGoogleSheet}
                disabled={loading || !sheetId.trim()}
                style={{ background: MAROON, color: "white", padding: "9px 18px",
                  borderRadius: 7, border: "none", cursor: "pointer", fontWeight: 600,
                  opacity: loading || !sheetId.trim() ? 0.5 : 1 }}
              >
                {loading ? "Loading…" : "Load from Google Sheet"}
              </button>
            </div>

            <div style={{ background: DARK, padding: 16, borderRadius: 10, border: `1px solid ${BORDER}` }}>
              <div style={{ fontWeight: 700, marginBottom: 10 }}>📁 Upload File (CSV or Excel)</div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => {
                  const name = e.target.files?.[0]?.name.toLowerCase() ?? "";
                  if (name.endsWith(".csv")) handleFile(e, "csv");
                  else handleFile(e, "excel");
                }}
                style={{ color: "#cbd5e1", fontSize: 13 }}
              />
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 8 }}>
                Accepts .csv, .xlsx, .xls. First row must be column headers.
              </div>
            </div>
          </div>
        )}

        {step === "mapping" && parsed && (
          <div style={{ display: "grid", gap: 14 }}>
            <p style={{ color: "#94a3b8", fontSize: 13, margin: 0 }}>
              Found <b style={{ color: "#e6edf3" }}>{parsed.rows.length}</b> rows with{" "}
              <b style={{ color: "#e6edf3" }}>{parsed.headers.length}</b> columns. Map each required field below.
            </p>

            {([
              ["external_id", "ID *"],
              ["name", "Player Name *"],
              ["picture_url", "Picture URL *"],
              ["jersey_number", "Jersey # *"],
            ] as const).map(([key, label]) => (
              <div key={key} style={{ display: "grid", gridTemplateColumns: "180px 1fr", alignItems: "center", gap: 12 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#cbd5e1" }}>{label}</label>
                <select
                  value={mapping[key] as string}
                  onChange={(e) => setMapping({ ...mapping, [key]: e.target.value })}
                  style={selectStyle}
                >
                  <option value="">— Select column —</option>
                  {parsed.headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
            ))}

            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", marginBottom: 8, letterSpacing: "0.08em" }}>
                OPTIONAL COLUMNS (saved as extras)
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {parsed.headers.filter(h =>
                  ![mapping.external_id, mapping.name, mapping.picture_url, mapping.jersey_number].includes(h)
                ).map((h) => {
                  const on = mapping.extras.includes(h);
                  return (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setMapping({
                        ...mapping,
                        extras: on ? mapping.extras.filter(x => x !== h) : [...mapping.extras, h],
                      })}
                      style={{
                        padding: "5px 11px", borderRadius: 16, fontSize: 12,
                        background: on ? MAROON : "transparent",
                        color: on ? "white" : "#94a3b8",
                        border: `1px solid ${on ? MAROON : BORDER}`,
                        cursor: "pointer",
                      }}
                    >
                      {h}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, paddingTop: 16, borderTop: `1px solid ${BORDER}` }}>
              <button
                onClick={() => { setStep("source"); setParsed(null); setError(null); }}
                style={{ background: "transparent", color: "#94a3b8", border: `1px solid ${BORDER}`,
                  padding: "9px 18px", borderRadius: 7, cursor: "pointer", fontWeight: 600 }}
              >
                ← Back
              </button>
              <button
                onClick={doImport}
                disabled={loading}
                style={{ background: MAROON, color: "white", padding: "9px 22px",
                  borderRadius: 7, border: "none", cursor: "pointer", fontWeight: 600,
                  opacity: loading ? 0.5 : 1 }}
              >
                {loading ? "Importing…" : `Import ${parsed.rows.length} players`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
