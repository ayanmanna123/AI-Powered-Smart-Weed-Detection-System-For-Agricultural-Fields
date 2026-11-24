import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, RotateCcw, RotateCw, Square } from "lucide-react";

export function DPadControl({ onDirectionPress, onStop, activeDirection, disabled = false }) {
  const handlePress = (dir) => {
    if (disabled) return;
    onDirectionPress(dir);
  };

  const handleRelease = () => {
    if (disabled) return;
    onStop();
  };

  const getButtonClass = (dir) => {
    const isActive = activeDirection === dir;
    return `relative flex items-center justify-center rounded-xl font-bold transition-all select-none touch-none active:scale-95 border ${
      isActive
        ? "bg-emerald-500 text-zinc-950 border-emerald-300 shadow-lg shadow-emerald-500/40"
        : "bg-zinc-900 border-zinc-800 text-zinc-200 hover:bg-zinc-800 hover:border-zinc-700"
    } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`;
  };

  return (
    <div className="grid grid-cols-3 gap-2 w-64 h-64 p-2 bg-zinc-950/60 rounded-2xl border border-zinc-800/80 shadow-xl select-none">
      {/* Top Left: FWD_LEFT */}
      <button
        type="button"
        onPointerDown={() => handlePress("FWD_LEFT")}
        onPointerUp={handleRelease}
        onPointerCancel={handleRelease}
        className={getButtonClass("FWD_LEFT")}
        title="Forward Left (Q)"
      >
        <span className="text-xs font-mono">↖</span>
      </button>

      {/* Top: FORWARD */}
      <button
        type="button"
        onPointerDown={() => handlePress("FORWARD")}
        onPointerUp={handleRelease}
        onPointerCancel={handleRelease}
        className={getButtonClass("FORWARD")}
        title="Forward (W / Up)"
      >
        <ArrowUp className="size-6" />
      </button>

      {/* Top Right: FWD_RIGHT */}
      <button
        type="button"
        onPointerDown={() => handlePress("FWD_RIGHT")}
        onPointerUp={handleRelease}
        onPointerCancel={handleRelease}
        className={getButtonClass("FWD_RIGHT")}
        title="Forward Right (E)"
      >
        <span className="text-xs font-mono">↗</span>
      </button>

      {/* Center Left: SPIN_LEFT */}
      <button
        type="button"
        onPointerDown={() => handlePress("SPIN_LEFT")}
        onPointerUp={handleRelease}
        onPointerCancel={handleRelease}
        className={getButtonClass("SPIN_LEFT")}
        title="Spin Left (A / Left)"
      >
        <RotateCcw className="size-5" />
      </button>

      {/* Center: STOP */}
      <button
        type="button"
        onClick={handleRelease}
        className="flex items-center justify-center rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-400 hover:bg-rose-500 hover:text-white transition-all active:scale-90"
        title="Stop All Motors"
      >
        <Square className="size-5 fill-current" />
      </button>

      {/* Center Right: SPIN_RIGHT */}
      <button
        type="button"
        onPointerDown={() => handlePress("SPIN_RIGHT")}
        onPointerUp={handleRelease}
        onPointerCancel={handleRelease}
        className={getButtonClass("SPIN_RIGHT")}
        title="Spin Right (D / Right)"
      >
        <RotateCw className="size-5" />
      </button>

      {/* Bottom Left: REV_LEFT */}
      <button
        type="button"
        onPointerDown={() => handlePress("REV_LEFT")}
        onPointerUp={handleRelease}
        onPointerCancel={handleRelease}
        className={getButtonClass("REV_LEFT")}
        title="Reverse Left"
      >
        <span className="text-xs font-mono">↙</span>
      </button>

      {/* Bottom: BACKWARD */}
      <button
        type="button"
        onPointerDown={() => handlePress("BACKWARD")}
        onPointerUp={handleRelease}
        onPointerCancel={handleRelease}
        className={getButtonClass("BACKWARD")}
        title="Reverse (S / Down)"
      >
        <ArrowDown className="size-6" />
      </button>

      {/* Bottom Right: REV_RIGHT */}
      <button
        type="button"
        onPointerDown={() => handlePress("REV_RIGHT")}
        onPointerUp={handleRelease}
        onPointerCancel={handleRelease}
        className={getButtonClass("REV_RIGHT")}
        title="Reverse Right"
      >
        <span className="text-xs font-mono">↘</span>
      </button>
    </div>
  );
}
