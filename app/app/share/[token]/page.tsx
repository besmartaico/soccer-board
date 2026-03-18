"use client";
import { useEffect, useRef, useState } from "react";
import { HtmlBoard } from "@/lib/board/HtmlBoard";
import type { PlacedPlayer, BoardObject, BoardTool } from "@/lib/board/HtmlBoard";

const PLAYER_DRAG_MIME = "application/x-soccer-player";
const OBJECT_DRAG_MIME = "application/x-board-object";

type PageStatus = "loading" | "password" | "error" | "ready";

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

export default function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [pageStatus, setPageStatus] = useState<PageStatus>("loading");
  const [pageError, setPageError] = useState("");
  const [sharePassword, setSharePassword] = useState("");
  const [label, setLabel] = useState("Board");
  const [sharedBoardId, setSharedBoardId] = useState("");

  const [placedPlayers, setPlacedPlayers] = useState<PlacedPlayer[]>([]);
  const [boardObjects, setBoardObjects] = useState<BoardObject[]>([]);
  const [backgroundUrl, setBackgroundUrl] = useState("");
  const [cardSizeMode, setCardSizeMode] = useState<"small" | "medium" | "large">("medium");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tool, setTool] = useState<BoardTool>("select");
  const [objectsLocked, setObjectsLocked] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [filterName, setFilterName] = useState("");
  const [filterGrade, setFilterGrade] = useState<string[]>([]);
  const [filterReturning, setFilterReturning] = useState<string[]>([]);
  const [filterPrimary, setFilterPrimary] = useState<string[]>([]);
  const [filterLikelihood, setFilterLikelihood] = useState<string[]>([]);
  const boardRef = useRef<HTMLDivElement>(null);

  async function fetchBoard(tok: string, pwd: string) {
    setPageStatus("loading");
    setPageError("");
    const url = `/api/boards/_/share-link?token=${tok}${pwd ? `&password=${encodeURIComponent(pwd)}` : ""}`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (res.status === 401) { setPageStatus("password"); return; }
      if (res.status === 403) { setPageStatus("password"); setPageError("Incorrect password."); return; }
      if (!res.ok) { setPageStatus("error"); setPageError(data.error || "Invalid or expired link."); return; }
      setSharedBoardId(data.boardId || "");
      setLabel(data.boardName || "Board");
      setEditMode(data.mode === "edit");
      const hb = data.data?.htmlBoard ?? {};
      setPlacedPlayers(Array.isArray(hb.placedPlayers) ? hb.placedPlayers : []);
      setBoardObjects(Array.isArray(hb.objects) ? hb.objects : []);
      setBackgroundUrl(typeof hb.backgroundUrl === "string" ? hb.backgroundUrl : "");
      setCardSizeMode(hb.cardSizeMode ?? "medium");
      if (Array.isArray(hb.placedPlayers)) {
        const seen = new Set<string>();
        const rows: PlayerRow[] = [];
        hb.placedPlayers.forEach((pp: PlacedPlayer) => {
          const p = pp.player as unknown as PlayerRow;
          if (p?.id && !seen.has(p.id)) { seen.add(p.id); rows.push(p); }
        });
        setPlayers(rows);
      }
      setPageStatus("ready");
    } catch (e: unknown) {
      setPageStatus("error");
      setPageError(e instanceof Error ? e.message : "Failed to load board.");
    }
  }

  useEffect(() => {
    params.then(p => { setToken(p.token); fetchBoard(p.token, ""); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveBoard() {
    if (!sharedBoardId || !dirty) return;
    setSaving(true);
    try {
      await fetch(`/api/boards/${sharedBoardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: { htmlBoard: { placedPlayers, objects: boardObjects, backgroundUrl, cardSizeMode } } }),
      });
      setDirty(false);
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  }

  useEffect(() => {
    if (!dirty || !editMode) return;
    const t = setTimeout(saveBoard, 2000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, placedPlayers, boardObjects]);

  const filteredPlayers = players.filter(p => {
    if (filterName && !p.name.toLowerCase().includes(filterName.toLowerCase())) return false;
    if (filterGrade.length && !filterGrade.includes(p.grade)) return false;
    if (filterReturning.length && !filterReturning.includes(p.returning)) return false;
    if (filterPrimary.length && !filterPrimary.includes(p.potentialPrimary)) return false;
    if (filterLikelihood.length && !filterLikelihood.includes(p.likelihoodPrimary)) return false;
    return true;
  });

  const placedIds = new Set(placedPlayers.map(pp => (pp.player as unknown as PlayerRow)?.id).filter(Boolean));

  if (pageStatus === "loading") return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center text-white text-lg">Loading…</div>
  );

  if (pageStatus === "error") return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center text-white">
      <div className="text-center">
        <div className="text-2xl font-bold mb-2">❌ Error</div>
        <p className="text-gray-400">{pageError || "Invalid or expired link."}</p>
      </div>
    </div>
  );

  if (pageStatus === "password") return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center text-white">
      <div className="bg-dark-800 rounded-2xl p-8 w-full max-w-sm shadow-xl">
        <div className="text-2xl font-bold mb-2 text-center">🔒 Password Required</div>
        <p className="text-gray-400 text-sm text-center mb-6">This board is password protected.</p>
        <input type="password" value={sharePassword} onChange={e => setSharePassword(e.target.value)}
          onKeyDown={e => e.key === "Enter" && fetchBoard(token, sharePassword)}
          placeholder="Enter password"
          className="w-full rounded-lg border border-dark-600 bg-dark-700 px-4 py-2 text-white mb-4 focus:outline-none"
          autoFocus />
        <button onClick={() => fetchBoard(token, sharePassword)}
          className="w-full bg-maroon-700 hover:bg-maroon-600 text-white font-semibold py-2 rounded-lg">
          Unlock
        </button>
        {pageError && <p className="text-red-400 text-sm mt-3 text-center">{pageError}</p>}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col min-h-screen bg-dark-900 text-white">
      <div className="flex items-center gap-2 px-4 py-2 bg-dark-800 border-b border-dark-700 z-40 flex-wrap">
        <span className="text-xl font-bold mr-2 truncate max-w-xs">{label}</span>
        <span className="text-xs text-gray-400 border border-dark-600 rounded px-2 py-0.5 mr-2">{saving ? "Saving…" : "Saved"}</span>
        <button onClick={() => fetchBoard(token, sharePassword)} className="border border-dark-600 rounded px-3 py-1 text-sm hover:bg-dark-700">Reload</button>
        {editMode && (
          <>
            {(["select","lane","text","note"] as BoardTool[]).map(t => (
              <button key={t} onClick={() => setTool(t)}
                className={`border rounded px-3 py-1 text-sm capitalize ${tool === t ? "bg-maroon-700 border-maroon-600" : "border-dark-600 hover:bg-dark-700"}`}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
            <button onClick={() => setObjectsLocked(l => !l)}
              className={`border rounded px-3 py-1 text-sm ${objectsLocked ? "bg-yellow-600 border-yellow-500" : "border-dark-600 hover:bg-dark-700"}`}>
              {objectsLocked ? "🔒 Locked" : "Locked"}
            </button>
            <select value={cardSizeMode} onChange={e => { setCardSizeMode(e.target.value as "small"|"medium"|"large"); setDirty(true); }}
              className="border border-dark-600 bg-dark-800 rounded px-2 py-1 text-sm">
              <option value="small">Cards: Small</option>
              <option value="medium">Cards: Medium</option>
              <option value="large">Cards: Large</option>
            </select>
          </>
        )}
        {!editMode && <span className="text-xs text-gray-500 border border-dark-600 rounded px-2 py-0.5">View only</span>}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {!sidebarCollapsed ? (
          <div className="w-64 flex-shrink-0 bg-dark-800 border-r border-dark-700 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-dark-700">
              <span className="font-semibold text-sm">Roster</span>
              <div className="flex gap-2">
                <button onClick={() => fetchBoard(token, sharePassword)} className="text-xs border border-dark-600 rounded px-2 py-0.5 hover:bg-dark-700">Refresh</button>
                <button onClick={() => setSidebarCollapsed(true)} className="text-xs border border-dark-600 rounded px-2 py-0.5 hover:bg-dark-700">Collapse</button>
              </div>
            </div>
            <div className="px-3 py-2 border-b border-dark-700 space-y-1">
              <input type="text" value={filterName} onChange={e => setFilterName(e.target.value)}
                placeholder="Search name / notes / position"
                className="w-full rounded border border-dark-600 bg-dark-700 px-2 py-1 text-xs focus:outline-none" />
              {([
                { label: "Grade", value: filterGrade, setter: setFilterGrade, opts: ["9","10","11","12"] },
                { label: "Returning", value: filterReturning, setter: setFilterReturning, opts: ["Yes","No"] },
                { label: "Primary", value: filterPrimary, setter: setFilterPrimary, opts: ["Varsity","JV","Sophomore","Freshman"] },
                { label: "Likelihood", value: filterLikelihood, setter: setFilterLikelihood, opts: ["High","Medium","Low","Unknown"] },
              ] as const).map(f => (
                <DropdownMultiSelect key={f.label} label={f.label} options={[...f.opts]} selected={f.value} onChange={v => f.setter(v)} />
              ))}
              {(filterName || filterGrade.length > 0 || filterReturning.length > 0 || filterPrimary.length > 0 || filterLikelihood.length > 0) && (
                <button onClick={() => { setFilterName(""); setFilterGrade([]); setFilterReturning([]); setFilterPrimary([]); setFilterLikelihood([]); }}
                  className="text-xs text-gray-400 hover:text-white">Clear filters</button>
              )}
            </div>
            <div className="px-2 py-1 text-xs text-gray-500">Showing {filteredPlayers.length} of {players.length}</div>
            <div className="flex-1 overflow-y-auto">
              {filteredPlayers.map(p => (
                <div key={p.id}
                  draggable={editMode && !objectsLocked}
                  onDragStart={e => { e.dataTransfer.setData(PLAYER_DRAG_MIME, JSON.stringify(p)); e.dataTransfer.setData("text/plain", p.id); }}
                  className={`flex items-center gap-2 px-2 py-1.5 border-b border-dark-700 ${editMode && !objectsLocked ? "cursor-grab" : ""} hover:bg-dark-700 ${placedIds.has(p.id) ? "opacity-50" : ""}`}>
                  {(p.pictureProxyUrl || p.picture) ? (
                    <img src={p.pictureProxyUrl || p.picture} alt={p.name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-dark-600 flex items-center justify-center text-xs flex-shrink-0">{p.name.charAt(0)}</div>
                  )}
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">{p.name}</div>
                    <div className="text-xs text-gray-400 truncate">Gr {p.grade} · {p.position} · {p.potentialPrimary}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <button onClick={() => setSidebarCollapsed(false)} className="w-8 bg-dark-800 border-r border-dark-700 flex items-center justify-center hover:bg-dark-700 text-xs writing-mode-vertical">▶</button>
        )}

        <div className="flex-1 overflow-hidden" ref={boardRef}>
          <HtmlBoard
            editMode={editMode && !objectsLocked}
            placed={placedPlayers}
            onPlacedChange={(next) => { setPlacedPlayers(next); setDirty(true); }}
            playerDragMime={PLAYER_DRAG_MIME}
            objectDragMime={OBJECT_DRAG_MIME}
            backgroundUrl={backgroundUrl}
            onOpenPlayer={() => {}}
            objects={boardObjects}
            onObjectsChange={(next) => { setBoardObjects(next); setDirty(true); }}
            tool={tool}
            onToolChange={setTool}
            objectsLocked={objectsLocked}
            cardSizeMode={cardSizeMode}
          />
        </div>
      </div>
    </div>
  );
}

function DropdownMultiSelect({ label, options, selected, onChange }: {
  label: string; options: string[]; selected: string[]; onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handle(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  return (
    <div ref={ref} className="relative w-full">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between border border-dark-600 bg-dark-700 rounded px-2 py-1 text-xs">
        <span>{selected.length ? selected.join(", ") : label}</span>
        <span>▼</span>
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 w-full bg-dark-700 border border-dark-600 rounded shadow-lg mt-0.5">
          {options.map(o => (
            <label key={o} className="flex items-center gap-2 px-2 py-1 hover:bg-dark-600 cursor-pointer text-xs">
              <input type="checkbox" checked={selected.includes(o)} onChange={() => toggle(o)} />
              {o}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
