import Link from "next/link";
import type { ReactNode } from "react";

/** Centered phone-width page container. */
export function Page({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <main className={`mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pb-10 pt-4 ${className}`}>
      {children}
    </main>
  );
}

/** Top bar with an optional back link. */
export function Header({
  title,
  back = "/",
  backLabel = "Home",
  right,
}: {
  title?: ReactNode;
  back?: string | null;
  backLabel?: string;
  right?: ReactNode;
}) {
  return (
    <header className="flex min-h-12 items-center gap-2">
      {back ? (
        <Link
          href={back}
          aria-label={backLabel}
          className="-ml-2 inline-flex min-h-12 min-w-12 items-center justify-center rounded-xl text-2xl text-indigo-700 hover:bg-indigo-50"
        >
          <span aria-hidden>‹</span>
        </Link>
      ) : null}
      <h1 className="flex-1 truncate text-xl font-bold tracking-tight">{title}</h1>
      {right}
    </header>
  );
}

export function PageSpinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-1 items-center justify-center p-10 text-slate-500" role="status">
      {label}
    </div>
  );
}
