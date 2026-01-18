"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import {
  Tldraw,
  createTLStore,
  defaultShapeUtils,
  type TLStoreSnapshot,
} from "tldraw";

import { PlayerCardShapeUtil } from "@/lib/tldraw/PlayerCardShapeUtil";

type BoardRow = {
  id: string;
  team_id: string;
  name: string;
  data: any;
  created_at: string;
};

type GoogleConfig = {
  sheetId: string;
  range: string;
};

type PlayerRow = {
  id: string;
  name: string;
  grade: string;
  position: string;
  secondaryPosition: string;
  returning: string;
  likelihoodPrimary: string;
  potentialPrimary: string;
  notes: string;
  picture: string;
  pictureProxyUrl?: string;
};

type Filters = {
  search: string;
  grade: string[];
  returning: string[];
  primary: string[];
  likelihood: string[];
};

const PLAYER_DRAG_MIME = "application/x-soccerboard-player";
const FALLBACK_TEXT_MIME = "text/plain";

export default function BoardPage() {
  const router = useRouter();
  const params = useParams();

  const raw = (params as any)?.boardId;
  const boardId: string | null =
    typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : null;

  const [board, setBoard] = useState<BoardRow | null>(null);
  const [editMode, setEditMode] = useState(true);
  const [hideUi, setHideUi] = useState(false);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Google player data
  const [googleConfig, setGoogleConfig] = useState<GoogleConfig | null>(null);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [playersError, setPlayersError] = useState<string | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);

  // Filters
  const [filters, setFilters] = useState<Filters>({
    search: "",
    grade: [],
    returning: [],
    primary: [],
    likelihood: [],
  });

  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // Image preview modal
  const [preview, setPreview] = useState<{ url: string; name?: string } | null>(
    null
  );

  // Store + editor ref
  const makeStore = () =>
    createTLStore({
      shapeUtils: [...defaultShapeUtils, PlayerCardShapeUtil],
    });

  const [store, setStore] = useState(() => makeStore());
  const editorRef = useRef<any>(null);

  const saveTimer = useRef<number | null>(null);

  // listen for image preview events from the canvas shape
  useEffect(() => {
    const handler = (e: any) => {
      if (!e?.detail?.url) return;
      setPreview({ url: e.detail.url, name: e.detail.name });
    };
    window.addEventListener("playerImagePreview", handler as any);
    return () =>
      window.removeEventListener("playerImagePreview", handler as any);
  }, []);

  // Keep TLDraw in sync with editMode
  useEffect(() => {
    const editor = editorRef.current;
    if (editor && typeof editor.updateInstanceState === "function") {
      editor.updateInstanceState({ isReadonly: !editMode });
    }
  }, [editMode]);

  // --------- tldraw snapshot helpers ---------
  const getStoreSnapshotSafe = (s: any): TLStoreSnapshot => {
    if (typeof s?.getSnapshot === "function") return s.getSnapshot();
    if (typeof s?.getStoreSnapshot === "function") return s.getStoreSnapshot();
    if (typeof s?.serialize === "function") return s.serialize();
    throw new Error("This version of tldraw store does not support snapshots.");
  };

  const loadStoreSnapshotSafe = (s: any, snap: any) => {
    if (!snap) return;
    if (typeof s?.loadSnapshot === "function") {
      s.loadSnapshot(snap);
      return;
    }
    console.warn("Store does not support loadSnapshot().");
  };

  async function persistBoardSnapshot(snapshot: TLStoreSnapshot) {
    if (!boardId) return;

    const nextData = {
      ...(board?.data && typeof board.data === "object" ? board.data : {}),
      snapshot,
    };

    const { error } = await supabase
      .from("boards")
      .update({ data: nextData })
      .eq("id", boardId);

    if (error) setError(error.message);
    if (board) setBoard({ ...board, data: nextData });
  }

  function scheduleAutosave() {
    if (!boardId) return;

    if (saveTimer.current) window.clearTimeout(saveTimer.current);

    saveTimer.current = window.setTimeout(async () => {
      try {
        const snap = getStoreSnapshotSafe(store as any);
        await persistBoardSnapshot(snap);
      } catch (e: any) {
        console.error(e);
        setError(e?.message ?? "Failed to autosave.");
      }
    }, 800);
  }

  async function loadBoard() {
    setLoading(true);
    setError(null);

    if (!boardId) {
      setError("Missing board id in URL.");
      setLoading(false);
      return;
    }

    const { data: userResp } = await supabase.auth.getUser();
    if (!userResp.user) {
      router.push("/login");
      return;
    }

    const { data, error } = await supabase
      .from("boards")
      .select("id,team_id,name,data,created_at")
      .eq("id", boardId)
      .single();

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    const row = data as BoardRow;
    setBoard(row);

    const gc = row?.data?.google;
    if (gc?.sheetId && gc?.range)
      setGoogleConfig({ sheetId: gc.sheetId, range: gc.range });
    else setGoogleConfig(null);

    const nextStore = makeStore();
    const snap = row?.data?.snapshot;

    try {
      if (snap) loadStoreSnapshotSafe(nextStore as any, snap);
      setStore(nextStore);
    } catch (e: any) {
      console.error(e);
      setError("Failed to load board snapshot (starting blank).");
      setStore(nextStore);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  // --------- load players when googleConfig is available ---------
  async function loadPlayersFromGoogle(cfg: GoogleConfig) {
    setPlayersError(null);
    setPlayersLoading(true);
    setPlayers([]);

    try {
      const url =
        `/api/google/sheet?sheetId=${encodeURIComponent(cfg.sheetId)}` +
        `&range=${encodeURIComponent(cfg.range)}` +
        `&ts=${Date.now()}`;

      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.error ?? "Failed to load player sheet");
      }

      const values: string[][] = json.values ?? [];
      if (values.length === 0) {
        setPlayers([]);
        return;
      }

      const header = values[0];
      const rows = values.slice(1);

      const col = (name: string) =>
        header.findIndex((h) => (h ?? "").trim() === name);

      const idxId = col("ID");
      const idxName = col("Student Name");
      const idxGrade = col("Grade");
      const idxPicture = col("Picture");
      const idxReturning = col("Returning Player");
      const idxPos = col("Position");
      const idxSecPos = col("Secondary Position");
      const idxPotentialPrimary = col("Potential Team Primary");
      const idxLikelihoodPrimary = col("Likelihood Primary");
      const idxNotes = col("Jeff's Notes");

      const parsed: PlayerRow[] = rows
        .filter((r) => r && r.length > 0 && (r[idxName] ?? "").trim() !== "")
        .map((r) => {
          const rawPic = (r[idxPicture] ?? "").toString();
          const normalized = normalizePictureUrl(rawPic);

          const proxy = normalized
            ? `/api/image-proxy?url=${encodeURIComponent(normalized)}&ts=${Date.now()}`
            : "";

          return {
            id: (r[idxId] ?? "").toString(),
            name: (r[idxName] ?? "").toString(),
            grade: (r[idxGrade] ?? "").toString(),
            picture: rawPic,
            pictureProxyUrl: proxy || undefined,
            returning: (r[idxReturning] ?? "").toString(),
            position: (r[idxPos] ?? "").toString(),
            secondaryPosition: (r[idxSecPos] ?? "").toString(),
            potentialPrimary: (r[idxPotentialPrimary] ?? "").toString(),
            likelihoodPrimary: (r[idxLikelihoodPrimary] ?? "").toString(),
            notes: (r[idxNotes] ?? "").toString(),
          };
        });

      setPlayers(parsed);
    } catch (e: any) {
      console.error(e);
      setPlayersError(e?.message ?? "Failed to load players");
    } finally {
      setPlayersLoading(false);
    }
  }

  useEffect(() => {
    if (!googleConfig) return;
    loadPlayersFromGoogle(googleConfig);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleConfig?.sheetId, googleConfig?.range]);

  // ----- options for dropdowns -----
  const gradeOptions = useMemo(
    () =>
      uniq(players.map((p) => (p.grade ?? "").trim())).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true })
      ),
    [players]
  );
  const returningOptions = useMemo(
    () => uniq(players.map((p) => (p.returning ?? "").trim())).sort(),
    [players]
  );
  const primaryOptions = useMemo(
    () => uniq(players.map((p) => (p.potentialPrimary ?? "").trim())).sort(),
    [players]
  );
  const likelihoodOptions = useMemo(
    () =>
      uniq(players.map((p) => (p.likelihoodPrimary ?? "").trim())).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true })
      ),
    [players]
  );

  const filteredPlayers = useMemo(() => {
    const s = filters.search.trim().toLowerCase();
    return players.filter((p) => {
      if (s) {
        const hay = `${p.name} ${p.position} ${p.secondaryPosition} ${p.notes}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (filters.grade.length && !filters.grade.includes((p.grade ?? "").trim()))
        return false;
      if (
        filters.returning.length &&
        !filters.returning.includes((p.returning ?? "").trim())
      )
        return false;
      if (
        filters.primary.length &&
        !filters.primary.includes((p.potentialPrimary ?? "").trim())
      )
        return false;
      if (
        filters.likelihood.length &&
        !filters.likelihood.includes((p.likelihoodPrimary ?? "").trim())
      )
        return false;
      return true;
    });
  }, [players, filters]);

  function toggleMulti(key: keyof Omit<Filters, "search">, value: string) {
    setFilters((f) => {
      const set = new Set(f[key]);
      if (set.has(value)) set.delete(value);
      else set.add(value);
      return { ...f, [key]: Array.from(set) as any };
    });
  }

  // =========================
  // DRAG / DROP (FIXED)
  // =========================
  function onPlayerDragStart(e: React.DragEvent, p: PlayerRow) {
    const payload = {
      id: p.id,
      name: p.name,
      grade: p.grade,
      returning: p.returning,
      primary: p.potentialPrimary,
      likelihood: p.likelihoodPrimary,
      pos1: p.position,
      pos2: p.secondaryPosition,
      pictureUrl: p.pictureProxyUrl || "",
      notes: p.notes || "",
    };

    const json = JSON.stringify(payload);

    // ✅ set both custom + text/plain for cross-browser reliability
    e.dataTransfer.setData(PLAYER_DRAG_MIME, json);
    e.dataTransfer.setData(FALLBACK_TEXT_MIME, json);

    e.dataTransfer.effectAllowed = "copy";
  }

  function extractPlayerPayload(dt: DataTransfer): any | null {
    const rawCustom = dt.getData(PLAYER_DRAG_MIME);
    const rawPlain = dt.getData(FALLBACK_TEXT_MIME);
    const raw = rawCustom || rawPlain;
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed?.name) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function onCanvasDragOverCapture(e: React.DragEvent) {
    if (!editMode) return;

    // ✅ Always preventDefault if payload is present (don’t trust types[])
    const payload = extractPlayerPayload(e.dataTransfer);
    if (payload) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }

  function onCanvasDropCapture(e: React.DragEvent) {
    if (!editMode) return;

    const data = extractPlayerPayload(e.dataTransfer);
    if (!data) return;

    e.preventDefault();

    const editor = editorRef.current;
    if (!editor) return;

    let pt: any = { x: 0, y: 0 };
    try {
      if (typeof editor.screenToPage === "function") {
        pt = editor.screenToPage({ x: e.clientX, y: e.clientY });
      } else if (editor.inputs?.currentPagePoint) {
        pt = editor.inputs.currentPagePoint;
      }
    } catch {}

    editor.createShape({
      type: "player-card",
      x: pt.x,
      y: pt.y,
      props: {
        w: 280,
        h: 96,
        playerId: data.id ?? "",
        name: data.name ?? "Player",
        grade: data.grade ?? "",
        returning: data.returning ?? "",
        primary: data.primary ?? "",
        likelihood: data.likelihood ?? "",
        pos1: data.pos1 ?? "",
        pos2: data.pos2 ?? "",
        pictureUrl: data.pictureUrl ?? "",
        notes: data.notes ?? "",
      },
    });

    scheduleAutosave();
  }

  return (
    <main className="h-[calc(100vh-0px)]">
      {/* Image modal */}
      {preview ? (
        <div
          className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center p-6"
          onClick={() => setPreview(null)}
        >
          <div
            className="bg-white rounded-xl overflow-hidden max-w-3xl w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3 border-b flex items-center justify-between">
              <div className="font-semibold">
                {preview.name || "Player Photo"}
              </div>
              <button className="text-sm underline" onClick={() => setPreview(null)}>
                Close
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview.url} alt={preview.name || "Player photo"} className="w-full h-auto" />
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="text-2xl font-bold">{board ? board.name : "Board"}</div>

        <div className="flex items-center gap-4">
          <button className="border px-3 py-1 rounded" onClick={() => setEditMode((v) => !v)}>
            {editMode ? "Switch to View" : "Switch to Edit"}
          </button>

          <button className="border px-3 py-1 rounded" onClick={() => setHideUi((v) => !v)}>
            {hideUi ? "Show Tools" : "Hide Tools"}
          </button>

          <Link className="underline" href="/app/teams">
            Teams
          </Link>
          <Link className="underline" href="/">
            Home
          </Link>
        </div>
      </div>

      {error && <div className="px-6 py-3 text-red-600 border-b">{error}</div>}

      {loading ? (
        <div className="p-6">Loading...</div>
      ) : (
        <div className="flex h-[calc(100vh-73px)]">
          {/* Sidebar (collapsible) */}
          {!sidebarCollapsed ? (
            <aside className="w-96 border-r p-4 overflow-auto">
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold">Roster</div>
                <div className="flex items-center gap-2">
                  <button
                    className="text-xs border rounded px-2 py-1"
                    disabled={!googleConfig || playersLoading}
                    onClick={() => {
                      if (googleConfig) loadPlayersFromGoogle(googleConfig);
                    }}
                  >
                    Refresh
                  </button>
                  <button
                    className="text-xs border rounded px-2 py-1"
                    onClick={() => setSidebarCollapsed(true)}
                    title="Collapse roster panel"
                  >
                    Collapse
                  </button>
                </div>
              </div>

              {/* Filters */}
              <div className="border rounded p-3 mb-3 bg-white">
                <div className="text-xs font-semibold mb-2">Filters</div>

                <input
                  className="w-full border rounded px-2 py-1 text-sm mb-2"
                  placeholder="Search name / notes / position"
                  value={filters.search}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, search: e.target.value }))
                  }
                />

                <DropdownMultiSelect
                  label="Grade"
                  options={gradeOptions.map((g) => ({ value: g, label: `Grade ${g}` }))}
                  selected={filters.grade}
                  open={openDropdown === "grade"}
                  onOpen={() => setOpenDropdown((v) => (v === "grade" ? null : "grade"))}
                  onToggle={(v) => toggleMulti("grade", v)}
                />

                <DropdownMultiSelect
                  label="Returning"
                  options={returningOptions.map((r) => ({ value: r, label: r }))}
                  selected={filters.returning}
                  open={openDropdown === "returning"}
                  onOpen={() => setOpenDropdown((v) => (v === "returning" ? null : "returning"))}
                  onToggle={(v) => toggleMulti("returning", v)}
                />

                <DropdownMultiSelect
                  label="Primary"
                  options={primaryOptions.map((p) => ({ value: p, label: p }))}
                  selected={filters.primary}
                  open={openDropdown === "primary"}
                  onOpen={() => setOpenDropdown((v) => (v === "primary" ? null : "primary"))}
                  onToggle={(v) => toggleMulti("primary", v)}
                />

                <DropdownMultiSelect
                  label="Likelihood"
                  options={likelihoodOptions.map((l) => ({ value: l, label: l }))}
                  selected={filters.likelihood}
                  open={openDropdown === "likelihood"}
                  onOpen={() => setOpenDropdown((v) => (v === "likelihood" ? null : "likelihood"))}
                  onToggle={(v) => toggleMulti("likelihood", v)}
                />

                <button
                  className="text-xs underline text-gray-600 mt-2"
                  onClick={() =>
                    setFilters({ search: "", grade: [], returning: [], primary: [], likelihood: [] })
                  }
                >
                  Clear filters
                </button>
              </div>

              {playersLoading && <div className="text-sm">Loading players…</div>}
              {playersError && <div className="text-sm text-red-600">{playersError}</div>}

              {!playersLoading && !playersError && filteredPlayers.length > 0 && (
                <div className="space-y-2">
                  {filteredPlayers.map((p, idx) => (
                    <div
                      key={`${p.id || "noid"}-${p.name || "noname"}-${idx}`}
                      className="border rounded p-2 bg-white cursor-grab active:cursor-grabbing"
                      draggable
                      onDragStart={(e) => onPlayerDragStart(e, p)}
                      title={editMode ? "Drag onto the board" : "Switch to Edit to place players"}
                    >
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="w-12 h-12 rounded overflow-hidden bg-gray-200 flex-shrink-0"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (p.pictureProxyUrl) setPreview({ url: p.pictureProxyUrl, name: p.name });
                          }}
                          title={p.pictureProxyUrl ? "Click to enlarge" : "No photo"}
                          style={{ cursor: p.pictureProxyUrl ? "zoom-in" : "default" }}
                        >
                          {p.pictureProxyUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={p.pictureProxyUrl}
                              alt={`${p.name} photo`}
                              className="w-full h-full object-cover"
                              onError={(e) =>
                                ((e.currentTarget as HTMLImageElement).style.display = "none")
                              }
                            />
                          ) : null}
                        </button>

                        <div className="min-w-0">
                          <div className="font-medium truncate">{p.name}</div>
                          <div className="text-xs text-gray-700">
                            Grade: {p.grade || "?"} • Pos: {p.position || "?"}
                            {p.secondaryPosition ? ` / ${p.secondaryPosition}` : ""} • Returning:{" "}
                            {p.returning || "?"}
                          </div>
                          <div className="text-xs text-gray-700">
                            Primary: {p.potentialPrimary || "?"} • Likelihood:{" "}
                            {p.likelihoodPrimary || "?"}
                          </div>
                        </div>
                      </div>

                      {p.notes ? <div className="text-xs text-gray-600 mt-1">{p.notes}</div> : null}
                    </div>
                  ))}
                </div>
              )}
            </aside>
          ) : (
            <aside className="w-10 border-r flex flex-col items-center py-3 gap-2">
              <button
                className="border rounded px-2 py-1 text-xs"
                onClick={() => setSidebarCollapsed(false)}
                title="Expand roster panel"
              >
                ≡
              </button>
            </aside>
          )}

          {/* Canvas */}
          <section
            className="flex-1"
            onDragOverCapture={onCanvasDragOverCapture}
            onDropCapture={onCanvasDropCapture}
          >
            <Tldraw
              store={store}
              shapeUtils={[...defaultShapeUtils, PlayerCardShapeUtil]}
              hideUi={hideUi}
              onMount={(editor) => {
                editorRef.current = editor;
                editor.updateInstanceState({ isReadonly: !editMode });
              }}
              onUiEvent={() => scheduleAutosave()}
            />
          </section>
        </div>
      )}
    </main>
  );
}

/** Dropdown multi-select (inline, reliable inside scroll containers) */
function DropdownMultiSelect({
  label,
  options,
  selected,
  open,
  onOpen,
  onToggle,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  open: boolean;
  onOpen: () => void;
  onToggle: (value: string) => void;
}) {
  const selectedCount = selected.length;

  return (
    <div className="mb-2">
      <button
        type="button"
        className="w-full border rounded px-2 py-1 text-sm flex items-center justify-between"
        onClick={onOpen}
      >
        <span>
          {label}
          {selectedCount ? ` (${selectedCount})` : ""}
        </span>
        <span className="text-gray-500">{open ? "▲" : "▼"}</span>
      </button>

      {open ? (
        <div className="mt-1 w-full bg-white border rounded shadow p-2 max-h-56 overflow-auto">
          {options.length === 0 ? (
            <div className="text-xs text-gray-500">No options</div>
          ) : (
            <div className="space-y-1">
              {options.map((o) => (
                <label key={o.value} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.includes(o.value)}
                    onChange={() => onToggle(o.value)}
                  />
                  <span>{o.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function uniq(arr: string[]) {
  const out: string[] = [];
  const set = new Set<string>();
  for (const a of arr) {
    const v = (a ?? "").trim();
    if (!v) continue;
    if (set.has(v)) continue;
    set.add(v);
    out.push(v);
  }
  return out;
}

// ====== KEY FIX FOR PHOTOS ======
// Extract Drive file id robustly and avoid polluted IDs like "...=w1000"
function extractDriveId(raw: string): string | "" {
  const s = (raw ?? "").trim();
  if (!s) return "";

  // direct regex fallback (handles weird strings / not valid URLs)
  const m1 = s.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (m1?.[1]) return m1[1];

  // handle /file/d/<id>/
  const m2 = s.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/);
  if (m2?.[1]) return m2[1];

  // some sheets accidentally build "...id=<id>=w1000"
  const m3 = s.match(/[?&]id=([a-zA-Z0-9_-]{10,})=/);
  if (m3?.[1]) return m3[1];

  return "";
}

function normalizePictureUrl(raw: string) {
  const s = (raw ?? "").trim();
  if (!s) return "";

  const id = extractDriveId(s);
  if (id) {
    // Prefer thumbnail endpoint (works better than uc?export=view for images)
    return `https://drive.google.com/thumbnail?id=${id}&sz=w1000`;
  }

  // If it's already a normal URL, keep it
  try {
    const u = new URL(s);
    return u.toString();
  } catch {
    return "";
  }
}
