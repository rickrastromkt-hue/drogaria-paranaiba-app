/** Logo da Drogaria Paranaíba. "full" = logo completo, "icon" = só o coração. */
export function Logo({ variant = "full", className = "h-9" }: { variant?: "full" | "icon"; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={variant === "icon" ? "/icon.png" : "/logo.png"}
      alt="Drogaria Paranaíba"
      className={`${className} w-auto object-contain`}
    />
  );
}
