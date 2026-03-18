"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { HtmlBoard, type PlacedPlayer, type BoardObject, type BoardTool } from "@/lib/board/HtmlBoard";

type CardSizeMode = "small" | "medium" | "large";

export default function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState("");
  const [boardId, setBoardId] = useState("");
  const [status, setStatus] = useState<"loading"|"password"|"ready"|"error">("loading");
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [boardName, setBoardName] = useState("");
  const [shareMode, setShareMode] = useState<"view"|"edit">("view");

  // Board state - mirrors main board page
  const [placedPlayers, setPlacedPlayers] = useState<PlacedPlayer[]>([]);
  const [boardObjects, setBoardObjects] = useState<BoardObject[]>([]);
  const [backgroundUrl, setBackgroundUrl] = useState("");
  const [cardSizeMode, setCardSizeMode] = useState<CardSizeMode>("medium");
  const [editMode, setEditMode] = useState(false);
  const [tool, setTool] = useState<BoardTool>("select");
  const [objectsLocked, setObjectsLocked] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Roster / sidebar
  const [sidebarMode, setSidebarMode] = useState<"players"|"tools">("players");
  const [players, setPlayers] = useState<PlacedPlayer[]>([]);

  useEffect(() => {
    params.then(p => {
      setToken(p.token);
      fetchBoard(p.token, "");
    });
  }, []);

  async function fetchBoard(tok: string, pwd: string) {
    setStatus("loading");
    setError("");
    const url = `/api/boards/_/share-link?token=${tok}${pwd ? `&password=${encodeURIComponent(pwd)}` : ""}`;
    const res = await fetch(url);
    const data = await res.json();
    if (res.status === 401) { setStatus("password"); return; }
    if (res.status === 403) { setError("Wrong password. Please try again."); setStatus("password"); return; }
    if (!res.ok) { setError(data.error || "Invalid link"); setStatus("error"); return; }

    setBoardId(data.boardId);
    setBoardName(data.boardName || "Shared Board");
    setShareMode(data.mode || "view");
    setEditMode(false);

    const hb = data.data?.htmlBoard ?? {};
    setPlacedPlayers(Array.isArray(hb.placedPlayers) ? hb.placedPlayers : []);
    setBoardObjects(Array.isArray(hb.objects) ? hb.objects : []);
    setBackgroundUrl(typeof hb.backgroundUrl === "string" ? hb.backgroundUrl : "");
    setCardSizeMode(hb.cardSizeMode ?? "medium");

    // Build roster from placed players (unique by name)
    const seen = new Set<string>();
    const roster: PlacedPlayer[] = [];
    (Array.isArray(hb.placedPlayers) ? hb.placedPlayers : []).forEach((p: PlacedPlayer) => {
      if (!seen.has(p.player.name)) { seen.add(p.player.name); roster.push(p); }
    });
    setPlayers(roster);
    setStatus("ready");
  }

  async function saveBoard() {
    if (!boardId) return;
    setSaving(true);
    try {
      await fetch(`/api/boards/${boardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: {
            htmlBoard: { placedPlayers, objects: boardObjects, backgroundUrl, cardSizeMode }
          }
        }),
      });
      setDirty(false);
    } finally { setSaving(false); }
  }

  const cardSizes: { mode: CardSizeMode; label: string }[] = [
    { mode: "small", label: "S" },
    { mode: "medium", label: "M" },
    { mode: "large", label: "L" },
  ];

  if (status === "loading") return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center text-white">
      <div className="text-lg">Loading shared board...</div>
    </div>
  );

  if (status === "error") return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center text-white">
      <div className="text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <div className="text-xl font-bold mb-2">Link Error</div>
        <div className="text-gray-400">{error}</div>
      </div>
    </div>
  );

  if (status === "password") return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center text-white">
      <div className="bg-dark-800 rounded-xl p-8 w-full max-w-sm shadow-xl border border-dark-600">
        <div className="text-2xl font-bold mb-2 text-center">🔒 Password Required</div>
        <p className="text-gray-400 text-sm text-center mb-6">This board is password protected.</p>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === "Enter" && fetchBoard(token, password)}
          placeholder="Enter password"
          className="w-full rounded-lg border border-dark-600 bg-dark-700 px-4 py-2 text-white mb-4 focus:outline-none"
          autoFocus
        />
        <button onClick={() => fetchBoard(token, password)} className="w-full bg-maroon-700 hover:bg-maroon-600 text-white font-semibold py-2 rounded-lg">Unlock</button>
        {error && <p className="text-red-400 text-sm mt-3 text-center">{error}</p>}
      </div>
    </div>
  );

  const canEdit = shareMode === "edit";

  return (
    <div className="flex h-screen overflow-hidden bg-dark-900 text-white">
      {/* Sidebar */}
      <div className="w-56 flex-none flex flex-col border-r border-dark-700 bg-dark-800 overflow-y-auto">
        <div className="px-3 py-3 border-b border-dark-700">
          <div className="text-sm font-bold truncate">{boardName}</div>
          <div className="text-xs text-dark-300 mt-0.5">{canEdit ? "✏️ Edit access" : "👁️ View only"}</div>
        </div>

        {/* Toolbar */}
        {canEdit && (
          <div className="px-3 py-3 border-b border-dark-700 flex flex-col gap-2">
            {/* Edit mode toggle */}
            <button
              onClick={() => { setEditMode(m => !m); setObjectsLocked(true); }}
              className={`w-full rounded px-2 py-1.5 text-xs font-medium ${editMode ? "bg-maroon-700 text-white" : "bg-dark-700 text-dark-300 hover:text-white"}`}
            >{editMode ? "✏️ Edit Mode ON" : "👁️ View Mode"}</button>

            {editMode && (
              <>
                {/* Tools */}
                <div className="flex gap-1">
                  {(["select","lane","text","note"] as BoardTool[]).map(t => (
                    <button key={t} onClick={() => setTool(t)}
                      className={`flex-1 rounded px-1 py-1 text-xs font-medium ${tool === t ? "bg-dark-600 text-white ring-1 ring-yellow-500" : "bg-dark-700 text-dark-300 hover:text-white"}`}
                      title={t.charAt(0).toUpperCase() + t.slice(1)}
                    >{t === "select" ? "↖" : t === "lane" ? "▭" : t === "text" ? "T" : "📝"}</button>
                  ))}
                </div>

                {/* Lock */}
                <button
                  onClick={() => setObjectsLocked(l => !l)}
                  className={`w-full rounded px-2 py-1.5 text-xs font-medium ${objectsLocked ? "bg-yellow-600 text-black" : "bg-dark-700 text-dark-300 hover:text-white"}`}
                >{objectsLocked ? "🔒 Locked" : "🔓 Unlocked"}</button>

                {/* Card sizes */}
                <div className="flex gap-1">
                  {cardSizes.map(({ mode, label }) => (
                    <button key={mode} onClick={() => setCardSizeMode(mode)}
                      className={`flex-1 rounded px-1 py-1 text-xs font-medium ${cardSizeMode === mode ? "bg-dark-600 text-white ring-1 ring-yellow-500" : "bg-dark-700 text-dark-300 hover:text-white"}`}
                    >{label}</button>
                  ))}
                </div>

                {/* Save */}
                <button
                  onClick={saveBoard}
                  disabled={!dirty || saving}
                  className="w-full rounded px-2 py-1.5 text-xs font-medium bg-maroon-800 hover:bg-maroon-700 text-white disabled:opacity-40"
                >{saving ? "Saving..." : dirty ? "💾 Save" : "Saved"}</button>
              </>
            )}
          </div>
        )}

        {/* Roster */}
        <div className="px-3 py-3 flex-1 overflow-y-auto">
          <div className="text-xs font-bold text-dark-300 mb-2 uppercase tracking-wide">Roster</div>
          {players.length === 0 ? (
            <div className="text-xs text-dark-400">No players on board</div>
          ) : (
            <div className="flex flex-col gap-1">
              {players.map(p => (
                <div
                  key={p.id}
                  className="text-xs rounded px-2 py-1.5 bg-dark-700 truncate cursor-grab"
                  draggable
                  onDragStart={e => {
                    e.dataTransfer.setData("application/x-player", JSON.stringify(p.player));
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                >{p.player.name}</div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Board canvas */}
      <div className="flex-1 overflow-hidden">
        <HtmlBoard
          editMode={editMode}
          placed={placedPlayers}
          onPlacedChange={p => { setPlacedPlayers(p); setDirty(true); }}
          playerDragMime="application/x-player"
          objectDragMime="application/x-object"
          backgroundUrl={backgroundUrl || undefined}
          objects={boardObjects}
          onObjectsChange={o => { setBoardObjects(o); setDirty(true); }}
          objectsLocked={objectsLocked}
          tool={tool}
          cardSizeMode={cardSizeMode}
          canvasWidth={3000}
          canvasHeight={2000}
        />
      </div>
    </div>
  );
}
