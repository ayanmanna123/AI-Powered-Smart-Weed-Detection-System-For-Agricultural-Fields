import { useState, useRef, useEffect, useCallback } from "react";
import { Compass } from "lucide-react";

/**
 * VirtualJoystick
 * Responsive pointer-captured analog thumbstick.
 * Normalizes input between -1.0 and +1.0 for x and y.
 * Guarantees stop signal on release by capturing pointer events globally.
 */
export function VirtualJoystick({ onMove, onStop, disabled = false, size = 220 }) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isActive, setIsActive] = useState(false);
  const containerRef = useRef(null);
  const radius = size / 2;
  const stickRadius = size / 5;
  const maxDistance = radius - stickRadius;

  const handlePointerDown = (e) => {
    if (disabled) return;
    setIsActive(true);
    e.target.setPointerCapture(e.pointerId);
    updateStick(e);
  };

  const handlePointerMove = (e) => {
    if (!isActive || disabled) return;
    updateStick(e);
  };

  const handlePointerUp = (e) => {
    if (!isActive) return;
    setIsActive(false);
    setPosition({ x: 0, y: 0 });
    try {
      e.target.releasePointerCapture(e.pointerId);
    } catch (err) {
      // Ignore pointer release errors
    }
    onStop();
  };

  const updateStick = useCallback(
    (e) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.left + radius;
      const centerY = rect.top + radius;

      let dx = e.clientX - centerX;
      let dy = e.clientY - centerY;

      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > maxDistance) {
        dx = (dx / dist) * maxDistance;
        dy = (dy / dist) * maxDistance;
      }

      setPosition({ x: dx, y: dy });

      // Normalized coordinates: x (-1 to +1), y (-1 for backward, +1 for forward)
      const normX = Number((dx / maxDistance).toFixed(3));
      const normY = Number((-dy / maxDistance).toFixed(3)); // Invert Y so up is +1

      onMove(normX, normY);
    },
    [maxDistance, onMove, radius]
  );

  return (
    <div className="flex flex-col items-center select-none">
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ width: size, height: size }}
        className={`relative rounded-full border-2 border-emerald-500/30 bg-radial from-zinc-900 to-zinc-950 shadow-2xl flex items-center justify-center cursor-grab active:cursor-grabbing touch-none transition-colors ${
          isActive ? "border-emerald-400 ring-4 ring-emerald-500/20" : ""
        } ${disabled ? "opacity-40 pointer-events-none" : ""}`}
      >
        {/* Outer Crosshairs */}
        <div className="absolute inset-x-4 top-1/2 h-px bg-zinc-800 -translate-y-1/2 pointer-events-none" />
        <div className="absolute inset-y-4 left-1/2 w-px bg-zinc-800 -translate-x-1/2 pointer-events-none" />

        {/* Deadzone visual circle */}
        <div
          style={{ width: size * 0.3, height: size * 0.3 }}
          className="absolute rounded-full border border-dashed border-zinc-700 pointer-events-none"
        />

        {/* Stick Thumb Handle */}
        <div
          style={{
            width: stickRadius * 2,
            height: stickRadius * 2,
            transform: `translate(${position.x}px, ${position.y}px)`,
          }}
          className={`absolute rounded-full shadow-lg border flex items-center justify-center transition-transform duration-75 ${
            isActive
              ? "bg-emerald-500 border-emerald-300 text-zinc-950 shadow-emerald-500/50 scale-105"
              : "bg-zinc-800 border-zinc-600 text-zinc-400 hover:border-zinc-400"
          }`}
        >
          <Compass className={`size-6 ${isActive ? "animate-spin text-zinc-950" : ""}`} />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3 text-xs font-mono text-zinc-400">
        <span>X: {((position.x / maxDistance) || 0).toFixed(2)}</span>
        <span className="text-zinc-600">|</span>
        <span>Y: {((-position.y / maxDistance) || 0).toFixed(2)}</span>
      </div>
    </div>
  );
}
