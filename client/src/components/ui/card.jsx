import { cn } from "@/lib/utils";

export function Card({ className, ...props }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-zinc-800 bg-zinc-950/80 backdrop-blur-md text-zinc-100 shadow-xl transition-all",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }) {
  return (
    <div className={cn("flex flex-col space-y-1.5 p-4 sm:p-5 border-b border-zinc-800/60", className)} {...props} />
  );
}

export function CardTitle({ className, ...props }) {
  return (
    <h3
      className={cn("text-base font-semibold leading-none tracking-tight text-zinc-100 flex items-center gap-2", className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }) {
  return (
    <p className={cn("text-xs text-zinc-400 leading-relaxed", className)} {...props} />
  );
}

export function CardContent({ className, ...props }) {
  return <div className={cn("p-4 sm:p-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }) {
  return (
    <div className={cn("flex items-center p-4 sm:p-5 pt-0 border-t border-zinc-800/40", className)} {...props} />
  );
}
