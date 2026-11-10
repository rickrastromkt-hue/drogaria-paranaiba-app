"use client";

import { useState } from "react";

const COLORS = ["bg-emerald-100 text-emerald-700", "bg-sky-100 text-sky-700", "bg-amber-100 text-amber-700", "bg-violet-100 text-violet-700", "bg-rose-100 text-rose-700", "bg-teal-100 text-teal-700"];

export function Avatar({ name, photo, size = 40 }: { name: string; photo?: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  const initials = (name || "?")
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase() || "?";
  const color = COLORS[(name || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
  const style = { width: size, height: size, fontSize: size * 0.38 };
  if (photo && !failed)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photo} alt="" style={style} className="shrink-0 rounded-full object-cover" onError={() => setFailed(true)} />;
  return (
    <div style={style} className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${color}`}>
      {initials}
    </div>
  );
}
