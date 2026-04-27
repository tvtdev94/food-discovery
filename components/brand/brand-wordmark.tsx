"use client";

import { cn } from "@/lib/utils";

interface BrandWordmarkProps {
  onClick?: () => void;
  /** Font-size class (Tailwind). Default xl. */
  sizeClass?: string;
  className?: string;
}

/**
 * "ĂnGì" brand wordmark — solid primary cam cháy (readable trên mọi bg).
 * Clickable when onClick passed; plain span otherwise.
 * aria-label explicit để screen reader đọc liền "ĂnGì" thay vì "Ăn Gì".
 */
export function BrandWordmark({
  onClick,
  sizeClass = "text-xl",
  className,
}: BrandWordmarkProps) {
  const textClasses = cn(
    "font-display font-semibold tracking-tight leading-none select-none text-primary",
    sizeClass,
    className,
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label="ĂnGì — về trang chủ"
        className={cn(
          textClasses,
          "transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md",
        )}
      >
        ĂnGì
      </button>
    );
  }

  return (
    <span aria-label="ĂnGì" className={textClasses}>
      ĂnGì
    </span>
  );
}
