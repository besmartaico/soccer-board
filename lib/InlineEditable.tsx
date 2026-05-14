"use client";

import { useState, useRef, useEffect } from "react";

interface Props {
  value: string;
  canEdit: boolean;
  onSave: (newValue: string) => Promise<void> | void;
  // Optional styling overrides for the displayed name (matches surrounding context)
  style?: React.CSSProperties;
  // Optional placeholder text when value is empty
  placeholder?: string;
  // Optional max length
  maxLength?: number;
}

export default function InlineEditable({
  value,
  canEdit,
  onSave,
  style,
  placeholder = "…",
  maxLength = 80,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(value); }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  async function commit() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === value) {
      setEditing(false);
      setDraft(value);
      return;
    }
    setSaving(true);
    try {
      await onSave(trimmed);
      setEditing(false);
    } catch (e) {
      // Keep editing open so user can retry; reset to current saved value on cancel
      console.error("Inline rename failed:", e);
      alert("Failed to save: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  if (!editing) {
    return (
      <span
        onClick={canEdit ? (e) => {
          e.preventDefault();
          e.stopPropagation();
          setEditing(true);
        } : undefined}
        title={canEdit ? "Click to rename" : undefined}
        style={{
          ...style,
          cursor: canEdit ? "text" : style?.cursor,
          borderBottom: canEdit ? "1px dashed transparent" : style?.borderBottom,
          transition: "border-color 0.15s ease",
        }}
        onMouseEnter={canEdit ? (e) => {
          (e.currentTarget as HTMLElement).style.borderBottomColor = "#475569";
        } : undefined}
        onMouseLeave={canEdit ? (e) => {
          (e.currentTarget as HTMLElement).style.borderBottomColor = "transparent";
        } : undefined}
      >
        {value || placeholder}
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      value={draft}
      maxLength={maxLength}
      disabled={saving}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        else if (e.key === "Escape") { e.preventDefault(); cancel(); }
      }}
      onBlur={() => { if (!saving) commit(); }}
      style={{
        ...style,
        background: "rgba(255,255,255,0.06)",
        border: "1px solid #475569",
        borderRadius: 4,
        padding: "1px 6px",
        outline: "none",
        font: "inherit",
        color: style?.color ?? "#f1f5f9",
        width: Math.max(120, draft.length * 10 + 30),
      }}
    />
  );
}
