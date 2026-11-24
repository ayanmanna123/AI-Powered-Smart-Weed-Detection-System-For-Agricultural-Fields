import { Camera, RefreshCw, Sparkles, Crosshair } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

/**
 * VirtualCameraHud
 *
 * Displays the live 10 cm zone snapshot analyzed by YOLOv8 (best.pt) or the
 * built-in Virtual Vision fallback, along with bounding-box detection coordinates.
 */
export function VirtualCameraHud({
  yoloServerUrl,
  onChangeYoloUrl,
  yoloHealth,
  onCheckYolo,
  yoloConf,
  onChangeYoloConf,
  cameraFrameUrl,
  visionSource, // "yolo" | "fallback" | null
  lastDetections,
  lastLatencyMs,
  activeZone,
}) {
  const isYoloOnline = Boolean(yoloHealth?.online);

  return (
    <Card className="border-zinc-800 bg-zinc-950/80 overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-xs font-bold text-zinc-100 flex items-center gap-2">
            <Camera className="size-4 text-emerald-400" />
            10 CM AI CAMERA & YOLOv8
          </CardTitle>

          <div className="flex items-center gap-1.5">
            <Badge
              variant={isYoloOnline ? "success" : "warning"}
              className="text-[10px] font-mono"
            >
              {isYoloOnline
                ? `YOLO ${yoloHealth.model_name || "best.pt"} ONLINE`
                : "FALLBACK VISION"}
            </Badge>
            <Button
              variant="outline"
              size="icon-xs"
              onClick={onCheckYolo}
              title="Re-check Python YOLOv8 Server"
              className="border-zinc-700 text-zinc-300"
            >
              <RefreshCw className="size-3" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pt-1">
        {/* Annotated Frame Preview */}
        <div className="relative aspect-square max-h-60 w-full mx-auto rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 flex items-center justify-center">
          {cameraFrameUrl ? (
            <img
              src={cameraFrameUrl}
              alt="10 cm Zone AI Camera View"
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="flex flex-col items-center gap-1.5 text-zinc-500 text-xs font-mono">
              <Crosshair className="size-10 text-emerald-500/30" />
              <span>Press RUN to capture 10 cm zones</span>
            </div>
          )}

          {visionSource && (
            <div className="absolute top-2 right-2 flex items-center gap-1.5">
              <span
                className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold border ${
                  visionSource === "yolo"
                    ? "bg-emerald-500/20 border-emerald-400/50 text-emerald-300"
                    : "bg-amber-500/20 border-amber-400/50 text-amber-300"
                }`}
              >
                {visionSource === "yolo" ? "REAL YOLOv8" : "SIM FALLBACK"}
                {lastLatencyMs ? ` • ${Math.round(lastLatencyMs)}ms` : ""}
              </span>
            </div>
          )}

          {activeZone && (
            <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-zinc-950/85 border border-zinc-700 text-[10px] font-mono text-emerald-300">
              BAY: {activeZone.startCm}–{activeZone.endCm} cm
            </div>
          )}
        </div>

        {/* Detected Objects in Current Zone */}
        <div className="space-y-1">
          <div className="text-[10px] font-mono text-zinc-400 flex items-center justify-between">
            <span>CURRENT ZONE DETECTIONS ({lastDetections.length})</span>
            <span className="flex items-center gap-1 text-emerald-400">
              <Sparkles className="size-3" />
              <span>best.pt</span>
            </span>
          </div>

          {lastDetections.length === 0 ? (
            <div className="p-2 rounded-lg bg-zinc-900/50 border border-zinc-800/70 text-[11px] font-mono text-zinc-500">
              No weeds/crops detected in active zone yet.
            </div>
          ) : (
            <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
              {lastDetections.map((det, idx) => {
                const isWeed = det.class === "weed";
                return (
                  <div
                    key={`${det.class}-${idx}`}
                    className={`flex items-center justify-between px-2 py-1 rounded border text-[10px] font-mono ${
                      isWeed
                        ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
                        : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                    }`}
                  >
                    <span className="font-bold">
                      {isWeed ? "🎯 WEED" : "🛡️ CROP"} ({Math.round(det.confidence * 100)}%)
                    </span>
                    <span className="text-zinc-300">
                      X:{det.center_x} Y:{det.center_y}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* YOLO Server Config */}
        <div className="pt-2 border-t border-zinc-800/80 space-y-2 text-[10px] font-mono">
          <div className="flex items-center gap-2">
            <label className="text-zinc-400 shrink-0">YOLO API:</label>
            <input
              type="text"
              value={yoloServerUrl}
              onChange={(e) => onChangeYoloUrl(e.target.value)}
              className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-zinc-200 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-zinc-400">CONF THRESHOLD: {yoloConf.toFixed(2)}</span>
            <div className="w-32">
              <Slider
                value={Math.round(yoloConf * 100)}
                min={15}
                max={85}
                step={5}
                onChange={(v) => onChangeYoloConf(v / 100)}
              />
            </div>
          </div>

          {!isYoloOnline && (
            <div className="p-2 rounded bg-zinc-900/70 border border-zinc-800 text-zinc-400 leading-relaxed">
              Run <code className="text-emerald-400">python src/virtual_demo_server.py</code> inside{" "}
              <code className="text-zinc-300">python/</code> to enable live{" "}
              <code className="text-emerald-400">best.pt</code> inference (fallback works offline).
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
