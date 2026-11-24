import { useState, useEffect } from "react";
import { Camera, Crosshair, Sparkles, RefreshCw, AlertCircle, Eye } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function LiveCameraFeed({ streamUrl, defaultActive = true }) {
  const [streamActive, setStreamActive] = useState(defaultActive);
  const [detectedTargets, setDetectedTargets] = useState([
    { id: 1, label: "Broadleaf Weed", conf: 0.94, x: 38, y: 42, w: 22, h: 26, type: "weed" },
    { id: 2, label: "Yellow Nutsedge", conf: 0.88, x: 68, y: 25, w: 18, h: 20, type: "weed" },
    { id: 3, label: "Crop Plant", conf: 0.97, x: 15, y: 60, w: 25, h: 30, type: "crop" },
  ]);

  // Subtle simulated AI detection target movement
  useEffect(() => {
    const interval = setInterval(() => {
      setDetectedTargets((prev) =>
        prev.map((t) => ({
          ...t,
          x: Math.min(80, Math.max(10, t.x + (Math.random() - 0.5) * 1.5)),
          y: Math.min(80, Math.max(15, t.y + (Math.random() - 0.5) * 1.5)),
          conf: Math.min(0.99, Math.max(0.82, t.conf + (Math.random() - 0.5) * 0.02)),
        }))
      );
    }, 1500);

    return () => clearInterval(interval);
  }, []);

  return (
    <Card className="border-zinc-800 bg-zinc-950/80 overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-bold text-zinc-100 flex items-center gap-2">
            <Camera className="size-4 text-emerald-400" />
            AI WEED VISION STREAM
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="success" className="text-[10px] animate-pulse">
              LIVE YOLOv8 WEED DETECT
            </Badge>
            <Button
              variant="outline"
              size="xs"
              onClick={() => setStreamActive(!streamActive)}
              className="border-zinc-800 text-zinc-400"
            >
              <Eye className="size-3 mr-1" />
              {streamActive ? "Overlay ON" : "Overlay OFF"}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="relative aspect-video w-full bg-zinc-900 flex items-center justify-center overflow-hidden border-t border-zinc-800">
          {streamUrl ? (
            <img
              src={streamUrl}
              alt="ESP32-CAM Feed"
              className="w-full h-full object-cover"
              onError={(e) => {
                e.target.style.display = "none";
              }}
            />
          ) : (
            // High-tech Simulated HUD View
            <div className="absolute inset-0 bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 flex flex-col items-center justify-center">
              {/* Field Matrix Grid Background */}
              <div
                className="absolute inset-0 opacity-15"
                style={{
                  backgroundImage:
                    "linear-gradient(to right, #10b981 1px, transparent 1px), linear-gradient(to bottom, #10b981 1px, transparent 1px)",
                  backgroundSize: "32px 32px",
                }}
              />

              {/* Center Crosshair */}
              <div className="relative z-10 flex flex-col items-center pointer-events-none">
                <Crosshair className="size-16 text-emerald-500/40 animate-pulse stroke-1" />
                <span className="text-[11px] font-mono text-emerald-500/80 tracking-widest mt-1">
                  TARGETING ACTIVE
                </span>
              </div>
            </div>
          )}

          {/* AI Bounding Boxes Overlay */}
          {streamActive &&
            detectedTargets.map((target) => {
              const isWeed = target.type === "weed";
              return (
                <div
                  key={target.id}
                  style={{
                    left: `${target.x}%`,
                    top: `${target.y}%`,
                    width: `${target.w}%`,
                    height: `${target.h}%`,
                  }}
                  className={`absolute rounded transition-all duration-700 border-2 pointer-events-none ${
                    isWeed
                      ? "border-rose-500 bg-rose-500/10 shadow-lg shadow-rose-500/20"
                      : "border-emerald-500 bg-emerald-500/10"
                  }`}
                >
                  <div
                    className={`absolute -top-5 left-0 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-tight text-white whitespace-nowrap ${
                      isWeed ? "bg-rose-600" : "bg-emerald-600"
                    }`}
                  >
                    {target.label} ({Math.round(target.conf * 100)}%)
                  </div>
                </div>
              );
            })}

          {/* Top-Right HUD Badge */}
          <div className="absolute top-2 right-2 flex flex-col gap-1 items-end pointer-events-none">
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-950/80 border border-zinc-700 text-zinc-300">
              FPS: 30.2 | RES: 1080p
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-rose-300">
              2 WEEDS IN RANGE
            </span>
          </div>

          {/* Bottom HUD Coordinates */}
          <div className="absolute bottom-2 left-2 text-[10px] font-mono text-emerald-400 bg-zinc-950/80 border border-zinc-800 px-2 py-0.5 rounded pointer-events-none">
            GPS: 22.5726° N, 88.3639° E | FIELD ZONE: A-4
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
