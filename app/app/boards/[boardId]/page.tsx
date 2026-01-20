"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import dynamic from "next/dynamic";
import type { PlacedPlayer } from "@/lib/konva/BoardCanvas";

const BoardCanvas = dynamic(
  () => import("@/lib/konva/BoardCanvas").then((m) => m.BoardCanvas),
  { ssr: false }
);

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

export default function BoardPage() {
  const router = useRouter();
  const params = useParams();

  const raw = (params as any)?.boardId;
  const boardId: string | null =
    typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : null;

  const [board, setBoard] = useState<BoardRow | null>(null);
  const [editMode, setEditMode] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Google player data
  const [googleConfig, setGoogleConfig] = useState<GoogleConfig | null>(null);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [playersError, setPlayersError] = useState<string | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);

  // Filters (dropdown multi-select)
  const [filters, setFilters] = useState<Filters>({
    search: "",
    grade: [],
    returning: [],
    primary: [],
    likelihood: [],
  });
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // Canvas state (persisted)
  const [placedPlayers, setPlacedPlayers] = useState<PlacedPlayer[]>([]);
  const [backgroundUrl, setBackgroundUrl] = useState<string>("");

  const saveTimer = useRef<number | null>(null);

  function scheduleAutosave(nextPlaced?: PlacedPlayer[], nextBg?: string) {
    if (!boardId) return;

    if (saveTimer.current) window.clearTimeout(saveTimer.current);

    saveTimer.current = window.setTimeout(async () => {
      try {
        await persistBoardData({
          placedPlayers: nextPlaced ?? placedPlayers,
          backgroundUrl: typeof nextBg === "string" ? nextBg : backgroundUrl,
        });
      } catch (e: any) {
        console.error(e);
        setError(e?.message ?? "Failed to autosave.");
      }
    }, 600);
  }

  async function persistBoardData(patch: {
    placedPlayers?: PlacedPlayer[];
    backgroundUrl?: string;
  }) {
    if (!boardId) return;

    const prevData =
      board?.data && typeof board.data === "object" ? board.data : {};

    const nextData = {
      ...prevData,
      konva: {
        ...(prevData.konva ?? {}),
        placedPlayers:
          patch.placedPlayers ?? prevData?.konva?.placedPlayers ?? [],
        backgroundUrl:
          typeof patch.backgroundUrl === "string"
            ? patch.backgroundUrl
            : prevData?.konva?.backgroundUrl ?? "",
      },
    };

    const { error } = await supabase
      .from("boards")
      .update({ data: nextData })
      .eq("id", boardId);

    if (error) throw new Error(error.message);

    if (board) setBoard({ ...board, data: nextData });
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
    if (gc?.sheetId && gc?.range) {
      setGoogleConfig({ sheetId: gc.sheetId, range: gc.range });
    } else {
      setGoogleConfig(null);
    }

    // Load konva state
    const konva = row?.data?.konva ?? {};
    setPlacedPlayers(Array.isArray(konva.placedPlayers) ? konva.placedPlayers : []);
    setBackgroundUrl(typeof konva.backgroundUrl === "string" ? konva.backgroundUrl : "");

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
      const url = `/api/google/sheet?sheetId=${encodeURIComponent(
        cfg.sheetId
      )}&range=${encodeURIComponent(cfg.range)}`;

      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json();

      if (!res.ok || !json?.success) {
        throw new Error(json?.error ?? "Failed to load player sheet");
      }

      const values: string[][] = json.values ?? [];
      if (values.length === 0) {
        setPlayers([]);
        setPlayersLoading(false);
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

          // Add cache buster so new photos appear in prod
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

  // ----- drag payload -----
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
    };

    const json = JSON.stringify(payload);

    // IMPORTANT: Safari / prod browsers need text/plain too
    e.dataTransfer.setData(PLAYER_DRAG_MIME, json);
    e.dataTransfer.setData("text/plain", json);
    e.dataTransfer.effectAllowed = "copy";
  }

  return (
    <main className="h-[calc(100vh-0px)]">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="text-2xl font-bold">{board ? board.name : "Board"}</div>

        <div className="flex items-center gap-3">
          <button
            className="border px-3 py-1 rounded"
            onClick={() => setEditMode((v) => !v)}
          >
            {editMode ? "Switch to View" : "Switch to Edit"}
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
          {/* Sidebar */}
          {!sidebarCollapsed ? (
            <aside className="w-96 border-r p-4 overflow-auto">
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold">Roster</div>
                <div className="flex items-center gap-2">
                  <button
                    className="border px-3 py-1 rounded text-sm"
                    onClick={() => {
                      if (googleConfig) loadPlayersFromGoogle(googleConfig);
                    }}
                    disabled={!googleConfig || playersLoading}
                    title={!googleConfig ? "No Google config on this board" : "Refresh roster"}
                  >
                    Refresh
                  </button>

                  <button
                    className="border px-3 py-1 rounded text-sm"
                    onClick={() => setSidebarCollapsed(true)}
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
                  options={gradeOptions.map((g) => ({
                    value: g,
                    label: `Grade ${g}`,
                  }))}
                  selected={filters.grade}
                  open={openDropdown === "grade"}
                  onOpen={() =>
                    setOpenDropdown((v) => (v === "grade" ? null : "grade"))
                  }
                  onToggle={(v) => toggleMulti("grade", v)}
                />

                <DropdownMultiSelect
                  label="Returning"
                  options={returningOptions.map((r) => ({
                    value: r,
                    label: r,
                  }))}
                  selected={filters.returning}
                  open={openDropdown === "returning"}
                  onOpen={() =>
                    setOpenDropdown((v) =>
                      v === "returning" ? null : "returning"
                    )
                  }
                  onToggle={(v) => toggleMulti("returning", v)}
                />

                <DropdownMultiSelect
                  label="Primary"
                  options={primaryOptions.map((p) => ({
                    value: p,
                    label: p,
                  }))}
                  selected={filters.primary}
                  open={openDropdown === "primary"}
                  onOpen={() =>
                    setOpenDropdown((v) => (v === "primary" ? null : "primary"))
                  }
                  onToggle={(v) => toggleMulti("primary", v)}
                />

                <DropdownMultiSelect
                  label="Likelihood"
                  options={likelihoodOptions.map((l) => ({
                    value: l,
                    label: l,
                  }))}
                  selected={filters.likelihood}
                  open={openDropdown === "likelihood"}
                  onOpen={() =>
                    setOpenDropdown((v) =>
                      v === "likelihood" ? null : "likelihood"
                    )
                  }
                  onToggle={(v) => toggleMulti("likelihood", v)}
                />

                <button
                  className="text-xs underline text-gray-600 mt-2"
                  onClick={() =>
                    setFilters({
                      search: "",
                      grade: [],
                      returning: [],
                      primary: [],
                      likelihood: [],
                    })
                  }
                >
                  Clear filters
                </button>
              </div>

              {playersLoading && <div className="text-sm">Loading players…</div>}
              {playersError && (
                <div className="text-sm text-red-600">{playersError}</div>
              )}

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
                      className="border rounded p-2 bg-white cursor-grab active:cursor-grabbing"
                      draggable={editMode}
                      onDragStart={(e) => onPlayerDragStart(e, p)}
                      title={
                        editMode
                          ? "Drag onto the board"
                          : "Switch to Edit to place players"
                      }
                    >
                      <div className="flex gap-2">
                        <div className="w-12 h-12 rounded overflow-hidden bg-gray-200 flex-shrink-0">
                          {p.pictureProxyUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={p.pictureProxyUrl}
                              alt={`${p.name} photo`}
                              className="w-full h-full object-cover"
                              onError={(e) =>
                                ((e.currentTarget as HTMLImageElement).style.display =
                                  "none")
                              }
                            />
                          ) : null}
                        </div>

                        <div className="min-w-0">
                          <div className="font-medium truncate">{p.name}</div>
                          <div className="text-xs text-gray-700">
                            Grade: {p.grade || "?"} • Pos: {p.position || "?"}
                            {p.secondaryPosition
                              ? ` / ${p.secondaryPosition}`
                              : ""}{" "}
                            • Returning: {p.returning || "?"}
                          </div>
                          <div className="text-xs text-gray-700">
                            Primary: {p.potentialPrimary || "?"} • Likelihood:{" "}
                            {p.likelihoodPrimary || "?"}
                          </div>
                        </div>
                      </div>

                      {p.notes ? (
                        <div className="text-xs text-gray-600 mt-1">{p.notes}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </aside>
          ) : (
            <aside className="w-10 border-r flex flex-col items-center py-2">
              <button
                className="border rounded px-2 py-1 text-xs"
                onClick={() => setSidebarCollapsed(false)}
                title="Expand sidebar"
              >
                &gt;
              </button>
            </aside>
          )}

          {/* Canvas */}
          <section className="flex-1 relative">
            <BoardCanvas
              editMode={editMode}
              placed={placedPlayers}
              onPlacedChange={(next) => {
                setPlacedPlayers(next);
                scheduleAutosave(next, undefined);
              }}
              backgroundUrl={backgroundUrl}
              onBackgroundUrlChange={(url) => {
                setBackgroundUrl(url);
                scheduleAutosave(undefined, url);
              }}
              dragMime={PLAYER_DRAG_MIME}
            />
          </section>
        </div>
      )}
    </main>
  );
}

/** Dropdown multi-select (checkboxes inside a dropdown) */
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
    <div className="relative mb-2">
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
        <div className="absolute z-50 mt-1 w-full bg-white border rounded shadow p-2 max-h-56 overflow-auto">
          {options.length === 0 ? (
            <div className="text-xs text-gray-500">No options</div>
          ) : (
            <div className="space-y-1">
              {options.map((o) => (
                <label
                  key={o.value}
                  className="flex items-center gap-2 text-sm cursor-pointer"
                >
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

function normalizePictureUrl(raw: string) {
  const s = (raw ?? "").trim();
  if (!s) return "";

  try {
    const u = new URL(s);

    // drive file link: /file/d/<id>/
    const m = u.pathname.match(/\/file\/d\/([^/]+)/);
    if (m && m[1])
      return `https://drive.google.com/uc?export=view&id=${m[1]}`;

    // open?id=<id>
    const idParam = u.searchParams.get("id");
    if (idParam) return `https://drive.google.com/uc?export=view&id=${idParam}`;

    return u.toString();
  } catch {
    return "";
  }
}
