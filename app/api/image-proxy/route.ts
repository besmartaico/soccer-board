import { NextResponse } from "next/server";

function isSafeHttpUrl(raw: string) {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function isGoogleHost(hostname: string) {
  return (
    hostname === "drive.google.com" ||
    hostname.endsWith(".googleusercontent.com") ||
    hostname === "lh3.googleusercontent.com"
  );
}

function placeholderSvg(text: string) {
  const safe = text.replace(/[<>]/g, "");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
  <rect width="100%" height="100%" fill="#e5e7eb"/>
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
        font-family="Arial, sans-serif" font-size="14" fill="#374151">
    ${safe}
  </text>
</svg>`;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const targetRaw = (url.searchParams.get("url") ?? "").trim();

    if (!targetRaw) {
      return NextResponse.json({ error: "Missing url" }, { status: 400 });
    }
    if (!isSafeHttpUrl(targetRaw)) {
      return NextResponse.json({ error: "Invalid url" }, { status: 400 });
    }

    const target = new URL(targetRaw);

    const headers: Record<string, string> = {
      Accept: "image/*,*/*;q=0.8",
      "User-Agent": "SoccerBoardImageProxy/1.0",
    };

    if (isGoogleHost(target.hostname)) {
      headers.Referer = "https://drive.google.com/";
      headers.Origin = "https://drive.google.com";
    }

    const upstream = await fetch(target.toString(), {
      redirect: "follow",
      headers,
      cache: "no-store",
    });

    if (!upstream.ok) {
      const svg = placeholderSvg(String(upstream.status));
      return new Response(svg, {
        status: 200,
        headers: {
          "content-type": "image/svg+xml",
          "cache-control": "no-store, no-cache, must-revalidate",
          pragma: "no-cache",
        },
      });
    }

    const contentType = upstream.headers.get("content-type") ?? "image/*";
    const bytes = await upstream.arrayBuffer();

    return new Response(bytes, {
      status: 200,
      headers: {
        "content-type": contentType,
        "cache-control": "no-store, no-cache, must-revalidate",
        pragma: "no-cache",
      },
    });
  } catch (e: any) {
    console.error("[image-proxy] error", e);
    const svg = placeholderSvg("error");
    return new Response(svg, {
      status: 200,
      headers: {
        "content-type": "image/svg+xml",
        "cache-control": "no-store, no-cache, must-revalidate",
        pragma: "no-cache",
      },
    });
  }
}
