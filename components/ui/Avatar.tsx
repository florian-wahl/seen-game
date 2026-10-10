const COLORS = [
  "bg-rose-200 text-rose-900",
  "bg-amber-200 text-amber-900",
  "bg-emerald-200 text-emerald-900",
  "bg-sky-200 text-sky-900",
  "bg-violet-200 text-violet-900",
  "bg-orange-200 text-orange-900",
];

function colorFor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

export function Avatar({
  name,
  url,
  size = 40,
}: {
  name: string;
  url?: string | null;
  size?: number;
}) {
  const style = { width: size, height: size, fontSize: size * 0.42 };
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element -- small remote avatar
    return <img src={url} alt="" style={style} className="shrink-0 rounded-full object-cover" />;
  }
  return (
    <span
      aria-hidden
      style={style}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold ${colorFor(name)}`}
    >
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}
