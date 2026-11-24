import { cn } from "@/lib/utils";

export function Slider({
  value = 200,
  min = 0,
  max = 255,
  step = 1,
  onChange,
  className,
  disabled = false,
  ...props
}) {
  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div className={cn("relative flex w-full touch-none select-none items-center py-2", className)}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange && onChange(Number(e.target.value))}
        className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 focus:outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: `linear-gradient(to right, #10b981 0%, #10b981 ${percentage}%, #27272a ${percentage}%, #27272a 100%)`,
        }}
        {...props}
      />
    </div>
  );
}
