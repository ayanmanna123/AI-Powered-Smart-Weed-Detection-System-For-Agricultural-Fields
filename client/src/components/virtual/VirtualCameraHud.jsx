import { useRef, useState } from "react";
import {
  RefreshCw,
  Sparkles,
  Crosshair,
  Upload,
  Download,
  Code2,
  ShieldCheck,
  Columns2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

/**
 * VirtualCameraHud
 *
 * Displays the raw captured 10 cm zone frame side-by-side with the live
 * YOLOv8 (best.pt) server output, raw Python JSON response, Strict YOLO toggle,
 * and a "Test Any Photo" uploader so anyone can verify real inference.
 */
export function VirtualCameraHud({
  yoloServerUrl,
  onChangeYoloUrl,
  yoloHealth,
  onCheckYolo,
  yoloConf,
  onChangeYoloConf,
  strictYoloOnly,
  onToggleStrictYolo,
  rawFrameUrl,
  cameraFrameUrl,
  visionSource, // "yolo" | "fallback" | null
  lastDetections,
  lastLatencyMs,
  lastYoloProof, // { frame_id, timestamp, image_bytes, model_path, model_name, image_width, image_height, detections }
  activeZone,
  onTestCustomPhoto,
}) {
  const isYoloOnline = Boolean(yoloHealth?.online);
  const fileInputRef = useRef(null);
  const [showSplitProof, setShowSplitProof] = useState(true);
  const [showJsonProof, setShowJsonProof] = useState(false);
  const [testingPhoto, setTestingPhoto] = useState(false);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !onTestCustomPhoto) return;
    setTestingPhoto(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        if (typeof reader.result === "string") {
          await onTestCustomPhoto(reader.result, file.name);
        }
        setTestingPhoto(false);
      };
      reader.onerror = () => setTestingPhoto(false);
      reader.readAsDataURL(file);
    } catch {
      setTestingPhoto(false);
    } finally {
      e.target.value = "";
    }
  };

  return (
    <Card className="border-zinc-800 bg-zinc-950/80 overflow-hidden">
      <CardContent className="space-y-3 pt-4">
        {/* Action Bar: Split Raw/YOLO View + Test Any Real Photo + Refresh */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono">
          <button
            type="button"
            onClick={() => setShowSplitProof((v) => !v)}
            className={`flex items-center gap-1 px-2 py-1 rounded border transition-colors ${
              showSplitProof
                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Columns2 className="size-3" />
            <span>{showSplitProof ? "Raw + YOLO Split" : "Output Only"}</span>
          </button>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon-xs"
              onClick={onCheckYolo}
              title="Re-check Python YOLOv8 Server"
              className="border-zinc-700 text-zinc-300"
            >
              <RefreshCw className="size-3" />
            </Button>
            {rawFrameUrl && (
              <a
                href={rawFrameUrl}
                download={`raw-capture-${lastYoloProof?.frame_id || "bay"}.jpg`}
                className="flex items-center gap-1 px-2 py-1 rounded border border-zinc-700 bg-zinc-900 text-zinc-300 hover:text-white"
                title="Download the unannotated raw JPEG sent to Python YOLOv8"
              >
                <Download className="size-3" />
                <span>Raw JPG</span>
              </a>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <Button
              variant="outline"
              size="xs"
              disabled={testingPhoto}
              onClick={() => fileInputRef.current?.click()}
              className="border-sky-500/40 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 h-6"
              title="Upload any external weed/crop photo to prove live YOLOv8 best.pt processing"
            >
              <Upload className="size-3" />
              <span>{testingPhoto ? "Detecting..." : "Test Real Photo"}</span>
            </Button>
          </div>
        </div>

        {/* Raw Captured Frame vs Annotated YOLOv8 Output */}
        {showSplitProof && rawFrameUrl && cameraFrameUrl ? (
          <div className="grid grid-cols-2 gap-2">
            {/* Raw Input sent to Python */}
            <div className="relative aspect-square rounded-lg overflow-hidden bg-zinc-900 border border-zinc-800">
              <img
                src={rawFrameUrl}
                alt="Raw Unannotated Input"
                className="w-full h-full object-contain"
              />
              <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-zinc-950/85 border border-zinc-700 text-[8px] font-mono text-zinc-300">
                1. RAW INPUT
              </span>
              {activeZone && (
                <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-zinc-950/85 border border-zinc-700 text-[8px] font-mono text-zinc-300">
                  {activeZone.startCm}–{activeZone.endCm}cm
                </span>
              )}
            </div>

            {/* YOLOv8 Processed Output */}
            <div className="relative aspect-square rounded-lg overflow-hidden bg-zinc-900 border border-emerald-500/40">
              <img
                src={cameraFrameUrl}
                alt="YOLOv8 Annotated Output"
                className="w-full h-full object-contain"
              />
              <span
                className={`absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[8px] font-mono font-bold border ${
                  visionSource === "yolo"
                    ? "bg-emerald-500/25 border-emerald-400/60 text-emerald-200"
                    : "bg-amber-500/25 border-amber-400/60 text-amber-200"
                }`}
              >
                {visionSource === "yolo"
                  ? `2. YOLO #${lastYoloProof?.frame_id ?? ""}`
                  : "2. FALLBACK"}
              </span>
              {lastLatencyMs !== null && lastLatencyMs !== undefined && (
                <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-zinc-950/85 border border-zinc-700 text-[8px] font-mono text-emerald-300">
                  {Math.round(lastLatencyMs)}ms
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="relative aspect-square max-h-56 w-full mx-auto rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 flex items-center justify-center">
            {cameraFrameUrl ? (
              <img
                src={cameraFrameUrl}
                alt="10 cm Zone AI Camera View"
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-1.5 text-zinc-500 text-xs font-mono text-center px-4">
                <Crosshair className="size-10 text-emerald-500/30" />
                <span>Press RUN or click &quot;Test Real Photo&quot;</span>
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
                  {visionSource === "yolo"
                    ? `REAL YOLOv8 #${lastYoloProof?.frame_id ?? ""}`
                    : "SIM FALLBACK"}
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
        )}

        {/* Strict Real YOLOv8 Toggle + Live Server Proof */}
        <div className="p-2 rounded-lg bg-zinc-900/70 border border-zinc-800 space-y-1.5 text-[10px] font-mono">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-zinc-200">
              <ShieldCheck className="size-3.5 text-emerald-400" />
              <span>Strict Real YOLO Only (No Fallback)</span>
            </div>
            <Switch checked={strictYoloOnly} onCheckedChange={onToggleStrictYolo} />
          </div>

          {lastYoloProof && (
            <div className="flex flex-wrap items-center justify-between gap-1 text-[9px] text-zinc-400 pt-1 border-t border-zinc-800/70">
              <span className="truncate">
                Frame #{lastYoloProof.frame_id} •{" "}
                {(lastYoloProof.image_bytes / 1024).toFixed(1)} KB •{" "}
                {lastYoloProof.model_name}
              </span>
              <button
                type="button"
                onClick={() => setShowJsonProof((v) => !v)}
                className="flex items-center gap-1 text-sky-400 hover:text-sky-300 shrink-0"
              >
                <Code2 className="size-3" />
                <span>{showJsonProof ? "Hide JSON" : "Raw JSON"}</span>
              </button>
            </div>
          )}

          {showJsonProof && lastYoloProof && (
            <pre className="max-h-36 overflow-auto p-2 rounded bg-zinc-950 border border-zinc-800 text-[9px] text-emerald-300 leading-tight">
              {JSON.stringify(
                {
                  frame_id: lastYoloProof.frame_id,
                  timestamp: lastYoloProof.timestamp,
                  model_path: lastYoloProof.model_path,
                  input_size: `${lastYoloProof.image_width}x${lastYoloProof.image_height}`,
                  image_bytes: lastYoloProof.image_bytes,
                  latency_ms: lastYoloProof.latency_ms,
                  detections: lastYoloProof.detections,
                },
                null,
                2
              )}
            </pre>
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
              <code className="text-emerald-400">best.pt</code> inference.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
