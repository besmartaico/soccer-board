"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { getMyRole, type UserRole } from "@/lib/roles";
import { HtmlBoard, type PlacedPlayer, type BoardObject, type BoardTool } from "@/lib/board/HtmlBoard";

type BoardRow = {
  id: string;
  team_id: string;
  name: string;
  data?: any;
  created_at: string;
};

type GoogleConfig = { sheetId: string; range: string };

export default function BoardPage() {
  const params = useParams();
  const router = useRouter();
  const boardId = String(params?.boardId || "");

  const [board, setBoard] = useState<BoardRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [myRole, setMyRole] = useState<UserRole>("viewer");
  const [editMode, setEditMode] = useState(false);

  const [placedPlayers, setPlacedPlayers] = useState<PlacedPlayer[]>([]);
  const [boardObjects, setBoardObjects] = useState<BoardObject[]>([]);
  const [tool, setTool] = useState<BoardTool>("select");

  const [backgroundUrl, setBackgroundUrl] = useState<string>("");

  // Card size
  const [cardSizeMode, setCardSizeMode] = useState<"large" | "medium" | "small">("large");

  // Roster (Google)
  const [googleConfig, setGoogleConfig] = useState<GoogleConfig | null>(null);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [rosterPlayers, setRosterPlayers] = useState<any[]>([]);

  // Sharing UI (emails array stored in board.data.sharing.emails)
  const [shareOpen, setShareOpen] = useState(false);
  const [shareEmailsText, setShareEmailsText] = useState("");
  const [shareEmails, setShareEmails] = useState<string[]>([]);
  const [shareSaving, setShareSaving] = useState(false);

  // DnD mime for roster card payloads
  const dragMime = "application/x-lpsb-player";

  const initialLoadDoneRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    async function load() {
      if (!boardId) return;

      setLoading(true);
      setError(null);

      // must be logged in
      const { data: userResp } = await supabase.auth.getUser();
      if (!userResp.user) {
        router.push("/login");
        return;
      }

      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        setError("Missing session token.");
        setLoading(false);
        return;
      }

      const resp = await fetch(`/api/boards/${boardId}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      const json = await resp.json();
      if (!resp.ok || !json?.success) {
        setError(json?.error || "Failed to load board.");
        setLoading(false);
        return;
      }

      const row = json.board as BoardRow;
      const roleFromApi = (json.role || "viewer") as UserRole;
      setMyRole(roleFromApi);
      setEditMode(roleFromApi === "admin" || roleFromApi === "editor");

      setBoard(row);

      // Google config
      const gc = row?.data?.google;
      if (gc?.sheetId && gc?.range) setGoogleConfig({ sheetId: gc.sheetId, range: gc.range });

      // htmlBoard payload in data
      const hb = row?.data?.htmlBoard;
      if (hb?.placedPlayers && Array.isArray(hb.placedPlayers)) setPlacedPlayers(hb.placedPlayers);
      if (hb?.objects && Array.isArray(hb.objects)) setBoardObjects(hb.objects);
      if (hb?.backgroundUrl) setBackgroundUrl(String(hb.backgroundUrl));
      if (hb?.cardSizeMode) setCardSizeMode(hb.cardSizeMode);

      // sharing
      const emails = row?.data?.sharing?.emails;
      if (Array.isArray(emails)) {
        const cleaned = emails.map((e: any) => String(e || "").trim()).filter(Boolean);
        setShareEmails(cleaned);
        setShareEmailsText(cleaned.join(", "));
      }

      if (!mounted) return;
      setLoading(false);
      initialLoadDoneRef.current = true;
    }

    load();
    return () => {
      mounted = false;
    };
  }, [boardId, router]);

  // mark dirty when user edits board
  useEffect(() => {
    if (!initialLoadDoneRef.current) return;
    setDirty(true);
  }, [placedPlayers, boardObjects, backgroundUrl, cardSizeMode]);

  async function loadRoster() {
    if (!googleConfig || !boardId) return;

    setRosterLoading(true);
    setRosterError(null);

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Missing session token.");

      const qs = new URLSearchParams({
        sheetId: googleConfig.sheetId,
        range: googleConfig.range,
      }).toString();

      const resp = await fetch(`/api/boards/${boardId}/google?${qs}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      const json = await resp.json();
      if (!resp.ok || !json?.success) throw new Error(json?.error || "Failed to load roster.");

      setRosterPlayers(Array.isArray(json.players) ? json.players : []);
    } catch (e: any) {
      setRosterError(e?.message ?? "Failed to load roster.");
    } finally {
      setRosterLoading(false);
    }
  }

  function openSharing() {
    setShareOpen(true);
    setShareEmailsText(shareEmails.join(", "));
  }

  function closeSharing() {
    setShareOpen(false);
  }

  async function saveSharing() {
    if (!boardId) return;
    if (!board) return;

    setShareSaving(true);
    setError(null);

    try {
      const cleaned = Array.from(
        new Set(
          shareEmailsText
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .map((s) => s.toLowerCase())
            .filter(Boolean)
        )
      );

      const prevData = board?.data && typeof board.data === "object" ? board.data : {};
      const nextData = {
        ...prevData,
        sharing: {
          ...(prevData as any).sharing,
          emails: cleaned,
        },
      };

      const u = await supabase.from("boards").update({ data: nextData }).eq("id", boardId);
      if (u.error) throw new Error(u.error.message);

      setBoard({ ...board, data: nextData });
      setShareEmails(cleaned);
      setShareOpen(false);
    } catch (e: any) {
      setError(e?.message ?? "Failed to save sharing settings.");
    } finally {
      setShareSaving(false);
    }
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
        htmlBoard: {
          placedPlayers: placedPlayers,
          objects: boardObjects,
          backgroundUrl: backgroundUrl || "",
          cardSizeMode: cardSizeMode,
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
    if (!editMode) return;

    setError(null);
    try {
      const ext = file.name.split(".").pop() || "png";
      const key = `board-backgrounds/${boardId}/${Date.now()}.${ext}`;

      const up = await supabase.storage.from("board_assets").upload(key, file, { upsert: true });
      if (up.error) throw new Error(up.error.message);

      const pub = supabase.storage.from("board_assets").getPublicUrl(key);
      const url = pub.data.publicUrl;

      setBackgroundUrl(url);
    } catch (e: any) {
      setError(e?.message ?? "Failed to upload background image.");
    }
  }

  if (loading) {
    return <div className="p-8 text-sm text-gray-500">Loading...</div>;
  }

  if (!board) {
    return (
      <div className="p-8">
        <div className="text-red-600 text-sm">{error || "Board not found."}</div>
        <div className="mt-2">
          <Link className="underline" href="/teams">
            Back to Teams
          </Link>
        </div>
      </div>
    );
  }

  const canEdit = editMode;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs text-gray-500">
            <Link className="underline" href={`/teams/${board.team_id}`}>
              Back to Team
            </Link>
          </div>
          <h1 className="text-2xl font-bold">{board.name}</h1>
          <div className="text-xs text-gray-500 mt-1">
            Role: <span className="font-semibold">{myRole}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="border rounded px-3 py-2 text-sm" onClick={openSharing}>
            Share
          </button>

          <select
            className="border rounded px-2 py-2 text-sm"
            value={cardSizeMode}
            onChange={(e) => setCardSizeMode(e.target.value as any)}
          >
            <option value="large">Large</option>
            <option value="medium">Medium</option>
            <option value="small">Small</option>
          </select>

          <button
            className="bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-60"
            onClick={saveBoard}
            disabled={!canEdit || saving || !dirty}
            title={!canEdit ? "You have view-only access" : ""}
          >
            {saving ? "Saving..." : dirty ? "Save" : "Saved"}
          </button>
        </div>
      </div>

      {error ? <div className="text-red-600 text-sm mb-3">{error}</div> : null}

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
        <div className="border rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold">Roster</div>
            <button
              className="text-xs border rounded px-2 py-1"
              onClick={loadRoster}
              disabled={rosterLoading || !googleConfig}
              title={!googleConfig ? "Set Google Sheet on Team first" : ""}
            >
              {rosterLoading ? "Loading..." : "Load"}
            </button>
          </div>

          {!googleConfig ? (
            <div className="text-xs text-gray-500">
              No Google Sheet configured on this team. Go to the team page to set one.
            </div>
          ) : null}

          {rosterError ? <div className="text-xs text-red-600 mb-2">{rosterError}</div> : null}

          <div className="space-y-2 max-h-[calc(100vh-220px)] overflow-auto pr-1">
            {rosterPlayers.map((p) => (
              <div
                key={p.id || p.name}
                className="border rounded-lg p-2 bg-white cursor-grab active:cursor-grabbing"
                draggable={canEdit}
                onDragStart={(e) => {
                  if (!canEdit) return;
                  e.dataTransfer.setData(
                    dragMime,
                    JSON.stringify({
                      id: p.id || "",
                      name: p.name || "",
                      grade: p.grade || "",
                      returning: p.returning || "",
                      primary: p.primary || "",
                      likelihood: p.likelihood || "",
                      pos1: p.pos1 || "",
                      pos2: p.pos2 || "",
                      notes: p.notes || "",
                      pictureUrl: p.pictureUrl || "",
                    })
                  );
                }}
                title={!canEdit ? "View-only access" : "Drag to board"}
              >
                <div className="font-semibold text-sm">{p.name}</div>
                <div className="text-xs text-gray-500">Grade: {p.grade || "?"}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="border rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 p-2 border-b bg-white">
            <button
              className={`text-sm border rounded px-3 py-1 ${tool === "select" ? "bg-black text-white" : ""}`}
              onClick={() => setTool("select")}
              disabled={!canEdit}
            >
              Select
            </button>
            <button
              className={`text-sm border rounded px-3 py-1 ${tool === "lane" ? "bg-black text-white" : ""}`}
              onClick={() => setTool("lane")}
              disabled={!canEdit}
            >
              Lane
            </button>
            <button
              className={`text-sm border rounded px-3 py-1 ${tool === "text" ? "bg-black text-white" : ""}`}
              onClick={() => setTool("text")}
              disabled={!canEdit}
            >
              Text
            </button>
            <button
              className={`text-sm border rounded px-3 py-1 ${tool === "note" ? "bg-black text-white" : ""}`}
              onClick={() => setTool("note")}
              disabled={!canEdit}
            >
              Note
            </button>

            <div className="flex-1" />

            <label className={`text-xs border rounded px-3 py-2 ${!canEdit ? "opacity-50" : "cursor-pointer"}`}>
              Background
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={!canEdit}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onSelectBackgroundFile(f);
                  e.currentTarget.value = "";
                }}
              />
            </label>
          </div>

          <HtmlBoard
            editMode={canEdit}
            placed={placedPlayers}
            onPlacedChange={setPlacedPlayers}
            dragMime={dragMime}
            backgroundUrl={backgroundUrl || undefined}
            objects={boardObjects}
            onObjectsChange={setBoardObjects}
            tool={tool}
            onToolChange={setTool}
            cardSizeMode={cardSizeMode}
          />
        </div>
      </div>

      {/* Share modal */}
      {shareOpen ? (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={closeSharing}>
          <div
            className="bg-white w-full max-w-xl rounded-xl p-6"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold text-lg">Share Board</div>
              <button className="text-sm underline" onClick={closeSharing}>
                Close
              </button>
            </div>

            <div className="text-sm text-gray-600 mb-2">
              Add comma-separated emails to grant view access.
            </div>

            <textarea
              className="border rounded-md w-full px-3 py-2 text-sm h-24"
              value={shareEmailsText}
              onChange={(e) => setShareEmailsText(e.target.value)}
              placeholder="email1@example.com, email2@example.com"
            />

            <div className="flex items-center justify-end gap-2 mt-4">
              <button className="border rounded px-4 py-2 text-sm" onClick={closeSharing}>
                Cancel
              </button>
              <button
                className="bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-60"
                onClick={saveSharing}
                disabled={!canEdit || shareSaving}
                title={!canEdit ? "View-only access" : ""}
              >
                {shareSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}