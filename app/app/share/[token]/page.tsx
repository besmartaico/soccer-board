"use client";
import { useState, useEffect } from "react";
import { HtmlBoard } from "@/lib/board/HtmlBoard";
import type { PlacedPlayer, BoardObject } from "@/lib/board/HtmlBoard";

export default function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<"loading"|"password"|"ready"|"error">("loading");
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [boardData, setBoardData] = useState<Record<string, unknown>>({});
  const [boardName, setBoardName] = useState("");
  const [mode, setMode] = useState<"view"|"edit">("view");
  const [placed, setPlaced] = useState<PlacedPlayer[]>([]);
  const [objects, setObjects] = useState<BoardObject[]>([]);

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
    setBoardName(data.boardName || "Shared Board");
    setMode(data.mode || "view");
    const bd = (data.data?.htmlBoard || data.data) as Record<string, unknown>;
    setBoardData(bd);
    setPlaced(((bd.placedPlayers || bd.placed) as PlacedPlayer[]) || []);
    setObjects((bd.objects as BoardObject[]) || []);
    setStatus("ready");
  }

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
        <p className="text-gray-400 text-sm text-center mb-6">This board link is password protected.</p>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === "Enter" && fetchBoard(token, password)}
          placeholder="Enter password"
          className="w-full rounded-lg border border-dark-600 bg-dark-700 px-4 py-2 text-white mb-4 focus:outline-none focus:ring-2 focus:ring-maroon-500"
          autoFocus
        />
        <button
          onClick={() => fetchBoard(token, password)}
          className="w-full bg-maroon-700 hover:bg-maroon-600 text-white font-semibold py-2 rounded-lg"
        >Unlock</button>
        {error && <p className="text-red-400 text-sm mt-3 text-center">{error}</p>}
      </div>
    </div>
  );

  const canEdit = mode === "edit";

  return (
    <div className="min-h-screen bg-dark-900 flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 bg-dark-800 border-b border-dark-600">
        <div className="text-white font-bold text-lg">{boardName}</div>
        <div className="flex items-center gap-3">
          <span className={`text-xs px-2 py-1 rounded ${canEdit ? "bg-green-700 text-white" : "bg-gray-700 text-gray-300"}`}>
            {canEdit ? "✏️ Edit" : "👁️ View only"}
          </span>
          <a href="/" className="text-xs text-gray-400 hover:text-white underline">← Home</a>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <HtmlBoard
          editMode={canEdit}
          placed={placed}
          onPlacedChange={canEdit ? setPlaced : () => {}}
          playerDragMime="application/x-player"
          objectDragMime="application/x-object"
          backgroundUrl={(boardData.backgroundUrl as string) || undefined}
          objects={objects}
          onObjectsChange={canEdit ? setObjects : undefined}
          objectsLocked={!canEdit}
          canvasWidth={3000}
          canvasHeight={2000}
        />
      </div>
    </div>
  );
}
