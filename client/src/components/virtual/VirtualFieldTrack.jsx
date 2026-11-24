import { useRef, useState } from "react";
import {
  Crosshair,
  Droplets,
  ShieldCheck,
  Trash2,
  ArrowUp,
  ArrowDown,
  MoveHorizontal,
  ScanLine,
} from "lucide-react";

/**
 * VirtualFieldTrack
 *
 * Interactive 1D straight agricultural row (0 cm at bottom -> trackLengthCm at top).
 * - Supports HTML5 drag-and-drop from the plant palette
 * - Supports click-to-place when a palette item is selected
 * - Supports pointer dragging existing plants to reposition them
 * - Animates the 4WD rover moving 10 cm forward/reverse along the single rail,
 *   the N20 motor sliding the sprayer nozzle left/right, the 10 cm scan window,
 *   and the herbicide spray cone.
 */
export function VirtualFieldTrack({
  trackLengthCm = 100,
  plants,
  botCm,
  nozzleCm,
  nozzleX,
  driveState, // "FORWARD" | "REVERSE" | "STOP"
  n20State, // "LEFT" | "RIGHT" | "STOP"
  isSpraying,
  activeZone, // { startCm, endCm } | null
  phase, // "IDLE" | "MOVE_10CM" | "ANALYZE" | "TARGETING" | "SPRAYING" | "REALIGN" | "COMPLETE"
  armedTemplate,
  visualMode = "dataset",
  isLocked = false,
  onDropPlant,
  onMovePlant,
  onRemovePlant,
}) {
  const trackRef = useRef(null);
  const [draggingPlantId, setDraggingPlantId] = useState(null);
  const [hoverPos, setHoverPos] = useState(null);

  const zonesCount = Math.ceil(trackLengthCm / 10);
  const zones = Array.from({ length: zonesCount }, (_, i) => ({
    index: i,
    startCm: i * 10,
    endCm: Math.min(trackLengthCm, (i + 1) * 10),
  }));

  const clientToTrackCoords = (clientX, clientY) => {
    if (!trackRef.current) return { cm: 0, lat: 0 };
    const rect = trackRef.current.getBoundingClientRect();
    const relY = Math.max(0, Math.min(1, (rect.bottom - clientY) / rect.height));
    const relX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const cm = Number((relY * trackLengthCm).toFixed(1));
    // Inverse of latToLeftPct (50 + lat * 38) -> maps full inner bed (12%..88%) to -1.0..+1.0
    const lat = Number(Math.max(-1, Math.min(1, (relX - 0.5) / 0.38)).toFixed(2));
    return { cm, lat };
  };

  const handleDragOver = (e) => {
    if (isLocked) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setHoverPos(clientToTrackCoords(e.clientX, e.clientY));
  };

  const handleDragLeave = () => {
    setHoverPos(null);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setHoverPos(null);
    if (isLocked) return;
    const rawJson = e.dataTransfer.getData("application/x-agri-plant-json");
    const templateKey = e.dataTransfer.getData("application/x-agri-plant");
    let template = templateKey;
    if (rawJson) {
      try {
        template = JSON.parse(rawJson);
      } catch {
        template = templateKey;
      }
    }
    if (!template) return;
    const { cm, lat } = clientToTrackCoords(e.clientX, e.clientY);
    onDropPlant(template, cm, lat);
  };

  const handleTrackClick = (e) => {
    if (isLocked || !armedTemplate) return;
    if (e.target.closest("[data-plant-node]")) return;
    const { cm, lat } = clientToTrackCoords(e.clientX, e.clientY);
    onDropPlant(armedTemplate, cm, lat);
  };

  const handlePlantPointerDown = (e, plantId) => {
    if (isLocked) return;
    if (e.target.closest("button")) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraggingPlantId(plantId);
  };

  const handlePlantPointerMove = (e, plantId) => {
    if (draggingPlantId !== plantId || isLocked) return;
    const { cm, lat } = clientToTrackCoords(e.clientX, e.clientY);
    onMovePlant(plantId, cm, lat);
  };

  const handlePlantPointerUp = (e, plantId) => {
    if (draggingPlantId === plantId) {
      setDraggingPlantId(null);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore if pointer capture already released
      }
    }
  };

  // Convert cm & lateral offset into CSS percentages
  // Spans full inner crop bed (12%..88%) right up to the two outer wheel tracks
  const cmToBottomPct = (cm) => Math.max(0, Math.min(100, (cm / trackLengthCm) * 100));
  const latToLeftPct = (lat) => 50 + lat * 38; // maps -1.0..+1.0 to 12%..88%

  const nozzleBottomPct = cmToBottomPct(nozzleCm);
  const nozzleLeftPct = latToLeftPct(nozzleX);

  return (
    <div className="flex flex-col gap-2">
      {/* Track Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold">
            1D STRAIGHT ROW ({trackLengthCm} cm)
          </span>
          <span className="text-zinc-400">
            Step: <strong className="text-zinc-200">10 cm</strong>
          </span>
        </div>
        <div className="text-zinc-400">
          {isLocked ? (
            <span className="text-amber-400">Simulation running — editing locked</span>
          ) : armedTemplate ? (
            <span className="text-emerald-400 animate-pulse">
              Click anywhere on soil row to drop plant
            </span>
          ) : (
            <span>Drag & drop weeds/crops onto the row</span>
          )}
        </div>
      </div>

      {/* Main Field Track Canvas Container (centered narrow row) */}
      <div className="relative flex justify-center gap-2 select-none">
        {/* Left Distance Ruler (0 cm -> trackLengthCm) */}
        <div className="w-11 shrink-0 relative h-[600px] sm:h-[640px] flex flex-col justify-between text-[10px] font-mono text-zinc-500 py-0.5">
          {Array.from({ length: zonesCount + 1 }, (_, idx) => {
            const cm = (zonesCount - idx) * 10;
            return (
              <div key={cm} className="flex items-center justify-end gap-1 leading-none">
                <span className={cm % 20 === 0 ? "text-zinc-300 font-semibold" : ""}>{cm}cm</span>
                <span className="w-2 h-px bg-zinc-700" />
              </div>
            );
          })}
        </div>

        {/* Soil Track Surface (narrow 1D path) */}
        <div
          ref={trackRef}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleTrackClick}
          className={`relative w-full max-w-[260px] sm:max-w-[290px] h-[600px] sm:h-[640px] rounded-xl border-2 overflow-hidden transition-colors ${
            hoverPos
              ? "border-emerald-400 bg-[#281f15]"
              : armedTemplate && !isLocked
              ? "border-emerald-500/50 cursor-crosshair bg-[#231b12]"
              : "border-zinc-800 bg-[#221a12]"
          }`}
          style={{
            backgroundImage:
              "radial-gradient(rgba(255,255,255,0.03) 1px, transparent 0), linear-gradient(to right, rgba(255,255,255,0.025) 1px, transparent 1px)",
            backgroundSize: "18px 18px, 25% 100%",
          }}
        >
          {/* Finish Banner at Top */}
          <div className="absolute top-0 inset-x-0 h-5 bg-zinc-950/75 border-b border-zinc-800/80 flex items-center justify-between px-2 text-[8px] font-mono text-zinc-400 z-10 pointer-events-none">
            <span>▲ END ({trackLengthCm}cm)</span>
            <span>N20: L ◄──► R</span>
          </div>

          {/* Start Line at Bottom */}
          <div className="absolute bottom-0 inset-x-0 h-5 bg-zinc-950/75 border-t border-emerald-500/30 flex items-center justify-between px-2 text-[8px] font-mono text-emerald-400 z-10 pointer-events-none">
            <span>START (0cm)</span>
            <span>FWD ▲ / REV ▼</span>
          </div>

          {/* 10 cm Zone Bands */}
          {zones.map((z) => {
            const bottomPct = (z.startCm / trackLengthCm) * 100;
            const heightPct = ((z.endCm - z.startCm) / trackLengthCm) * 100;
            const isActive =
              activeZone && activeZone.startCm === z.startCm && activeZone.endCm === z.endCm;

            return (
              <div
                key={z.index}
                style={{ bottom: `${bottomPct}%`, height: `${heightPct}%` }}
                className={`absolute inset-x-0 border-t border-dashed transition-colors pointer-events-none ${
                  isActive
                    ? "border-emerald-400/80 bg-emerald-500/12 shadow-[inset_0_0_24px_rgba(16,185,129,0.2)]"
                    : "border-amber-200/10"
                }`}
              >
                <span
                  className={`absolute right-2 top-1 text-[9px] font-mono px-1.5 py-0.5 rounded ${
                    isActive
                      ? "bg-emerald-500 text-zinc-950 font-bold"
                      : "text-zinc-500/70"
                  }`}
                >
                  Z{z.index + 1}: {z.startCm}-{z.endCm}cm
                </span>
              </div>
            );
          })}

          {/* Left & Right Outer Wheel Track Lanes (where the 4 wheels travel) */}
          <div className="absolute inset-y-0 left-1 w-5 bg-zinc-900/55 border-x border-zinc-700/40 pointer-events-none">
            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px border-l border-dashed border-zinc-500/35" />
          </div>
          <div className="absolute inset-y-0 right-1 w-5 bg-zinc-900/55 border-x border-zinc-700/40 pointer-events-none">
            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px border-l border-dashed border-zinc-500/35" />
          </div>

          {/* Center Row Axis Guide */}
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 border-l border-dashed border-emerald-500/25 pointer-events-none" />

          {/* Drop Hover Ghost Marker */}
          {hoverPos && (
            <div
              style={{
                bottom: `${cmToBottomPct(hoverPos.cm)}%`,
                left: `${latToLeftPct(hoverPos.lat)}%`,
              }}
              className="absolute -translate-x-1/2 translate-y-1/2 w-10 h-10 rounded-full border-2 border-dashed border-emerald-400 bg-emerald-500/20 pointer-events-none z-20 flex items-center justify-center text-[9px] font-mono text-emerald-200"
            >
              {hoverPos.cm}
            </div>
          )}

          {/* Placed Weed & Crop Nodes */}
          {plants.map((plant) => {
            const isWeed = plant.type === "weed";
            const isSprayed = plant.status === "sprayed";
            const isProtected = plant.status === "protected";

            return (
              <div
                key={plant.id}
                data-plant-node="true"
                onPointerDown={(e) => handlePlantPointerDown(e, plant.id)}
                onPointerMove={(e) => handlePlantPointerMove(e, plant.id)}
                onPointerUp={(e) => handlePlantPointerUp(e, plant.id)}
                style={{
                  bottom: `${cmToBottomPct(plant.positionCm)}%`,
                  left: `${latToLeftPct(plant.lateralOffset)}%`,
                }}
                title={`${plant.label} @ ${plant.positionCm} cm (X=${Math.round(
                  plant.lateralOffset * 100
                )}%)`}
                className={`group absolute -translate-x-1/2 translate-y-1/2 z-20 flex flex-col items-center ${
                  isLocked ? "cursor-default" : "cursor-grab active:cursor-grabbing"
                }`}
              >
                <div
                  className={`relative w-7 h-7 rounded-lg border-[1.5px] overflow-hidden shadow-md transition-all ${
                    isSprayed
                      ? "border-zinc-500 opacity-55 grayscale scale-90"
                      : isProtected
                      ? "border-emerald-400 ring-2 ring-emerald-400/40 scale-105"
                      : isWeed
                      ? "border-rose-500/90 bg-rose-950/60"
                      : "border-emerald-500/90 bg-emerald-950/60"
                  }`}
                >
                  {visualMode === "dataset" && plant.sampleImage ? (
                    <img
                      src={plant.sampleImage}
                      alt={plant.label}
                      draggable={false}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs">
                      {isWeed ? "🌿" : "🌱"}
                    </div>
                  )}

                  {/* Status overlay icon */}
                  {isSprayed && (
                    <div className="absolute inset-0 bg-cyan-950/70 flex items-center justify-center">
                      <Droplets className="size-3 text-cyan-300" />
                    </div>
                  )}
                  {isProtected && (
                    <div className="absolute top-0.5 right-0.5 bg-emerald-500 rounded-full p-0.5">
                      <ShieldCheck className="size-2 text-zinc-950" />
                    </div>
                  )}

                  {/* Delete button when unlocked */}
                  {!isLocked && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemovePlant(plant.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 absolute top-0 left-0 bg-zinc-950/90 hover:bg-rose-600 text-zinc-200 rounded p-0.5 transition-opacity"
                      title="Remove"
                    >
                      <Trash2 className="size-2" />
                    </button>
                  )}
                </div>

                <span
                  className={`mt-0.5 px-1 rounded text-[7px] font-mono font-bold whitespace-nowrap leading-tight ${
                    isSprayed
                      ? "bg-zinc-800 text-zinc-400 line-through"
                      : isWeed
                      ? "bg-rose-600/90 text-white"
                      : "bg-emerald-600/90 text-white"
                  }`}
                >
                  {isWeed ? "W" : "C"} {plant.positionCm.toFixed(0)}cm
                </span>
              </div>
            );
          })}

          {/* 10 cm AI Camera Scan Frame around Nozzle Bay */}
          {phase !== "IDLE" && (activeZone || botCm > 0) && (
            <div
              style={{
                bottom: `${cmToBottomPct(
                  activeZone ? activeZone.startCm : Math.max(0, botCm - 10)
                )}%`,
                height: `${
                  (((activeZone ? activeZone.endCm - activeZone.startCm : 10) / trackLengthCm) *
                    100)
                }%`,
              }}
              className={`absolute inset-x-7 border-2 rounded-lg pointer-events-none z-20 transition-colors ${
                phase === "ANALYZE"
                  ? "border-amber-400 bg-amber-400/10"
                  : phase === "SPRAYING"
                  ? "border-cyan-400 bg-cyan-400/10"
                  : "border-emerald-400/35 bg-emerald-500/5"
              }`}
            >
              {phase === "ANALYZE" && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-zinc-950/90 border border-amber-400/60 text-amber-300 text-[10px] font-mono animate-pulse">
                    <ScanLine className="size-3" />
                    <span>YOLOv8 SCANNING 10 CM BAY</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Wide Straddle 4WD AgriRover Chassis + N20 Lateral Nozzle Rail */}
          <div
            style={{ bottom: `${nozzleBottomPct}%` }}
            className="absolute inset-x-1 translate-y-1/2 z-30 pointer-events-none"
          >
            {/* Open-Frame Long Rover Chassis straddling the two outer wheel tracks */}
            <div className="relative w-full h-32">
              {/* Left Side Rail + Front-Left & Rear-Left Wheels */}
              <div className="absolute left-0 inset-y-0 w-5 flex flex-col justify-between items-center py-0.5">
                <div
                  className={`w-3.5 h-8 rounded-sm border-2 shadow-md transition-colors ${
                    driveState === "FORWARD"
                      ? "bg-emerald-700/80 border-emerald-400"
                      : driveState === "REVERSE"
                      ? "bg-amber-700/80 border-amber-400"
                      : "bg-zinc-800 border-zinc-500"
                  }`}
                />
                <div className="w-1.5 flex-1 bg-emerald-500/50 border-x border-emerald-400/60" />
                <div
                  className={`w-3.5 h-8 rounded-sm border-2 shadow-md transition-colors ${
                    driveState === "FORWARD"
                      ? "bg-emerald-700/80 border-emerald-400"
                      : driveState === "REVERSE"
                      ? "bg-amber-700/80 border-amber-400"
                      : "bg-zinc-800 border-zinc-500"
                  }`}
                />
              </div>

              {/* Right Side Rail + Front-Right & Rear-Right Wheels */}
              <div className="absolute right-0 inset-y-0 w-5 flex flex-col justify-between items-center py-0.5">
                <div
                  className={`w-3.5 h-8 rounded-sm border-2 shadow-md transition-colors ${
                    driveState === "FORWARD"
                      ? "bg-emerald-700/80 border-emerald-400"
                      : driveState === "REVERSE"
                      ? "bg-amber-700/80 border-amber-400"
                      : "bg-zinc-800 border-zinc-500"
                  }`}
                />
                <div className="w-1.5 flex-1 bg-emerald-500/50 border-x border-emerald-400/60" />
                <div
                  className={`w-3.5 h-8 rounded-sm border-2 shadow-md transition-colors ${
                    driveState === "FORWARD"
                      ? "bg-emerald-700/80 border-emerald-400"
                      : driveState === "REVERSE"
                      ? "bg-amber-700/80 border-amber-400"
                      : "bg-zinc-800 border-zinc-500"
                  }`}
                />
              </div>

              {/* Front Gantry Crossbar (transparent interior below so crops/weeds remain visible) */}
              <div className="absolute top-1.5 inset-x-3 h-1.5 rounded-full bg-emerald-500/50 border border-emerald-400/70 shadow-sm" />
              {/* Rear Gantry Crossbar */}
              <div className="absolute bottom-1.5 inset-x-3 h-1.5 rounded-full bg-emerald-500/35 border border-emerald-400/50 shadow-sm" />

              {/* Compact Rover Status Badge on Front Crossbar */}
              <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-md bg-zinc-950/95 border border-emerald-400/70 shadow flex items-center gap-1.5 text-[9px] font-mono font-bold text-emerald-300 whitespace-nowrap">
                {driveState === "FORWARD" && (
                  <ArrowUp className="size-3 animate-bounce text-emerald-400" />
                )}
                {driveState === "REVERSE" && (
                  <ArrowDown className="size-3 animate-bounce text-amber-400" />
                )}
                <span>AGRI-BOT</span>
                <span className="text-zinc-400 font-normal">{botCm.toFixed(1)} cm</span>
              </div>

              {/* Full-Width N20 Lateral Gantry Rail spanning between the two wheel sides */}
              <div className="absolute top-1/2 -translate-y-1/2 inset-x-3 h-1.5 bg-sky-500/40 border-y border-sky-400/60 rounded-full" />
            </div>

            {/* Moving N20 Nozzle Head */}
            <div
              style={{ left: `${nozzleLeftPct}%` }}
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"
            >
              <div
                className={`relative w-7 h-7 rounded-full border-2 flex items-center justify-center shadow-lg transition-transform ${
                  isSpraying
                    ? "border-cyan-300 bg-cyan-500/40 scale-125"
                    : n20State !== "STOP"
                    ? "border-sky-400 bg-sky-500/30"
                    : "border-emerald-400 bg-zinc-950/90"
                }`}
              >
                <Crosshair
                  className={`size-4 ${
                    isSpraying ? "text-cyan-200 animate-spin" : "text-sky-300"
                  }`}
                />

                {/* Active Herbicide Spray Cone */}
                {isSpraying && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="absolute w-14 h-14 rounded-full bg-cyan-400/30 border border-cyan-300 animate-ping" />
                    <span className="absolute w-10 h-10 rounded-full bg-emerald-400/25 blur-[2px]" />
                  </div>
                )}
              </div>

              {n20State !== "STOP" && (
                <div className="absolute -top-5 px-1 rounded bg-sky-600 text-[8px] font-mono font-bold text-white flex items-center gap-0.5 whitespace-nowrap">
                  <MoveHorizontal className="size-2.5" />
                  <span>N20 {n20State}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
