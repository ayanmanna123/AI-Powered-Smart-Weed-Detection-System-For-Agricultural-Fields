import { cn } from "@/lib/utils";

export function Badge({ className, variant = "default", children, ...props }) {
  const variants = {
    default: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    success: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    warning: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    destructive: "bg-rose-500/15 text-rose-400 border-rose-500/30",
    outline: "border-zinc-700 text-zinc-300 bg-zinc-900/40",
    secondary: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-wide transition-colors",
        variants[variant] || variants.default,
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
