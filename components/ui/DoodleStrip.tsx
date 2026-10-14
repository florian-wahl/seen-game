/** Decorative paper panel of scattered, rotated library doodles. */
const DEFAULT_DOODLES: { file: string; left: number; top: number; size: number; rot: number }[] = [
  { file: "teapot", left: 2, top: 12, size: 0.62, rot: -12 },
  { file: "disco-ball", left: 17, top: 48, size: 0.5, rot: 9 },
  { file: "pineapple", left: 30, top: 6, size: 0.6, rot: 14 },
  { file: "bus", left: 44, top: 46, size: 0.52, rot: -7 },
  { file: "acorn", left: 56, top: 8, size: 0.48, rot: 18 },
  { file: "guitar", left: 68, top: 44, size: 0.62, rot: -16 },
  { file: "cooler", left: 80, top: 6, size: 0.5, rot: 8 },
  { file: "cactus", left: 88, top: 50, size: 0.5, rot: -10 },
  { file: "airplane", left: 8, top: 62, size: 0.4, rot: 22 },
];

export function DoodleStrip({
  height = 140,
  className = "",
  seed = 0,
  files,
}: {
  height?: number;
  className?: string;
  /** Shifts the rotations a little so two strips do not look identical. */
  seed?: number;
  /** Optional fixed list of library file names (without extension), laid out in order. */
  files?: string[];
}) {
  const items = files
    ? files.map((file, i) => ({ ...DEFAULT_DOODLES[i % DEFAULT_DOODLES.length], file }))
    : DEFAULT_DOODLES;
  return (
    <div aria-hidden className={`relative overflow-hidden bg-paper ${className}`} style={{ height }}>
      {items.map((d, i) => {
        // Doodles stay picture-sized (the prototype's ~55–80px) however tall the strip is.
        const px = Math.round(Math.min(height * d.size, 56 + d.size * 40));
        const rot = d.rot + (((seed + i) * 7) % 11) - 5;
        return (
          // eslint-disable-next-line @next/next/no-img-element -- decorative static SVG
          <img
            key={`${d.file}-${i}`}
            src={`/library/v2/${d.file}.svg`}
            alt=""
            aria-hidden
            width={px}
            height={px}
            draggable={false}
            className="absolute select-none"
            style={{
              left: `${d.left}%`,
              top: `${d.top}%`,
              width: px,
              height: px,
              transform: `rotate(${rot}deg)`,
            }}
          />
        );
      })}
    </div>
  );
}
