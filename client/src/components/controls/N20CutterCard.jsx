import { useState } from "react";
import { Scissors, Power, ArrowUp, ArrowDown, Square, Cpu, Sparkles } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function N20CutterCard({
  speed,
  direction,
  power,
  onControl,
  disabled = false,
}) {
  const [pulseActive, setPulseActive] = useState(false);

  const handlePulseCut = () => {
    if (disabled || pulseActive) return;
    setPulseActive(true);
    onControl("FORWARD", speed, true);
    setTimeout(() => {
      onControl("STOP", 0, true);
      setPulseActive(false);
    }, 2000);
  };

  const isCutting = direction === "FORWARD" || direction === "UP";
  const isRetracting = direction === "BACKWARD" || direction === "DOWN";

  return (
    <Card className="border-emerald-500/20 bg-zinc-950/80">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-bold text-emerald-400">
            <Scissors className="size-4" />
            TB6612FNG N20 WEEDING CUTTER
          </CardTitle>
          <Badge
            variant={!power ? "destructive" : isCutting ? "success" : isRetracting ? "secondary" : "outline"}
            className="text-[10px] font-mono"
          >
            {!power ? "STANDBY OFF" : direction}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-1">
        {/* Hardware Pin Status Info */}
        <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/60 border border-zinc-800/60 text-xs">
          <div className="flex items-center gap-2">
            <Cpu className="size-4 text-emerald-400" />
            <div>
              <div className="font-semibold text-zinc-200">TB6612 Driver (D1, D2, D4, D7)</div>
              <div className="text-[10px] text-zinc-400 font-mono">
                PWMA=D1 | AIN1=D2 | AIN2=D4 | STBY=D7
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-zinc-400 font-mono">STBY:</span>
            <Switch
              checked={power}
              disabled={disabled}
              onCheckedChange={(val) => onControl(direction, speed, val)}
            />
          </div>
        </div>

        {/* Direction Trigger Buttons */}
        <div className="grid grid-cols-3 gap-2">
          {/* Cutter Forward / Up */}
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || !power}
            onClick={() => onControl("FORWARD", speed, true)}
            className={`h-11 flex-col gap-1 ${
              isCutting
                ? "bg-emerald-500 text-zinc-950 font-bold border-emerald-400 shadow-md shadow-emerald-500/30"
                : "border-zinc-800 bg-zinc-900/60 text-zinc-200 hover:bg-zinc-800"
            }`}
          >
            <ArrowUp className="size-4" />
            <span className="text-[10px] font-mono">CUT / UP (U)</span>
          </Button>

          {/* Cutter Stop */}
          <Button
            variant="destructive"
            size="sm"
            disabled={disabled || !power}
            onClick={() => onControl("STOP", 0, true)}
            className="h-11 flex-col gap-1 bg-rose-500/15 border border-rose-500/30 text-rose-400 hover:bg-rose-500 hover:text-white"
          >
            <Square className="size-4 fill-current" />
            <span className="text-[10px] font-mono">STOP (K)</span>
          </Button>

          {/* Cutter Backward / Down */}
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || !power}
            onClick={() => onControl("BACKWARD", speed, true)}
            className={`h-11 flex-col gap-1 ${
              isRetracting
                ? "bg-sky-500 text-zinc-950 font-bold border-sky-400 shadow-md shadow-sky-500/30"
                : "border-zinc-800 bg-zinc-900/60 text-zinc-200 hover:bg-zinc-800"
            }`}
          >
            <ArrowDown className="size-4" />
            <span className="text-[10px] font-mono">REV / DOWN (J)</span>
          </Button>
        </div>

        {/* Speed Slider */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-400 font-medium">CUTTER RPM / PWM SPEED</span>
            <span className="font-mono text-emerald-400 font-bold">{speed} / 255</span>
          </div>
          <Slider
            value={speed}
            min={50}
            max={255}
            step={5}
            disabled={disabled || !power}
            onChange={(val) => {
              onControl(direction === "STOP" ? "STOP" : direction, val, power);
            }}
          />
        </div>

        {/* Action Macros */}
        <div className="flex items-center gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || !power || pulseActive}
            onClick={handlePulseCut}
            className="w-full border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs"
          >
            <Sparkles className="size-3.5 mr-1" />
            {pulseActive ? "CUTTING IN PROGRESS..." : "PRECISION WEED BURST (2s)"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
