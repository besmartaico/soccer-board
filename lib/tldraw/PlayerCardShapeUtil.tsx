// lib/tldraw/PlayerCardShapeUtil.tsx
import React from "react";
import {
  BaseBoxShapeUtil,
  HTMLContainer,
  Rectangle2d,
  resizeBox,
} from "tldraw";

function getInitials(name?: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  const out = `${first}${last}`.toUpperCase();
  return out || "?";
}

function buildTooltip(p: any) {
  const lines: string[] = [];
  if (p?.name) lines.push(p.name);
  lines.push(`Grade: ${p?.grade || "?"} | Returning: ${p?.returning || "?"}`);
  lines.push(`Pos: ${p?.pos1 || "?"}${p?.pos2 ? ` / ${p.pos2}` : ""}`);
  lines.push(
    `Primary: ${p?.primary || "?"} | Likelihood: ${p?.likelihood || "?"}`
  );
  if (p?.notes) lines.push(`Notes: ${String(p.notes).trim()}`);
  return lines.join("\n");
}

export class PlayerCardShapeUtil extends BaseBoxShapeUtil<any> {
  static override type = "player-card" as const;

  override getDefaultProps() {
    return {
      w: 280,
      h: 96,
      playerId: "",
      name: "Player",
      grade: "",
      returning: "",
      primary: "",
      likelihood: "",
      pos1: "",
      pos2: "",
      pictureUrl: "",
      notes: "",
    };
  }

  override getGeometry(shape: any) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    });
  }

  override component(shape: any) {
    const p = shape.props ?? {};
    const canPreview = !!p.pictureUrl;
    const tooltip = buildTooltip(p);

    return (
      <HTMLContainer
        title={tooltip}
        style={{
          width: p.w,
          height: p.h,
          borderRadius: 12,
          overflow: "hidden",
          background: "white",
          border: "1px solid rgba(0,0,0,0.18)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
        }}
      >
        <div style={{ display: "flex", height: "100%" }}>
          {/* Photo */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!canPreview) return;

              window.dispatchEvent(
                new CustomEvent("playerImagePreview", {
                  detail: { url: p.pictureUrl, name: p.name },
                })
              );
            }}
            title={canPreview ? "Click to enlarge" : "No photo"}
            style={{
              width: 88,
              height: "100%",
              borderRight: "1px solid rgba(0,0,0,0.08)",
              background: "#f3f4f6",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              padding: 0,
              cursor: canPreview ? "zoom-in" : "default",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* Fallback initials always behind */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#111827",
                color: "white",
                fontWeight: 800,
                fontSize: 18,
              }}
            >
              {getInitials(p.name)}
            </div>

            {p.pictureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.pictureUrl}
                alt={p.name ? `${p.name} photo` : "Player photo"}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
                onError={(e) => {
                  // hide image, show fallback initials
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            ) : null}
          </button>

          {/* Text */}
          <div style={{ padding: 10, flex: 1, minWidth: 0 }}>
            {/* Wrap name instead of forcing single-line ellipsis */}
            <div
              style={{
                fontWeight: 700,
                fontSize: 14,
                lineHeight: "18px",
                marginBottom: 4,
                whiteSpace: "normal",
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
              }}
            >
              {p.name}
            </div>

            <div style={{ fontSize: 12, color: "#374151", lineHeight: "16px" }}>
              {p.grade ? `Grade: ${p.grade}` : "Grade: ?"} {"  "}•{"  "}
              {p.pos1 ? `Pos: ${p.pos1}` : "Pos: ?"}
              {p.pos2 ? ` / ${p.pos2}` : ""} {"  "}•{"  "}
              {p.returning ? `Returning: ${p.returning}` : "Returning: ?"}
            </div>

            <div style={{ fontSize: 12, color: "#374151", lineHeight: "16px" }}>
              {p.primary ? `Primary: ${p.primary}` : "Primary: ?"} {"  "}•{"  "}
              {p.likelihood ? `Likelihood: ${p.likelihood}` : "Likelihood: ?"}
            </div>
          </div>
        </div>
      </HTMLContainer>
    );
  }

  override indicator(shape: any) {
    return <rect width={shape.props.w} height={shape.props.h} rx={12} ry={12} />;
  }

  // ✅ No TLOnResizeHandler typing — compatible across tldraw versions
  override onResize(shape: any, info: any) {
    return resizeBox(shape, info);
  }
}
