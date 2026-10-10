import type { HTMLAttributes } from "react";

export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 ${className}`}
      {...props}
    />
  );
}

export function ErrorNote({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-200">
      {children}
    </p>
  );
}
