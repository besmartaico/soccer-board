import { useEffect, useState } from "react";

export function useImage(url?: string) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "loaded" | "error">(
    url ? "loading" : "idle"
  );

  useEffect(() => {
    if (!url) {
      setImage(null);
      setStatus("idle");
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";

    setStatus("loading");

    img.onload = () => {
      if (cancelled) return;
      setImage(img);
      setStatus("loaded");
    };

    img.onerror = () => {
      if (cancelled) return;
      setImage(null);
      setStatus("error");
    };

    img.src = url;

    return () => {
      cancelled = true;
    };
  }, [url]);

  return { image, status };
}
