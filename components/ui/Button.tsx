import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const base =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 text-base font-semibold " +
  "transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-indigo-600 text-white shadow-sm hover:bg-indigo-700",
  secondary: "bg-white text-slate-900 ring-1 ring-slate-300 hover:bg-slate-50",
  danger: "bg-white text-red-700 ring-1 ring-red-300 hover:bg-red-50",
  ghost: "text-indigo-700 hover:bg-indigo-50",
};

export function buttonClass(variant: ButtonVariant = "primary", extra = "") {
  return `${base} ${variants[variant]} ${extra}`.trim();
}

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button type={type} className={buttonClass(variant, className)} {...props} />;
}

export function LinkButton({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}
