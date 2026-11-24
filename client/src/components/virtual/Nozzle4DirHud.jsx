import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Droplets, Cpu } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Nozzle4DirHud
 *
 * Visualizes how 4-direction nozzle positioning is achieved by combining:
 *  - Rover 4WD Wheels: UP (Forward) & DOWN (Reverse) along the 1D track
 *  - TB6612FNG N20 Motor: LEFT & RIGHT across the row rail
 */
export function Nozzle4DirHud({
  botCm,
  nozzleCm,
  nozzleX,
  driveState,
  n20State,
  isSpraying,
}) {
  const isUp = driveState === "FORWARD";
  const isDown = driveState === "REVERSE";
  const isLeft = n20State === "LEFT";
  const isRight = n20State === "RIGHT";

  // Map nozzleX (-1..+1) -> 15%..85% inside the mini XY crosshair box
  const dotX = 50 + nozzleX * 36;
  // Map micro offset within current 30 cm section
  const zoneOffset = ((nozzleCm % 30) / 30) * 60 + 20;

  return (
    <Card className="border-zinc-800 bg-zinc-950/80">
      <CardContent className="space-y-3 pt-4">
        {/* 4-Way Direction Cross + Live XY Stage */}
        <div className="grid grid-cols-2 gap-3 items-center">
          {/* 4-Direction Actuator Indicators */}
          <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono">
            <div />
            <div
              className={`h-10 rounded-lg border flex flex-col items-center justify-center transition-all ${
                isUp
                  ? "bg-emerald-500 text-zinc-950 border-emerald-300 font-bold shadow-md shadow-emerald-500/30"
                  : "bg-zinc-900/70 border-zinc-800 text-zinc-400"
              }`}
            >
              <ArrowUp className="size-3.5" />
              <span>FWD</span>
            </div>
            <div />

            <div
              className={`h-10 rounded-lg border flex flex-col items-center justify-center transition-all ${
                isLeft
                  ? "bg-sky-500 text-zinc-950 border-sky-300 font-bold shadow-md shadow-sky-500/30"
                  : "bg-zinc-900/70 border-zinc-800 text-zinc-400"
              }`}
            >
              <ArrowLeft className="size-3.5" />
              <span>N20 L</span>
            </div>

            <div
              className={`h-10 rounded-lg border flex flex-col items-center justify-center transition-all ${
                isSpraying
                  ? "bg-cyan-500 text-zinc-950 border-cyan-300 font-bold animate-pulse"
                  : "bg-zinc-900 border-zinc-700 text-zinc-300"
              }`}
            >
              <Droplets className="size-3.5" />
              <span>{isSpraying ? "SPRAY" : "IDLE"}</span>
            </div>

            <div
              className={`h-10 rounded-lg border flex flex-col items-center justify-center transition-all ${
                isRight
                  ? "bg-sky-500 text-zinc-950 border-sky-300 font-bold shadow-md shadow-sky-500/30"
                  : "bg-zinc-900/70 border-zinc-800 text-zinc-400"
              }`}
            >
              <ArrowRight className="size-3.5" />
              <span>N20 R</span>
            </div>

            <div />
            <div
              className={`h-10 rounded-lg border flex flex-col items-center justify-center transition-all ${
                isDown
                  ? "bg-amber-500 text-zinc-950 border-amber-300 font-bold shadow-md shadow-amber-500/30"
                  : "bg-zinc-900/70 border-zinc-800 text-zinc-400"
              }`}
            >
              <ArrowDown className="size-3.5" />
              <span>REV</span>
            </div>
            <div />
          </div>

          {/* Live 2D Nozzle Position Pad */}
          <div className="relative h-32 rounded-xl bg-zinc-900 border border-zinc-800 overflow-hidden">
            <div className="absolute inset-x-0 top-1/2 h-px bg-zinc-800" />
            <div className="absolute inset-y-0 left-1/2 w-px bg-zinc-800" />
            <div className="absolute top-1 left-2 text-[9px] font-mono text-zinc-500">
              NOZZLE XY
            </div>
            <div className="absolute bottom-1 right-2 text-[9px] font-mono text-sky-400">
              X:{Math.round(nozzleX * 100)}% Y:{nozzleCm.toFixed(1)}cm
            </div>

            {/* Nozzle Crosshair Dot */}
            <div
              style={{
                left: `${dotX}%`,
                bottom: `${Math.max(12, Math.min(88, zoneOffset))}%`,
              }}
              className={`absolute -translate-x-1/2 translate-y-1/2 w-4 h-4 rounded-full border-2 transition-all duration-100 ${
                isSpraying
                  ? "bg-cyan-400 border-white scale-125 shadow-lg shadow-cyan-400/50"
                  : "bg-emerald-400/30 border-emerald-400"
              }`}
            />
          </div>
        </div>

        {/* Motor Mapping Explanation */}
        <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
          <div className="p-2 rounded-lg bg-zinc-900/60 border border-zinc-800/80">
            <div className="text-emerald-400 font-bold flex items-center gap-1">
              <Cpu className="size-3" />
              <span>4WD WHEELS (2-DIR)</span>
            </div>
            <div className="text-zinc-400 mt-0.5">
              State: <span className="text-zinc-200">{driveState}</span> | {botCm.toFixed(1)} cm
            </div>
          </div>
          <div className="p-2 rounded-lg bg-zinc-900/60 border border-zinc-800/80">
            <div className="text-sky-400 font-bold flex items-center gap-1">
              <Cpu className="size-3" />
              <span>N20 MOTOR (2-DIR)</span>
            </div>
            <div className="text-zinc-400 mt-0.5">
              State: <span className="text-zinc-200">{n20State}</span> | {Math.round(nozzleX * 100)}%
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
