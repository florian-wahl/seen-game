import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "light";

const base =
  "inline-flex min-h-12 items-center justify-center gap-2 px-5 text-base transition active:scale-[0.98] " +
  "disabled:cursor-not-allowed disabled:opacity-50 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mustard";

const pill = "min-h-14 rounded-full font-wide font-black uppercase tracking-wide";

const variants: Record<ButtonVariant, string> = {
  primary: `${pill} bg-mustard text-ink hover:brightness-105`,
  secondary: `${pill} bg-transparent text-cream shadow-[inset_0_0_0_2px_var(--color-line-strong)] hover:bg-raised`,
  danger: "rounded-full bg-transparent font-bold text-[#f08aba] hover:bg-raised",
  ghost: "rounded-full font-bold text-cream hover:bg-raised",
  light: `${pill} bg-cream text-ink hover:brightness-95`,
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
