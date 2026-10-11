const COLORS = [
  "bg-[#e0559a]",
  "bg-[#8fd0f5]",
  "bg-[#9bc53d]",
  "bg-[#ffb074]",
  "bg-[#2aa7a0]",
  "bg-[#b9a6ee]",
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
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-black text-ink ${colorFor(name)}`}
    >
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}
