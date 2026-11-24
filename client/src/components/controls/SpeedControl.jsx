import { Gauge, Zap, Turtle, Rabbit } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";

export function SpeedControl({ maxSpeed, onSpeedChange, motorTelemetry, disabled = false }) {
  const presets = [
    { label: "Creep", value: 100, icon: Turtle },
    { label: "Field", value: 180, icon: Gauge },
    { label: "Turbo", value: 255, icon: Rabbit },
  ];

  return (
    <div className="space-y-4">
      {/* Speed Slider Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
          <Zap className="size-3.5 text-amber-400" />
          CHASSIS SPEED LIMIT
        </span>
        <span className="text-sm font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
          {maxSpeed} PWM ({Math.round((maxSpeed / 255) * 100)}%)
        </span>
      </div>

      {/* Slider */}
      <Slider
        value={maxSpeed}
        min={60}
        max={255}
        step={5}
        disabled={disabled}
        onChange={onSpeedChange}
      />

      {/* Quick Presets */}
      <div className="grid grid-cols-3 gap-2">
        {presets.map((preset) => {
          const Icon = preset.icon;
          const isSelected = maxSpeed === preset.value;
          return (
            <Button
              key={preset.label}
              variant={isSelected ? "default" : "outline"}
              size="sm"
              disabled={disabled}
              onClick={() => onSpeedChange(preset.value)}
              className={
                isSelected
                  ? "bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-bold"
                  : "border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:bg-zinc-800"
              }
            >
              <Icon className="size-3.5 mr-1" />
              {preset.label}
            </Button>
          );
        })}
      </div>

      {/* Live 4-Wheel Motor Breakdown */}
      {motorTelemetry && (
        <div className="pt-2 border-t border-zinc-800/60 grid grid-cols-2 gap-2 text-[11px] font-mono">
          <div className="bg-zinc-900/60 border border-zinc-800/60 rounded p-1.5 flex justify-between">
            <span className="text-zinc-500">FL (M4):</span>
            <span className="text-zinc-200">
              {motorTelemetry.m4?.speed} {motorTelemetry.m4?.dir}
            </span>
          </div>
          <div className="bg-zinc-900/60 border border-zinc-800/60 rounded p-1.5 flex justify-between">
            <span className="text-zinc-500">FR (M3):</span>
            <span className="text-zinc-200">
              {motorTelemetry.m3?.speed} {motorTelemetry.m3?.dir}
            </span>
          </div>
          <div className="bg-zinc-900/60 border border-zinc-800/60 rounded p-1.5 flex justify-between">
            <span className="text-zinc-500">RL (M2):</span>
            <span className="text-zinc-200">
              {motorTelemetry.m2?.speed} {motorTelemetry.m2?.dir}
            </span>
          </div>
          <div className="bg-zinc-900/60 border border-zinc-800/60 rounded p-1.5 flex justify-between">
            <span className="text-zinc-500">RR (M1):</span>
            <span className="text-zinc-200">
              {motorTelemetry.m1?.speed} {motorTelemetry.m1?.dir}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
