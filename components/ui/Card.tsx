import type { HTMLAttributes } from "react";

export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-3xl bg-surface p-4 text-cream ${className}`} {...props} />;
}

export function ErrorNote({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="rounded-2xl bg-surface px-4 py-3 text-sm text-cream shadow-[inset_0_0_0_2px_var(--color-magenta)]"
    >
      {children}
    </p>
  );
}
