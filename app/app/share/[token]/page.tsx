"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { HtmlBoard, type PlacedPlayer, type BoardObject, type BoardTool } from "@/lib/board/HtmlBoard";



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
const OBJECT_DRAG_MIME = "application/x-soccerboard-object";
const BG_BUCKET = "board-backgrounds";



export default function SharePage({ params }: { params: Promise<{ token: string }> }) {
  // Share-specific state
  const [token, setToken] = useState("");
  const [shareMode, setShareMode] = useState<"view" | "edit">("view");
  const [pageStatus, setPageStatus] = useState<"loading" | "password" | "ready" | "error">("loading");
  const [pageError, setPageError] = useState("");
  const [sharePassword, setSharePassword] = useState("");
  const [sharedBoardId, setSharedBoardId] = useState("");


    typeof sharedBoardId === "string" ? sharedBoardId : Array.isArray(sharedBoardId) ? sharedBoardId[0] : null;


  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [myRole, setMyRole] = useState<UserRole>("viewer");
  const [editMode, setEditMode] = useState<boolean>(false);
  const [objectsLocked, setObjectsLocked] = useState<boolean>(true);

  // canEdit defined below based on shareMode
  const isAdmin = myRole === "admin";

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
  const [boardObjects, setBoardObjects] = useState<BoardObject[]>([]);
  const [tool, setTool] = useState<BoardTool>("select");
  const [cardSizeMode, setCardSizeMode] = useState<"large" | "medium" | "small">("large");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Background
  const [backgroundUrl, setBackgroundUrl] = useState<string>("");

  // Sharing
  const [shareLinkMode, setShareLinkMode] = useState<"view"|"edit">("view");
  const [shareLinkPassword, setShareLinkPassword] = useState("");
  const [shareLinkUrl, setShareLinkUrl] = useState("");
  const [shareLinkLoading, setShareLinkLoading] = useState(false);
  const [linkMode, setLinkMode] = useState<"view"|"edit">("view");
  const [linkPassword, setLinkPassword] = useState("");
  const [generatedLink, setGeneratedLink] = useState("");
  const [linkGenerating, setLinkGenerating] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);


  // Modals
  const [photoModal, setPhotoModal] = useState<{ url: string; name: string } | null>(null);
  const [playerModal, setPlayerModal] = useState<PlacedPlayer | null>(null);

  // UI
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarMode, setSidebarMode] = useState<"players" | "objects">("players");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Close dropdowns if user clicks elsewhere
  useEffect(() => {
    const onDown = () => setOpenDropdown(null);
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, []);

  async function loadBoard() {


  useEffect(() => {
    params.then(p => { setToken(p.token); fetchBoard(p.token, ""); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchBoard(tok: string, pwd: string) {
    setPageStatus("loading");
    setPageError("");
    const url = `/api/boards/_/share-link?token=${tok}${pwd ? `&password=${encodeURIComponent(pwd)}` : ""}`;
    const res = await fetch(url);
    const data = await res.json();
    if (res.status === 401) { setPageStatus("password"); return; }
    if (res.status === 403) { setPageError("Wrong password."); setPageStatus("password"); return; }
    if (!res.ok) { setPageError(data.error || "Invalid link"); setPageStatus("error"); return; }
    setSharedBoardId(data.sharedBoardId);
    setShareMode(data.mode || "view");
    const hb = data.data?.htmlBoard ?? {};
    setPlacedPlayers(Array.isArray(hb.placedPlayers) ? hb.placedPlayers : []);
    setBoardObjects(Array.isArray(hb.objects) ? hb.objects : []);
    setBackgroundUrl(typeof hb.backgroundUrl === "string" ? hb.backgroundUrl : "");
    setCardSizeMode(hb.cardSizeMode ?? "medium");
    setLabel(data.boardName || "Shared Board");
    const allPlaced: PlacedPlayer[] = Array.isArray(hb.placedPlayers) ? hb.placedPlayers : [];
    const allPlayersData = allPlaced.map(p => p.player);
    setAllPlayers(allPlayersData);
    setPageStatus("ready");
  }

  async function saveBoard() {
    if (!sharedBoardId || !dirty) return;
    setSaving(true);
    try {
      const nextData = { htmlBoard: { placedPlayers, objects: boardObjects, backgroundUrl: backgroundUrl || "", cardSizeMode } };
      await fetch(`/api/boards/${sharedBoardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: nextData }),
      });
      setDirty(false);
    } finally { setSaving(false); }
  }

  }

  useEffect(() => {
    loadBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  

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
    if (!canEdit || !editMode) {
      e.preventDefault();
      return;
    }

    const payload = {
      id: p.id,
      name: p.name,
      grade: p.grade,
      returning: p.returning,
      primary: p.potentialPrimary,
      likelihood: p.likelihoodPrimary,
      pos1: p.position,
      pos2: p.secondaryPosition,
      notes: p.notes,
      pictureUrl: p.pictureProxyUrl || "",
    };

    const json = JSON.stringify(payload);
    e.dataTransfer.setData(PLAYER_DRAG_MIME, json);
    e.dataTransfer.setData("application/json", json);
    e.dataTransfer.setData("text/plain", json);
    e.dataTransfer.effectAllowed = "copy";
  }

  function onTokenDragStart(
    e: React.DragEvent,
    token: { tokenType: "circle" | "ball"; tokenColor?: string; tokenLabel?: string }
  ) {
    if (!canEdit || !editMode) {
      e.preventDefault();
      return;
    }

    const payload = {
      __type: "token",
      tokenType: token.tokenType,
      tokenColor: token.tokenColor,
      tokenLabel: token.tokenLabel,
    };

    const json = JSON.stringify(payload);
    e.dataTransfer.setData(OBJECT_DRAG_MIME, json);
    e.dataTransfer.setData("application/json", json);
    e.dataTransfer.setData("text/plain", json);
    e.dataTransfer.effectAllowed = "copy";
  }

  async function generateShareLink() {
    setShareLinkLoading(true);
    setShareLinkUrl("");
    try {
      const res = await fetch(`/api/boards/${sharedBoardId}/share-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: shareLinkMode, password: shareLinkPassword || undefined }),
      });
      const data = await res.json();
      if (res.ok) setShareLinkUrl(`${window.location.origin}/app/share/${data.token}`);
    } finally {
      setShareLinkLoading(false);
    }
  }

  

  async function saveBoard() {
    if (!sharedBoardId) return;
    if (!sharedBoardId) return;

    setSaving(true);
    setError(null);

    try {
      const prevData: Record<string, unknown> = {};

      const nextData = {
        ...prevData,
        google: prevData.google ?? undefined,
        htmlBoard: {
          placedPlayers: placedPlayers,
          objects: boardObjects,
          backgroundUrl: backgroundUrl || "",
          cardSizeMode: cardSizeMode,
        },
      };

      const _res = await fetch(`/api/boards/${sharedBoardId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: nextData }) });
      if (!_res.ok) throw new Error("Failed to save");

      // board state update skipped in share page
      setDirty(false);
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Failed to save board.");
    } finally {
      setSaving(false);
    }
  }

  async function onSelectBackgroundFile(file: File) {
    if (!sharedBoardId) return;

    setError(null);

    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `boards/${sharedBoardId}/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;

      const up = { error: null, data: { path } };

      if (up.error) {
        throw new Error(`Storage upload failed: ${up.error.message}.`);
      }

      const pub = { data: { publicUrl: "" } };
      const url = pub.data.publicUrl;

      setBackgroundUrl(url);
      setDirty(true);
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Failed to upload background.");
    }
  }

  function removePlacedCard(id: string) {
    setPlacedPlayers((cur) => cur.filter((p) => p.id !== id));
    setDirty(true);
  }

  if (pageStatus === "loading") return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center text-white">
      <div className="text-lg">Loading...</div>
    </div>
  );

  if (pageStatus === "error") return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center text-white">
      <div className="text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <div className="text-xl font-bold mb-2">Link Error</div>
        <div className="text-gray-400">{pageError}</div>
      </div>
    </div>
  );

  if (pageStatus === "password") return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center text-white">
      <div className="bg-dark-800 rounded-xl p-8 w-full max-w-sm shadow-xl border border-dark-600">
        <div className="text-2xl font-bold mb-2 text-center">🔒 Password Required</div>
        <p className="text-gray-400 text-sm text-center mb-6">This board is password protected.</p>
        <input type="password" value={sharePassword} onChange={e => setSharePassword(e.target.value)} onKeyDown={e => e.key === "Enter" && fetchBoard(token, sharePassword)} placeholder="Enter password" className="w-full rounded-lg border border-dark-600 bg-dark-700 px-4 py-2 text-white mb-4 focus:outline-none" autoFocus />
        <button onClick={() => fetchBoard(token, sharePassword)} className="w-full bg-maroon-700 hover:bg-maroon-600 text-white font-semibold py-2 rounded-lg">Unlock</button>
        {pageError && <p className="text-red-400 text-sm mt-3 text-center">{pageError}</p>}
      </div>
    </div>
  );

  const canEdit = shareMode === "edit";


  return (
    <main className="h-screen overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-dark-800 relative z-40">
        <div className="flex items-center gap-3 min-w-0">
          <div className="text-2xl font-bold truncate">{board ? board.name : "Board"}</div>

          <button
            type="button"
            className={`border px-3 py-1 rounded text-sm ${
              dirty ? "bg-maroon-800 text-white" : "bg-dark-800 text-dark-200"
            }`}
            onClick={saveBoard}
            disabled={!dirty || saving}
            title={dirty ? "Save changes" : "No changes to save"}
          >
            {saving ? "Saving..." : dirty ? "Save" : "Saved"}
          </button>

          <button
            type="button"
            className="border px-3 py-1 rounded text-sm bg-dark-800"
            onClick={() => loadBoard()}
            disabled={saving}
          >
            Reload
          </button>

{canEdit ? (
  <button
    type="button"
    className={`border px-3 py-1 rounded text-sm ${
      editMode ? "bg-maroon-800 text-white" : "bg-dark-800 text-dark-200"
    }`}
    onClick={() => {
      setEditMode((v) => {
        const next = !v;
        if (!next) setTool("select");
        return next;
      });
    }}
    title={editMode ? "Switch to View mode (lock the canvas)" : "Switch to Edit mode"}
  >
    {editMode ? "Edit" : "View"}
  </button>
) : (
  <span className="text-xs px-2 py-1 rounded bg-dark-800 text-dark-200">View only</span>
)}


          <div className="w-px h-6 bg-dark-600" />

          <div className="flex items-center gap-2">
            <button
              className={`rounded-md border px-3 py-1 text-sm ${tool === "select" ? "bg-dark-800" : "bg-dark-800"}`}
              onClick={() => setTool("select")}
              title="Select / Move"
              type="button"
            >
              Select
            </button>
            <button
              className={`rounded-md border px-3 py-1 text-sm ${tool === "lane" ? "bg-dark-800" : "bg-dark-800"}`}
              onClick={() => { if (!editMode) return; setTool("lane"); } }
              title="Add a swim lane (click on board to place)"
              type="button"
              disabled={!editMode}
            >
              Lane
            </button>
            <button
              className={`rounded-md border px-3 py-1 text-sm ${tool === "text" ? "bg-dark-800" : "bg-dark-800"}`}
              onClick={() => { if (!editMode) return; setTool("text"); } }
              title="Add a text box (click on board to place)"
              type="button"
              disabled={!editMode}
            >
              Text
            </button>
            <button
              className={`rounded-md border px-3 py-1 text-sm ${tool === "note" ? "bg-dark-800" : "bg-dark-800"}`}
              onClick={() => { if (!editMode) return; setTool("note"); } }
              title="Add a sticky note (click on board to place)"
              type="button"
              disabled={!editMode}
            >
              Note
            </button>

            <button
              className={`rounded-md border px-3 py-1 text-sm ${objectsLocked ? "bg-yellow-500 text-black border-yellow-400" : "bg-dark-800 text-white border-gray-600"}`}
              onClick={() => setObjectsLocked(v => !v)}
              title={objectsLocked ? "Unlock lanes, text and notes" : "Lock lanes, text and notes (players still moveable)"}
            >
              {objectsLocked ? "🔒 Locked" : "🔓 Lock Objects"}
            </button>

            <select
              className="border rounded px-2 py-1 text-sm bg-dark-800"
              value={cardSizeMode}
              onChange={(e) => { setCardSizeMode(e.target.value as any); setDirty(true); }}
              title="Card size"
            >
              <option value="large">Cards: Large</option>
              <option value="medium">Cards: Medium</option>
              <option value="small">Cards: Small</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link className="underline" href="/app/teams">
            Teams
          </Link>
          {board ? (
            <Link className="underline" href={`/app/teams/${board.team_id}`}>Boards</Link>
          ) : (
            <Link className="underline" href="/app/teams">Boards</Link>
          )}
          {isAdmin ? (
            <Link className="underline" href="/app/admin/users">Admin</Link>
          ) : null}
        </div>
      </div>

      {error && <div className="px-6 py-3 text-red-600 border-b relative z-40">{error}</div>}

      {loading ? (
        <div className="p-6">Loading...</div>
      ) : (
        <div className="flex h-[calc(100vh-73px)] min-w-0">
          {/* Left sidebar */}
          {!sidebarCollapsed ? (
            <aside className="w-96 shrink-0 border-r p-4 overflow-auto bg-dark-900 relative z-30">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold">
                  {sidebarMode === "players" ? "Roster" : "Objects"}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center border rounded overflow-hidden bg-dark-800">
                    <button
                      type="button"
                      className={`px-2 py-1 text-xs ${sidebarMode === "players" ? "bg-dark-800 font-semibold" : ""}`}
                      onClick={() => setSidebarMode("players")}
                      title="Show players"
                    >
                      Players
                    </button>
                    <button
                      type="button"
                      className={`px-2 py-1 text-xs ${sidebarMode === "objects" ? "bg-dark-800 font-semibold" : ""}`}
                      onClick={() => setSidebarMode("objects")}
                      title="Show objects"
                    >
                      Objects
                    </button>
                  </div>
                  <button
                    type="button"
                    className="border px-3 py-1 rounded text-sm bg-dark-800"
                    onClick={() => setSidebarCollapsed(true)}
                  >
                    Collapse
                  </button>
                  <button
                    type="button"
                    className="border px-3 py-1 rounded text-sm bg-dark-800"
                    onClick={() => {
                      if (googleConfig) loadPlayersFromGoogle(googleConfig);
                    }}
                    disabled={!googleConfig}
                  >
                    Refresh
                  </button>
                </div>
              </div>

              {sidebarMode === "objects" ? (
                <div className="border rounded p-3 mb-3 bg-dark-800">
                  <div className="text-xs font-semibold mb-2">Drag onto the board</div>

                  <div className="text-xs text-dark-300 mb-2">Maroon (1–11)</div>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {Array.from({ length: 11 }).map((_, i) => {
                      const label = String(i + 1);
                      return (
                        <div
                          key={`maroon-${label}`}
                          draggable
                          onDragStart={(e) =>
                            onTokenDragStart(e, {
                              tokenType: "circle",
                              tokenColor: "#7f1d1d",
                              tokenLabel: label,
                            })
                          }
                          className="w-10 h-10 rounded-full cursor-grab active:cursor-grabbing flex items-center justify-center text-white font-semibold select-none"
                          style={{ background: "#7f1d1d" }}
                          title={`Maroon ${label}`}
                        >
                          {label}
                        </div>
                      );
                    })}
                  </div>

                  <div className="text-xs text-dark-300 mb-2">Blue (1–11)</div>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {Array.from({ length: 11 }).map((_, i) => {
                      const label = String(i + 1);
                      return (
                        <div
                          key={`blue-${label}`}
                          draggable
                          onDragStart={(e) =>
                            onTokenDragStart(e, {
                              tokenType: "circle",
                              tokenColor: "#1d4ed8",
                              tokenLabel: label,
                            })
                          }
                          className="w-10 h-10 rounded-full cursor-grab active:cursor-grabbing flex items-center justify-center text-white font-semibold select-none"
                          style={{ background: "#1d4ed8" }}
                          title={`Blue ${label}`}
                        >
                          {label}
                        </div>
                      );
                    })}
                  </div>

                  <div className="text-xs text-dark-300 mb-2">Ball</div>
                  <div className="flex items-center gap-2">
                    <div
                      draggable
                      onDragStart={(e) => onTokenDragStart(e, { tokenType: "ball" })}
                      className="w-11 h-11 rounded-full cursor-grab active:cursor-grabbing flex items-center justify-center border bg-dark-800 select-none"
                      title="Soccer ball"
                    >
                      <span style={{ fontSize: 24 }}>⚽</span>
                    </div>
                    <div className="text-xs text-dark-300">Drag onto canvas</div>
                  </div>
                </div>
              ) : null}

              {/* Background upload */}
              <div className="border rounded p-3 mb-3 bg-dark-800">
                <div className="text-xs font-semibold mb-2">Background</div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="border px-3 py-1 rounded text-sm bg-dark-800"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Upload image
                  </button>
                  <button
                    type="button"
                    className="border px-3 py-1 rounded text-sm bg-dark-800"
                    onClick={() => {
                      setBackgroundUrl("");
                      setDirty(true);
                    }}
                    disabled={!backgroundUrl}
                  >
                    Clear
                  </button>
                </div>

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

              {/* Filters (players mode only) */}
              {sidebarMode === "players" ? (
                <div className="border rounded p-3 mb-3 bg-dark-800 relative z-30">
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
                    className="text-xs underline text-dark-300 mt-2"
                    onClick={() =>
                      setFilters({ search: "", grade: [], returning: [], primary: [], likelihood: [] })
                    }
                  >
                    Clear filters
                  </button>
                </div>
              ) : null}

              {sidebarMode === "players" ? (
                <>
                  {playersLoading && <div className="text-sm">Loading players…</div>}
                  {playersError && <div className="text-sm text-red-600">{playersError}</div>}

                  {!playersLoading && !playersError && players.length > 0 && (
                    <div className="text-xs text-dark-300 mb-2">
                      Showing {filteredPlayers.length} of {players.length}
                    </div>
                  )}

                  {!playersLoading && !playersError && filteredPlayers.length > 0 && (
                    <div className="space-y-2">
                      {filteredPlayers.map((p, idx) => (
                        <div
                          key={`${p.id || "noid"}-${p.name || "noname"}-${idx}`}
                          className="border rounded bg-dark-800 cursor-grab active:cursor-grabbing"
                          draggable
                          onDragStart={(e) => onPlayerDragStart(e, p)}
                        >
                          <div className="p-2">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                className="w-12 h-12 rounded overflow-hidden bg-dark-700 flex-shrink-0 border"
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
                                <div className="text-xs text-dark-200">
                                  Grade: {p.grade || "?"} • Pos: {p.position || "?"}
                                  {p.secondaryPosition ? ` / ${p.secondaryPosition}` : ""} • Returning:{" "}
                                  {p.returning || "?"}
                                </div>
                                <div className="text-xs text-dark-200">
                                  Primary: {p.potentialPrimary || "?"} • Likelihood:{" "}
                                  {p.likelihoodPrimary || "?"}
                                </div>
                              </div>
                            </div>

                            {p.notes ? (
                              <div className="text-xs text-dark-300 mt-1">{p.notes}</div>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : null}
            </aside>
          ) : (
            <aside className="w-12 shrink-0 border-r bg-dark-900 relative z-30 flex flex-col items-center py-3">
              <button
                type="button"
                className="border px-2 py-1 rounded text-xs bg-dark-800 rotate-90"
                onClick={() => setSidebarCollapsed(false)}
                title="Show roster"
              >
                Show
              </button>
            </aside>
          )}

          {/* Board */}
          <section className="flex-1 min-w-0 relative z-0">
            <HtmlBoard
              editMode={editMode}
              placed={placedPlayers}
              onPlacedChange={(next) => {
                setPlacedPlayers(next);
                setDirty(true);
              }}
              objects={boardObjects}
              onObjectsChange={(next) => {
                setBoardObjects(next);
                setDirty(true);
              }}
              tool={tool}
              objectsLocked={objectsLocked}
              onToolChange={(t) => setTool(t)}
              cardSizeMode={cardSizeMode}
              playerDragMime={PLAYER_DRAG_MIME}
              objectDragMime={OBJECT_DRAG_MIME}
              backgroundUrl={backgroundUrl || undefined}
              onOpenPlayer={(pp) => setPlayerModal(pp)}
              canvasWidth={3000}
              canvasHeight={2000}
            />
          </section>
        </div>
      )}

      {/* Photo modal (roster thumbnail) */}
      {photoModal ? (
        <div
          className="fixed inset-0 z-[999] bg-maroon-800/80 flex items-center justify-center p-4"
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
              className="w-full max-h-[80vh] object-contain rounded-lg bg-maroon-800"
            />
          </div>
        </div>
      ) : null}

      {/* Player modal (clicked on canvas) */}
      {playerModal ? (
        <div
          className="fixed inset-0 z-[1000] bg-maroon-800/80 flex items-center justify-center p-4"
          onClick={() => setPlayerModal(null)}
        >
          <div
            className="w-full max-w-5xl bg-dark-800 rounded-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="font-semibold truncate">{playerModal.player.name}</div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="border px-3 py-1 rounded text-sm bg-dark-800"
                  onClick={() => {
                    removePlacedCard(playerModal.id);
                    setPlayerModal(null);
                  }}
                >
                  Remove from board
                </button>
                <button
                  type="button"
                  className="underline text-sm"
                  onClick={() => setPlayerModal(null)}
                >
                  Close
                </button>
              </div>
            </div>

            <div className="p-4 flex gap-4">
              <div className="w-48 h-48 bg-dark-800 rounded overflow-hidden flex items-center justify-center shrink-0">
                {playerModal.player.pictureUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={playerModal.player.pictureUrl}
                    alt={`${playerModal.player.name} photo`}
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                ) : (
                  <div className="text-3xl font-bold text-dark-100">
                    {(playerModal.player.name || "?").slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-sm text-dark-100 mb-1">
                  <span className="font-semibold">Grade:</span> {playerModal.player.grade || "?"}
                </div>
                <div className="text-sm text-dark-100 mb-1">
                  <span className="font-semibold">Position:</span>{" "}
                  {playerModal.player.pos1 || "?"}
                  {playerModal.player.pos2 ? ` / ${playerModal.player.pos2}` : ""}
                </div>
                <div className="text-sm text-dark-100 mb-1">
                  <span className="font-semibold">Returning:</span>{" "}
                  {playerModal.player.returning || "?"}
                </div>
                <div className="text-sm text-dark-100 mb-1">
                  <span className="font-semibold">Primary:</span>{" "}
                  {playerModal.player.primary || "?"}
                </div>
                <div className="text-sm text-dark-100 mb-1">
                  <span className="font-semibold">Likelihood:</span>{" "}
                  {playerModal.player.likelihood || "?"}
                </div>

                {playerModal.player.notes ? (
                  <div className="mt-3">
                    <div className="text-xs font-semibold text-dark-200 mb-1">Notes</div>
                    <div className="text-sm text-dark-100 whitespace-pre-wrap">
                      {playerModal.player.notes}
                    </div>
                  </div>
                ) : null}

                <div className="mt-4 text-xs text-dark-400">
                  Tip: resize the card using the bottom-right handle on the card.
                </div>
              </div>
            </div>
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
        className="w-full border rounded px-2 py-1 text-sm flex items-center justify-between bg-dark-800"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={onOpen}
      >
        <span>
          {label}
          {selectedCount ? ` (${selectedCount})` : ""}
        </span>
        <span className="text-dark-400">{open ? "▲" : "▼"}</span>
      </button>

      {open ? (
        <div
          className="mt-1 w-full bg-dark-800 border rounded shadow p-2 max-h-56 overflow-auto relative z-40"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {options.length === 0 ? (
            <div className="text-xs text-dark-400">No options</div>
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
  const selectedCount = selected.length;

  return (
    <div className="mb-2 relative">
      <button
        type="button"
        className="w-full border rounded px-2 py-1 text-sm flex items-center justify-between bg-dark-800"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={onOpen}
      >
        <span>
          {label}
          {selectedCount ? ` (${selectedCount})` : ""}
        </span>
        <span className="text-dark-400">{open ? "▲" : "▼"}</span>
      </button>

      {open ? (
        <div
          className="mt-1 w-full bg-dark-800 border rounded shadow p-2 max-h-56 overflow-auto relative z-40"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {options.length === 0 ? (
            <div className="text-xs text-dark-400">No options</div>
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
 */
function normalizePictureUrl(sharedBoardId: string) {
  const s = (sharedBoardId ?? "").trim();
  if (!s) return "";

  try {
    const u = new URL(s);

    // /file/d/<id>/
    const m = u.pathname.match(/\/file\/d\/([^/]+)/);
    if (m && m[1]) return `https://drive.google.com/uc?export=view&id=${m[1]}`;

    // /thumbnail?id=...
    if (u.hostname === "drive.google.com" && u.pathname === "/thumbnail") {
      let id = u.searchParams.get("id") ?? "";
      if (id.includes("=") && !id.includes("%3D")) {
        id = id.split("=")[0];
      }
      if (id) {
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

