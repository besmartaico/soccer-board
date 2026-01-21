"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { HtmlBoard, type PlacedPlayer } from "@/lib/board/HtmlBoard";

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
const BG_BUCKET = "board-backgrounds";

export default function BoardPage() {
  const router = useRouter();
  const params = useParams();

  const raw = (params as any)?.boardId;
  const boardId: string | null =
    typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : null;

  const [board, setBoard] = useState<BoardRow | null>(null);
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

  // Board state (manual save)
  const [placedPlayers, setPlacedPlayers] = useState<PlacedPlayer[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Background
  const [backgroundUrl, setBackgroundUrl] = useState<string>("");

  // Photo modal (for roster thumbnail click)
  const [photoModal, setPhotoModal] = useState<{ url: string; name: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Close dropdowns if user clicks elsewhere
  useEffect(() => {
    const onDown = () => setOpenDropdown(null);
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, []);

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

    // Google config (optional)
    const gc = row?.data?.google;
    if (gc?.sheetId && gc?.range) setGoogleConfig({ sheetId: gc.sheetId, range: gc.range });
    else setGoogleConfig(null);

    // Load placed players + background from board data (optional)
    const hb = row?.data?.htmlBoard ?? {};
    setPlacedPlayers(Array.isArray(hb.placedPlayers) ? hb.placedPlayers : []);
    setBackgroundUrl(typeof hb.backgroundUrl === "string" ? hb.backgroundUrl : "");
    setDirty(false);

    setLoading(false);
  }

  useEffect(() => {
    loadBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  async function loadPlayersFromGoogle(cfg: GoogleConfig) {
    setPlayersError(null);
    setPlayersLoading(true);
    setPlayers([]);

    try {
      const url = `/api/google/sheet?sheetId=${encodeURIComponent(cfg.sheetId)}&range=${encodeURIComponent(
        cfg.range
      )}`;

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

      const col = (name: string) => header.findIndex((h) => (h ?? "").trim() === name);

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
          const proxy = normalized ? `/api/image-proxy?url=${encodeURIComponent(normalized)}` : "";

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
      if (filters.grade.length && !filters.grade.includes((p.grade ?? "").trim())) return false;
      if (filters.returning.length && !filters.returning.includes((p.returning ?? "").trim()))
        return false;
      if (filters.primary.length && !filters.primary.includes((p.potentialPrimary ?? "").trim()))
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
      // ✅ include notes so the board modal can show them
      notes: p.notes || "",
    };

    const json = JSON.stringify(payload);
    e.dataTransfer.setData(PLAYER_DRAG_MIME, json);
    e.dataTransfer.setData("application/json", json);
    e.dataTransfer.setData("text/plain", json);
    e.dataTransfer.effectAllowed = "copy";
  }

  async function saveBoard() {
    if (!boardId) return;
    if (!board) return;

    setSaving(true);
    setError(null);

    try {
      const prevData = board?.data && typeof board.data === "object" ? board.data : {};

      const nextData = {
        ...prevData,
        google: prevData.google ?? undefined,
        htmlBoard: {
          placedPlayers: placedPlayers,
          backgroundUrl: backgroundUrl || "",
        },
      };

      const { error } = await supabase.from("boards").update({ data: nextData }).eq("id", boardId);
      if (error) throw new Error(error.message);

      setBoard({ ...board, data: nextData });
      setDirty(false);
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Failed to save board.");
    } finally {
      setSaving(false);
    }
  }

  async function onSelectBackgroundFile(file: File) {
    if (!boardId) return;

    setError(null);

    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `boards/${boardId}/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;

      const up = await supabase.storage.from(BG_BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || undefined,
      });

      if (up.error) {
        throw new Error(
          `Storage upload failed: ${up.error.message}. (Make sure bucket "${BG_BUCKET}" exists and is public.)`
        );
      }

      const pub = supabase.storage.from(BG_BUCKET).getPublicUrl(path);
      const url = pub.data.publicUrl;

      setBackgroundUrl(url);
      setDirty(true);
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Failed to upload background.");
    }
  }

  return (
    <main className="h-screen overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-white relative z-40">
        <div className="flex items-center gap-3 min-w-0">
          <div className="text-2xl font-bold truncate">{board ? board.name : "Board"}</div>

          <button
            type="button"
            className={`border px-3 py-1 rounded text-sm ${
              dirty ? "bg-gray-900 text-white" : "bg-white text-gray-700"
            }`}
            onClick={saveBoard}
            disabled={!dirty || saving}
            title={dirty ? "Save changes" : "No changes to save"}
          >
            {saving ? "Saving..." : dirty ? "Save" : "Saved"}
          </button>

          <button
            type="button"
            className="border px-3 py-1 rounded text-sm bg-white"
            onClick={() => loadBoard()}
            disabled={saving}
          >
            Reload
          </button>
        </div>

        <div className="flex items-center gap-3">
          <Link className="underline" href="/app/teams">
            Teams
          </Link>
          <Link className="underline" href="/">
            Home
          </Link>
        </div>
      </div>

      {error && <div className="px-6 py-3 text-red-600 border-b relative z-40">{error}</div>}

      {loading ? (
        <div className="p-6">Loading...</div>
      ) : (
        <div className="flex h-[calc(100vh-73px)]">
          {/* Left sidebar */}
          <aside className="w-96 shrink-0 border-r p-4 overflow-auto bg-gray-50 relative z-30">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold">Roster</div>
              <button
                type="button"
                className="border px-3 py-1 rounded text-sm bg-white"
                onClick={() => {
                  if (googleConfig) loadPlayersFromGoogle(googleConfig);
                }}
                disabled={!googleConfig || playersLoading}
                title={!googleConfig ? "No Google config on this board" : "Refresh roster"}
              >
                Refresh
              </button>
            </div>

            {/* Background upload */}
            <div className="border rounded p-3 mb-3 bg-white">
              <div className="text-xs font-semibold mb-2">Background</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="border px-3 py-1 rounded text-sm bg-white"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Upload image
                </button>
                <button
                  type="button"
                  className="border px-3 py-1 rounded text-sm bg-white"
                  onClick={() => {
                    setBackgroundUrl("");
                    setDirty(true);
                  }}
                  disabled={!backgroundUrl}
                >
                  Clear
                </button>
              </div>
              {backgroundUrl ? (
                <div className="text-xs text-gray-600 mt-2 truncate" title={backgroundUrl}>
                  {backgroundUrl}
                </div>
              ) : (
                <div className="text-xs text-gray-500 mt-2">No background</div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onSelectBackgroundFile(f);
                  e.currentTarget.value = "";
                }}
              />
            </div>

            {/* Filters */}
            <div className="border rounded p-3 mb-3 bg-white relative z-30">
              <div className="text-xs font-semibold mb-2">Filters</div>

              <input
                className="w-full border rounded px-2 py-1 text-sm mb-2"
                placeholder="Search name / notes / position"
                value={filters.search}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              />

              <DropdownMultiSelect
                label="Grade"
                options={gradeOptions.map((g) => ({ value: g, label: `Grade ${g}` }))}
                selected={filters.grade}
                open={openDropdown === "grade"}
                onOpen={(e) => {
                  e.stopPropagation();
                  setOpenDropdown((v) => (v === "grade" ? null : "grade"));
                }}
                onToggle={(v) => toggleMulti("grade", v)}
              />

              <DropdownMultiSelect
                label="Returning"
                options={returningOptions.map((r) => ({ value: r, label: r }))}
                selected={filters.returning}
                open={openDropdown === "returning"}
                onOpen={(e) => {
                  e.stopPropagation();
                  setOpenDropdown((v) => (v === "returning" ? null : "returning"));
                }}
                onToggle={(v) => toggleMulti("returning", v)}
              />

              <DropdownMultiSelect
                label="Primary"
                options={primaryOptions.map((p) => ({ value: p, label: p }))}
                selected={filters.primary}
                open={openDropdown === "primary"}
                onOpen={(e) => {
                  e.stopPropagation();
                  setOpenDropdown((v) => (v === "primary" ? null : "primary"));
                }}
                onToggle={(v) => toggleMulti("primary", v)}
              />

              <DropdownMultiSelect
                label="Likelihood"
                options={likelihoodOptions.map((l) => ({ value: l, label: l }))}
                selected={filters.likelihood}
                open={openDropdown === "likelihood"}
                onOpen={(e) => {
                  e.stopPropagation();
                  setOpenDropdown((v) => (v === "likelihood" ? null : "likelihood"));
                }}
                onToggle={(v) => toggleMulti("likelihood", v)}
              />

              <button
                type="button"
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

            {!playersLoading && !playersError && players.length > 0 && (
              <div className="text-xs text-gray-600 mb-2">
                Showing {filteredPlayers.length} of {players.length}
              </div>
            )}

            {!playersLoading && !playersError && filteredPlayers.length > 0 && (
              <div className="space-y-2">
                {filteredPlayers.map((p, idx) => (
                  <div
                    key={`${p.id || "noid"}-${p.name || "noname"}-${idx}`}
                    className="border rounded bg-white cursor-grab active:cursor-grabbing"
                    draggable
                    onDragStart={(e) => onPlayerDragStart(e, p)}
                  >
                    <div className="p-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="w-12 h-12 rounded overflow-hidden bg-gray-200 flex-shrink-0 border"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (p.pictureProxyUrl) {
                              const u = `${p.pictureProxyUrl}${
                                p.pictureProxyUrl.includes("?") ? "&" : "?"
                              }ts=${Date.now()}`;
                              setPhotoModal({ url: u, name: p.name });
                            }
                          }}
                          draggable={false}
                          title="Click to enlarge"
                        >
                          {p.pictureProxyUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={p.pictureProxyUrl}
                              alt={`${p.name} photo`}
                              width={48}
                              height={48}
                              style={{ width: 48, height: 48, objectFit: "cover" }}
                              draggable={false}
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
                  </div>
                ))}
              </div>
            )}
          </aside>

          {/* Board */}
          <section className="flex-1 relative z-0 overflow-hidden">
            <HtmlBoard
              editMode={true}
              placed={placedPlayers}
              onPlacedChange={(next) => {
                setPlacedPlayers(next);
                setDirty(true);
              }}
              dragMime={PLAYER_DRAG_MIME}
              backgroundUrl={backgroundUrl || undefined}
            />
          </section>
        </div>
      )}

      {/* Sticky Save (backup, always visible) */}
      <div className="fixed bottom-4 right-4 z-[1000]">
        <button
          type="button"
          className={`border px-4 py-2 rounded shadow bg-white text-sm ${
            dirty ? "font-semibold" : "opacity-70"
          }`}
          onClick={saveBoard}
          disabled={!dirty || saving}
        >
          {saving ? "Saving..." : dirty ? "Save" : "Saved"}
        </button>
      </div>

      {/* Photo modal (roster image click) */}
      {photoModal ? (
        <div
          className="fixed inset-0 z-[999] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPhotoModal(null)}
        >
          <div className="w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-white font-semibold truncate">{photoModal.name}</div>
              <button
                type="button"
                className="text-white underline text-sm"
                onClick={() => setPhotoModal(null)}
              >
                Close
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoModal.url}
              alt={`${photoModal.name} large`}
              className="w-full max-h-[80vh] object-contain rounded-lg bg-black"
            />
          </div>
        </div>
      ) : null}
    </main>
  );
}

/** Dropdown multi-select */
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
  onOpen: (e: React.MouseEvent) => void;
  onToggle: (value: string) => void;
}) {
  const selectedCount = selected.length;

  return (
    <div className="mb-2 relative">
      <button
        type="button"
        className="w-full border rounded px-2 py-1 text-sm flex items-center justify-between bg-white"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={onOpen}
      >
        <span>
          {label}
          {selectedCount ? ` (${selectedCount})` : ""}
        </span>
        <span className="text-gray-500">{open ? "▲" : "▼"}</span>
      </button>

      {open ? (
        <div
          className="mt-1 w-full bg-white border rounded shadow p-2 max-h-56 overflow-auto relative z-40"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
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

/**
 * Normalize Google Drive links into a "direct-ish" image URL.
 * Handles:
 * - https://drive.google.com/file/d/<ID>/view...
 * - https://drive.google.com/thumbnail?id=<ID>&sz=w1000
 * - malformed: https://drive.google.com/thumbnail?id=<ID>=w1000  (we extract the ID)
 * - ...?id=<ID> patterns
 */
function normalizePictureUrl(raw: string) {
  const s = (raw ?? "").trim();
  if (!s) return "";

  try {
    const u = new URL(s);

    // /file/d/<id>/
    const m = u.pathname.match(/\/file\/d\/([^/]+)/);
    if (m && m[1]) return `https://drive.google.com/uc?export=view&id=${m[1]}`;

    // /thumbnail?id=...
    if (u.hostname === "drive.google.com" && u.pathname === "/thumbnail") {
      let id = u.searchParams.get("id") ?? "";
      // Handle malformed: id=<ID>=w1000
      if (id.includes("=") && !id.includes("%3D")) {
        id = id.split("=")[0];
      }
      if (id) {
        // thumbnail works well for images; keep it but fix sz if missing
        const sz = u.searchParams.get("sz") || "w1000";
        return `https://drive.google.com/thumbnail?id=${id}&sz=${encodeURIComponent(sz)}`;
      }
    }

    // ?id=<id>
    const idParam = u.searchParams.get("id");
    if (idParam) {
      const id = idParam.includes("=") ? idParam.split("=")[0] : idParam;
      return `https://drive.google.com/uc?export=view&id=${id}`;
    }

    return u.toString();
  } catch {
    return "";
  }
}
