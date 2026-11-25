import { useState, useRef, useEffect, useCallback } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  StepForward,
  ShieldAlert,
  Shuffle,
  Trash2,
  Sparkles,
  Radio,
  Sprout,
  Target,
  Droplets,
  Ruler,
  Terminal,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Upload,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";

import { VirtualFieldTrack } from "./VirtualFieldTrack";
import { Nozzle4DirHud } from "./Nozzle4DirHud";
import { VirtualCameraHud } from "./VirtualCameraHud";
import {
  PLANT_PALETTE,
  createPlantInstance,
  buildDemoFieldPreset,
  buildRandomField,
} from "./virtualFieldPresets";
import {
  DEFAULT_YOLO_SERVER_URL,
  checkYoloHealth,
  detectFrameWithYolo,
  fetchDatasetPlants,
  renderZoneCameraSnapshot,
  annotateFallbackFrame,
} from "@/services/yoloApi";

/**
 * VirtualEnvironmentPage
 *
 * Full interactive 1D Straight-Row Virtual Field Simulator:
 * 1. User builds a straight path of Weeds & Crops via Drag-and-Drop (or click-to-place).
 * 2. Pressing RUN executes the hardware rule:
 *    - Go 10 cm forward -> Stop & Analyze zone with YOLOv8 (best.pt) / Fallback Vision
 *    - Protect crops (no spray), target weeds using 4-direction nozzle kinematics
 *      (Rover Forward/Reverse + N20 Left/Right) -> Spray herbicide
 *    - Re-align & repeat every 10 cm until end of row.
 * 3. Optional "Mirror to Real Bot" toggle drives the connected ESP8266 hardware in sync.
 */
const SECTION_CM = 30;
// Calibrated from real bot measurement: 2000 ms moved 53 cm => 10 cm = 377 ms, 30 cm = 1132 ms
const DEFAULT_MS_PER_30CM = 1132;

export function VirtualEnvironmentPage({
  isWsConnected,
  onDriveStep, // (direction: "FORWARD" | "BACKWARD" | "STOP") => void
  onN20Step, // (dir: "FORWARD" | "BACKWARD" | "STOP", speed?: number) => void
  onEmergencyStop,
}) {
  // Field configuration
  const [trackLengthCm, setTrackLengthCm] = useState(120);
  const [plants, setPlants] = useState(() => buildDemoFieldPreset(120));
  const [armedTemplate, setArmedTemplate] = useState(null);
  const [visualMode, setVisualMode] = useState("dataset"); // "dataset" | "schematic"

  // Real hardware sync (30 cm == 1132 ms => 10 cm == 377 ms; N20 start->end == 10000 ms)
  const [mirrorRealBot, setMirrorRealBot] = useState(false);
  const [pulseMsPer30Cm, setPulseMsPer30Cm] = useState(DEFAULT_MS_PER_30CM);
  const [n20FullSweepMs, setN20FullSweepMs] = useState(10000);

  // YOLO backend state
  const [yoloServerUrl, setYoloServerUrl] = useState(DEFAULT_YOLO_SERVER_URL);
  const [yoloHealth, setYoloHealth] = useState({ online: false });
  const [yoloConf, setYoloConf] = useState(0.3);
  const [strictYoloOnly, setStrictYoloOnly] = useState(false);
  const [rawFrameUrl, setRawFrameUrl] = useState(null);
  const [cameraFrameUrl, setCameraFrameUrl] = useState(null);
  const [visionSource, setVisionSource] = useState(null);
  const [lastDetections, setLastDetections] = useState([]);
  const [lastLatencyMs, setLastLatencyMs] = useState(null);
  const [lastYoloProof, setLastYoloProof] = useState(null);

  // Full weed & crop dataset palette browser state
  const [paletteType, setPaletteType] = useState("all"); // "all" | "weed" | "crop"
  const [paletteCategory, setPaletteCategory] = useState("all");
  const [paletteSearch, setPaletteSearch] = useState("");
  const [palettePage, setPalettePage] = useState(1);
  const [datasetCatalog, setDatasetCatalog] = useState(null);
  const [customPaletteItems, setCustomPaletteItems] = useState([]);
  const customPlantInputRef = useRef(null);

  // Simulation runtime state
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [phase, setPhase] = useState("IDLE"); // IDLE | MOVE_10CM | ANALYZE | TARGETING | SPRAYING | REALIGN | COMPLETE
  const [botCm, setBotCm] = useState(0);
  const [nozzleCm, setNozzleCm] = useState(0);
  const [nozzleX, setNozzleX] = useState(0);
  const [driveState, setDriveState] = useState("STOP");
  const [n20State, setN20State] = useState("STOP");
  const [isSpraying, setIsSpraying] = useState(false);
  const [activeZone, setActiveZone] = useState(null);
  const [currentZoneIndex, setCurrentZoneIndex] = useState(0);
  const [cycleLog, setCycleLog] = useState([
    {
      id: "init-1",
      time: new Date().toLocaleTimeString(),
      text: "Virtual 1D Field ready. Drag weeds & crops onto the path and press RUN.",
      level: "info",
    },
  ]);

  const [stats, setStats] = useState({
    distanceCm: 0,
    zonesScanned: 0,
    weedsDetected: 0,
    weedsSprayed: 0,
    cropsProtected: 0,
    herbicideMl: 0,
  });

  // Mutable refs for deterministic async step control
  const imageCacheRef = useRef(new Map());
  const runIdRef = useRef(0);
  const pausedRef = useRef(false);
  const mirrorRef = useRef(false);
  const pulseMsRef = useRef(DEFAULT_MS_PER_30CM);
  const n20SweepRef = useRef(10000);
  const yoloUrlRef = useRef(yoloServerUrl);
  const yoloConfRef = useRef(yoloConf);
  const strictYoloRef = useRef(strictYoloOnly);
  const visualModeRef = useRef(visualMode);
  const plantsRef = useRef(plants);

  const botPosRef = useRef({ botCm: 0, nozzleCm: 0, nozzleX: 0 });

  useEffect(() => {
    mirrorRef.current = mirrorRealBot;
  }, [mirrorRealBot]);

  useEffect(() => {
    pulseMsRef.current = pulseMsPer30Cm;
  }, [pulseMsPer30Cm]);

  useEffect(() => {
    n20SweepRef.current = n20FullSweepMs;
  }, [n20FullSweepMs]);

  useEffect(() => {
    yoloUrlRef.current = yoloServerUrl;
  }, [yoloServerUrl]);

  useEffect(() => {
    yoloConfRef.current = yoloConf;
  }, [yoloConf]);

  useEffect(() => {
    strictYoloRef.current = strictYoloOnly;
  }, [strictYoloOnly]);

  useEffect(() => {
    visualModeRef.current = visualMode;
  }, [visualMode]);

  useEffect(() => {
    plantsRef.current = plants;
  }, [plants]);

  const appendLog = useCallback((text, level = "info") => {
    setCycleLog((prev) => [
      {
        id: `${Date.now()}-${Math.random()}`,
        time: new Date().toLocaleTimeString(),
        text,
        level,
      },
      ...prev.slice(0, 80),
    ]);
  }, []);

  const refreshYoloHealth = useCallback(async () => {
    const res = await checkYoloHealth(yoloUrlRef.current);
    setYoloHealth(res);
    return res;
  }, []);

  useEffect(() => {
    refreshYoloHealth();
  }, [refreshYoloHealth]);

  // Load all weed & crop varieties from Python dataset catalog when online
  useEffect(() => {
    let cancelled = false;
    const loadCatalog = async () => {
      if (!yoloHealth?.online) {
        setDatasetCatalog(null);
        return;
      }
      try {
        const res = await fetchDatasetPlants(yoloServerUrl, {
          type: paletteType,
          category: paletteCategory,
          search: paletteSearch,
          page: palettePage,
          limit: 24,
        });
        if (!cancelled) {
          setDatasetCatalog(res);
        }
      } catch {
        if (!cancelled) {
          setDatasetCatalog(null);
        }
      }
    };
    loadCatalog();
    return () => {
      cancelled = true;
    };
  }, [yoloHealth?.online, yoloServerUrl, paletteType, paletteCategory, paletteSearch, palettePage]);

  const updateBotPose = useCallback((nextBotCm, nextNozzleCm, nextNozzleX) => {
    botPosRef.current = {
      botCm: nextBotCm,
      nozzleCm: nextNozzleCm,
      nozzleX: nextNozzleX,
    };
    setBotCm(nextBotCm);
    setNozzleCm(nextNozzleCm);
    setNozzleX(nextNozzleX);
  }, []);

  // Wall-clock sleep helper respecting pause & cancellation (real-time when mirroring)
  const waitMs = useCallback(async (ms, activeRunId) => {
    let remaining = ms;
    let lastTick = performance.now();
    while (remaining > 0) {
      if (runIdRef.current !== activeRunId) throw new Error("ABORTED");
      if (pausedRef.current) {
        await new Promise((r) => setTimeout(r, 50));
        lastTick = performance.now();
        continue;
      }
      await new Promise((r) => setTimeout(r, 25));
      const now = performance.now();
      const dt = now - lastTick;
      lastTick = now;
      remaining -= dt;
    }
  }, []);

  // Stop all physical actuators safely
  const stopHardwareActuators = useCallback(() => {
    setDriveState("STOP");
    setN20State("STOP");
    setIsSpraying(false);
    if (mirrorRef.current) {
      onDriveStep?.("STOP");
      onN20Step?.("STOP", 0);
    }
  }, [onDriveStep, onN20Step]);

  // Smooth wall-clock dual-axis animation so Rover (10 cm == pulseMsPer10Cm ms)
  // and N20 motor each run and stop at their exact independent durations.
  const animateDualAxis = useCallback(
    async ({
      targetBotCm,
      targetNozzleCm,
      targetNozzleX,
      longDurationMs,
      latDurationMs,
      longDir = "STOP",
      latDir = "STOP",
      activeRunId,
    }) => {
      const start = { ...botPosRef.current };
      const effectiveLongMs = Math.max(0, longDurationMs);
      const effectiveLatMs = Math.max(0, latDurationMs);
      const totalMs = Math.max(effectiveLongMs, effectiveLatMs, 40);

      let longStopped = effectiveLongMs === 0 || longDir === "STOP";
      let latStopped = effectiveLatMs === 0 || latDir === "STOP";

      if (mirrorRef.current) {
        if (!longStopped) {
          onDriveStep?.(longDir === "FORWARD" ? "FORWARD" : "BACKWARD");
        }
        if (!latStopped) {
          onN20Step?.(latDir === "RIGHT" ? "FORWARD" : "BACKWARD", 180);
        }
      }

      let elapsedLong = 0;
      let elapsedLat = 0;
      let lastTick = performance.now();

      while (elapsedLong < effectiveLongMs || elapsedLat < effectiveLatMs) {
        if (runIdRef.current !== activeRunId) throw new Error("ABORTED");

        if (pausedRef.current) {
          if (mirrorRef.current) {
            onDriveStep?.("STOP");
            onN20Step?.("STOP", 0);
          }
          while (pausedRef.current) {
            if (runIdRef.current !== activeRunId) throw new Error("ABORTED");
            await new Promise((r) => setTimeout(r, 50));
          }
          if (mirrorRef.current) {
            if (!longStopped) {
              onDriveStep?.(longDir === "FORWARD" ? "FORWARD" : "BACKWARD");
            }
            if (!latStopped) {
              onN20Step?.(latDir === "RIGHT" ? "FORWARD" : "BACKWARD", 180);
            }
          }
          lastTick = performance.now();
          continue;
        }

        await new Promise((r) => setTimeout(r, 20));
        const now = performance.now();
        const dt = now - lastTick;
        lastTick = now;

        elapsedLong = Math.min(effectiveLongMs, elapsedLong + dt);
        elapsedLat = Math.min(effectiveLatMs, elapsedLat + dt);

        if (!longStopped && elapsedLong >= effectiveLongMs) {
          longStopped = true;
          setDriveState("STOP");
          if (mirrorRef.current) onDriveStep?.("STOP");
        }

        if (!latStopped && elapsedLat >= effectiveLatMs) {
          latStopped = true;
          setN20State("STOP");
          if (mirrorRef.current) onN20Step?.("STOP", 0);
        }

        const tLong = effectiveLongMs > 0 ? Math.min(1, elapsedLong / effectiveLongMs) : 1;
        const tLat = effectiveLatMs > 0 ? Math.min(1, elapsedLat / effectiveLatMs) : 1;
        const easeLong = mirrorRef.current
          ? tLong
          : tLong < 0.5
          ? 2 * tLong * tLong
          : 1 - Math.pow(-2 * tLong + 2, 2) / 2;
        const easeLat = mirrorRef.current
          ? tLat
          : tLat < 0.5
          ? 2 * tLat * tLat
          : 1 - Math.pow(-2 * tLat + 2, 2) / 2;

        updateBotPose(
          start.botCm + (targetBotCm - start.botCm) * easeLong,
          start.nozzleCm + (targetNozzleCm - start.nozzleCm) * easeLong,
          start.nozzleX + (targetNozzleX - start.nozzleX) * easeLat
        );

        if (elapsedLong >= totalMs && elapsedLat >= totalMs) break;
      }

      updateBotPose(targetBotCm, targetNozzleCm, targetNozzleX);
      setDriveState("STOP");
      setN20State("STOP");
      if (mirrorRef.current) {
        onDriveStep?.("STOP");
        onN20Step?.("STOP", 0);
      }
    },
    [onDriveStep, onN20Step, updateBotPose]
  );

  // Execute one 30 cm scan-detect-spray section
  const executeSingleZone = useCallback(
    async (zoneIdx, activeRunId) => {
      const zoneStart = zoneIdx * SECTION_CM;
      const zoneEnd = Math.min(trackLengthCm, zoneStart + SECTION_CM);
      const checkpointNozzleY = zoneStart + (zoneEnd - zoneStart) / 2;

      setCurrentZoneIndex(zoneIdx);
      setActiveZone({ startCm: zoneStart, endCm: zoneEnd });

      // ------------------------------------------------------------------
      // STEP 1: Move 30 cm Forward along the single-line path
      // Maintain exact conversion: 30 cm == pulseMsRef.current (default 1132 ms => 10 cm = 377 ms)
      // ------------------------------------------------------------------
      setPhase("MOVE_30CM");
      setDriveState("FORWARD");
      setN20State("STOP");
      const stepCm = Math.max(0.5, zoneEnd - botPosRef.current.botCm);
      const stepDurationMs = Math.round((stepCm / SECTION_CM) * pulseMsRef.current);
      appendLog(
        `Moving ${stepCm.toFixed(1)} cm forward (${zoneStart} -> ${zoneEnd} cm | ${(
          stepDurationMs / 1000
        ).toFixed(2)}s)...`,
        "move"
      );

      await animateDualAxis({
        targetBotCm: zoneEnd,
        targetNozzleCm: checkpointNozzleY,
        targetNozzleX: 0,
        longDurationMs: stepDurationMs,
        latDurationMs:
          Math.abs(botPosRef.current.nozzleX) > 0.02
            ? Math.round((Math.abs(botPosRef.current.nozzleX) / 2) * n20SweepRef.current)
            : 0,
        longDir: "FORWARD",
        latDir:
          Math.abs(botPosRef.current.nozzleX) <= 0.02
            ? "STOP"
            : botPosRef.current.nozzleX > 0
            ? "LEFT"
            : "RIGHT",
        activeRunId,
      });

      setStats((s) => ({
        ...s,
        distanceCm: Number(zoneEnd.toFixed(1)),
      }));

      // ------------------------------------------------------------------
      // STEP 2: Analyze & Detect Weeds and Crops in this 10 cm zone
      // ------------------------------------------------------------------
      setPhase("ANALYZE");
      appendLog(`Scanning zone ${zoneStart}-${zoneEnd} cm with AI Vision...`, "scan");

      const isLastZone = zoneEnd >= trackLengthCm;
      const zonePlants = plantsRef.current.filter(
        (p) =>
          p.positionCm >= zoneStart &&
          (isLastZone ? p.positionCm <= zoneEnd : p.positionCm < zoneEnd)
      );

      const { dataUrl: rawSnapshot, placedTiles } = await renderZoneCameraSnapshot({
        plants: zonePlants,
        zoneStartCm: zoneStart,
        zoneEndCm: zoneEnd,
        imageCache: imageCacheRef.current,
        visualMode: visualModeRef.current,
      });

      if (runIdRef.current !== activeRunId) throw new Error("ABORTED");
      setRawFrameUrl(rawSnapshot);

      let detectedList = [];
      let annotatedUrl = rawSnapshot;
      let usedSource = "fallback";
      let latency = null;
      let proofPayload = null;

      // Try live YOLOv8 best.pt backend first
      const health = await checkYoloHealth(yoloUrlRef.current);
      setYoloHealth(health);

      if (strictYoloRef.current && !health.online) {
        appendLog(
          "Strict Real YOLO Only is ON, but Python best.pt server is offline! Start virtual_demo_server.py.",
          "error"
        );
        throw new Error("ABORTED");
      }

      if (health.online) {
        try {
          const yoloResult = await detectFrameWithYolo(
            yoloUrlRef.current,
            rawSnapshot,
            yoloConfRef.current
          );
          if (
            yoloResult &&
            Array.isArray(yoloResult.detections) &&
            (strictYoloRef.current ||
              visualModeRef.current === "dataset" ||
              yoloResult.detections.length > 0)
          ) {
            usedSource = "yolo";
            annotatedUrl = yoloResult.annotated_image;
            latency = yoloResult.latency_ms;
            proofPayload = yoloResult;

            // Match each YOLO detection back to its exact non-overlapping plant tile
            const span = Math.max(1, zoneEnd - zoneStart);
            detectedList = yoloResult.detections.map((d, idx) => {
              let bestTile = null;
              let bestDist = Infinity;

              for (const tile of placedTiles) {
                const dist = Math.hypot(d.center_x - tile.px, d.center_y - tile.py);
                // Prefer matching tile within patch bounds; slight preference for same class
                const score = dist - (tile.plant.type === d.class ? 18 : 0);
                if (dist <= tile.patchSize * 0.85 && score < bestDist) {
                  bestDist = score;
                  bestTile = tile;
                }
              }

              const estLat = Math.max(-1, Math.min(1, ((d.norm_x * 512 - 70) / (512 - 140)) * 2 - 1));
              const estCm = Math.max(
                zoneStart,
                Math.min(zoneEnd, zoneEnd - ((d.norm_y * 512 - 60) / (512 - 120)) * span)
              );

              return {
                ...d,
                plantId: bestTile?.plant?.id || `yolo-${zoneIdx}-${idx}`,
                positionCm: bestTile ? bestTile.plant.positionCm : Number(estCm.toFixed(1)),
                lateralOffset: bestTile ? bestTile.plant.lateralOffset : Number(estLat.toFixed(2)),
              };
            });
          }
        } catch {
          if (strictYoloRef.current) {
            appendLog("Strict Real YOLO Only: /detect request failed.", "error");
            throw new Error("ABORTED");
          }
        }
      }

      // Built-in Simulation Vision fallback (only when Strict YOLO Only is OFF)
      if (usedSource !== "yolo") {
        const fallback = await annotateFallbackFrame(
          rawSnapshot,
          zonePlants,
          zoneStart,
          zoneEnd,
          placedTiles
        );
        annotatedUrl = fallback.annotated_image;
        detectedList = fallback.detections;
        usedSource = "fallback";
        latency = 18;
      }

      if (runIdRef.current !== activeRunId) throw new Error("ABORTED");

      setCameraFrameUrl(annotatedUrl);
      setVisionSource(usedSource);
      setLastDetections(detectedList);
      setLastLatencyMs(latency);
      setLastYoloProof(proofPayload);

      await waitMs(550, activeRunId);

      const detectedWeeds = detectedList
        .filter((d) => d.class === "weed")
        .sort((a, b) => a.positionCm - b.positionCm);
      const detectedCrops = detectedList.filter((d) => d.class === "crop");

      // Mark protected crops immediately (in Strict YOLO mode, only use real YOLO detections)
      const cropIdsToProtect = new Set(
        strictYoloRef.current
          ? detectedCrops.map((c) => c.plantId)
          : [
              ...detectedCrops.map((c) => c.plantId),
              ...zonePlants.filter((p) => p.type === "crop").map((p) => p.id),
            ]
      );

      if (cropIdsToProtect.size > 0) {
        setPlants((prev) =>
          prev.map((p) => (cropIdsToProtect.has(p.id) ? { ...p, status: "protected" } : p))
        );
        appendLog(
          `Crop safe: ${cropIdsToProtect.size} crop(s) detected in ${zoneStart}-${zoneEnd} cm — Skipped spray.`,
          "crop"
        );
      }

      setStats((s) => ({
        ...s,
        zonesScanned: s.zonesScanned + 1,
        weedsDetected: s.weedsDetected + detectedWeeds.length,
        cropsProtected: s.cropsProtected + cropIdsToProtect.size,
      }));

      // ------------------------------------------------------------------
      // STEP 3: Position Nozzle in 4 Directions & Spray Each Weed
      // ------------------------------------------------------------------
      if (detectedWeeds.length === 0) {
        appendLog(`Zone ${zoneStart}-${zoneEnd} cm clean — no weeds detected.`, "info");
      } else {
        for (const weed of detectedWeeds) {
          const cur = botPosRef.current;
          const deltaCm = weed.positionCm - cur.nozzleCm;
          const deltaX = weed.lateralOffset - cur.nozzleX;

          const longDir =
            Math.abs(deltaCm) < 0.25 ? "STOP" : deltaCm > 0 ? "FORWARD" : "REVERSE";
          const latDir =
            Math.abs(deltaX) < 0.04 ? "STOP" : deltaX < 0 ? "LEFT" : "RIGHT";

          setPhase("TARGETING");
          setDriveState(longDir);
          setN20State(latDir);

          // Maintain 30 cm == pulseMsRef.current (default 1132 ms => 37.7 ms/cm, 10 cm = 377 ms)
          // and N20 start->end == n20SweepRef.current (default 10000 ms across span 2.0 => 5000 ms/unit)
          const longMs =
            longDir === "STOP"
              ? 0
              : Math.max(40, Math.round((Math.abs(deltaCm) / SECTION_CM) * pulseMsRef.current));
          const latMs =
            latDir === "STOP" ? 0 : Math.max(120, Math.round((Math.abs(deltaX) / 2) * n20SweepRef.current));

          appendLog(
            `Targeting weed @ ${weed.positionCm.toFixed(1)} cm (X=${Math.round(
              weed.lateralOffset * 100
            )}%): Rover ${longDir} (${(longMs / 1000).toFixed(2)}s) + N20 ${latDir} (${(
              latMs / 1000
            ).toFixed(2)}s)`,
            "target"
          );

          const targetBot = cur.botCm + deltaCm;
          await animateDualAxis({
            targetBotCm: targetBot,
            targetNozzleCm: weed.positionCm,
            targetNozzleX: weed.lateralOffset,
            longDurationMs: longMs,
            latDurationMs: latMs,
            longDir,
            latDir,
            activeRunId,
          });

          stopHardwareActuators();

          // Spray Herbicide
          setPhase("SPRAYING");
          setIsSpraying(true);
          appendLog(
            `Spraying herbicide onto weed (${Math.round(weed.confidence * 100)}% conf)...`,
            "spray"
          );

          await waitMs(650, activeRunId);
          setIsSpraying(false);

          setPlants((prev) =>
            prev.map((p) =>
              p.id === weed.plantId ||
              (p.type === "weed" &&
                Math.abs(p.positionCm - weed.positionCm) < 1.5 &&
                Math.abs(p.lateralOffset - weed.lateralOffset) < 0.2)
                ? { ...p, status: "sprayed" }
                : p
            )
          );

          setStats((s) => ({
            ...s,
            weedsSprayed: s.weedsSprayed + 1,
            herbicideMl: Number((s.herbicideMl + 4.5).toFixed(1)),
          }));
        }

        // ----------------------------------------------------------------
        // STEP 4: Re-align Rover to 10 cm Checkpoint & Center N20 Nozzle
        // ----------------------------------------------------------------
        const curAfter = botPosRef.current;
        if (Math.abs(curAfter.botCm - zoneEnd) > 0.2 || Math.abs(curAfter.nozzleX) > 0.03) {
          setPhase("REALIGN");
          const realignDrive =
            Math.abs(zoneEnd - curAfter.botCm) < 0.2
              ? "STOP"
              : zoneEnd > curAfter.botCm
              ? "FORWARD"
              : "REVERSE";
          const realignN20 =
            Math.abs(curAfter.nozzleX) < 0.03
              ? "STOP"
              : curAfter.nozzleX > 0
              ? "LEFT"
              : "RIGHT";

          setDriveState(realignDrive);
          setN20State(realignN20);

          const realignLongMs =
            realignDrive === "STOP"
              ? 0
              : Math.max(
                  40,
                  Math.round((Math.abs(zoneEnd - curAfter.botCm) / SECTION_CM) * pulseMsRef.current)
                );
          const realignLatMs =
            realignN20 === "STOP"
              ? 0
              : Math.max(120, Math.round((Math.abs(curAfter.nozzleX) / 2) * n20SweepRef.current));

          await animateDualAxis({
            targetBotCm: zoneEnd,
            targetNozzleCm: checkpointNozzleY,
            targetNozzleX: 0,
            longDurationMs: realignLongMs,
            latDurationMs: realignLatMs,
            longDir: realignDrive,
            latDir: realignN20,
            activeRunId,
          });
          stopHardwareActuators();
        }
      }
    },
    [
      trackLengthCm,
      animateDualAxis,
      waitMs,
      appendLog,
      stopHardwareActuators,
    ]
  );

  // Reverse bot from final position back down to 0 cm start pad
  const returnBotToStart = useCallback(
    async (activeRunId) => {
      const cur = botPosRef.current;
      if (cur.botCm <= 0.1 && Math.abs(cur.nozzleX) <= 0.02) {
        updateBotPose(0, 0, 0);
        return;
      }

      const returnCm = Math.max(0, cur.botCm);
      const returnMs = Math.max(120, Math.round((returnCm / SECTION_CM) * pulseMsRef.current));
      const latDir =
        Math.abs(cur.nozzleX) <= 0.02 ? "STOP" : cur.nozzleX > 0 ? "LEFT" : "RIGHT";
      const latMs =
        latDir === "STOP"
          ? 0
          : Math.max(120, Math.round((Math.abs(cur.nozzleX) / 2) * n20SweepRef.current));

      setActiveZone(null);
      setPhase("RETURNING");
      setDriveState("REVERSE");
      setN20State(latDir);
      appendLog(
        `Reached end (${returnCm.toFixed(1)} cm) — Reversing back to 0 cm start pad (${(
          returnMs / 1000
        ).toFixed(2)}s)...`,
        "move"
      );

      await animateDualAxis({
        targetBotCm: 0,
        targetNozzleCm: 0,
        targetNozzleX: 0,
        longDurationMs: returnMs,
        latDurationMs: latMs,
        longDir: returnCm > 0.1 ? "REVERSE" : "STOP",
        latDir,
        activeRunId,
      });

      stopHardwareActuators();
    },
    [animateDualAxis, appendLog, stopHardwareActuators, updateBotPose]
  );

  // Full autonomous run from currentZoneIndex -> end of path -> reverse back to 0 cm
  const handleRunMission = async () => {
    if (isRunning && isPaused) {
      pausedRef.current = false;
      setIsPaused(false);
      appendLog("Mission resumed.", "info");
      return;
    }
    if (isRunning) return;

    const totalZones = Math.ceil(trackLengthCm / SECTION_CM);
    let startIdx = currentZoneIndex;
    if (phase === "COMPLETE" || startIdx >= totalZones) {
      // Auto-reset bot to 0 cm for a fresh run
      startIdx = 0;
      setCurrentZoneIndex(0);
      updateBotPose(0, 0, 0);
      setPlants((prev) => prev.map((p) => ({ ...p, status: "pending" })));
      setStats({
        distanceCm: 0,
        zonesScanned: 0,
        weedsDetected: 0,
        weedsSprayed: 0,
        cropsProtected: 0,
        herbicideMl: 0,
      });
    }

    const activeRunId = ++runIdRef.current;
    pausedRef.current = false;
    setIsPaused(false);
    setIsRunning(true);
    setArmedTemplate(null);
    appendLog(`Starting autonomous ${SECTION_CM} cm patrol (${trackLengthCm} cm row)...`, "info");

    try {
      for (let z = startIdx; z < totalZones; z++) {
        await executeSingleZone(z, activeRunId);
      }

      if (runIdRef.current === activeRunId) {
        await returnBotToStart(activeRunId);
      }

      if (runIdRef.current === activeRunId) {
        setPhase("COMPLETE");
        setCurrentZoneIndex(0);
        stopHardwareActuators();
        appendLog("Mission complete! Bot returned to 0 cm start position.", "success");
      }
    } catch (err) {
      if (err.message !== "ABORTED") {
        appendLog(`Simulation error: ${err.message}`, "error");
      }
    } finally {
      if (runIdRef.current === activeRunId) {
        setIsRunning(false);
        setIsPaused(false);
        stopHardwareActuators();
      }
    }
  };

  // Single 30 cm section step (ideal for live presentation walkthroughs)
  const handleStepZone = async () => {
    if (isRunning) return;
    const totalZones = Math.ceil(trackLengthCm / SECTION_CM);
    let zoneIdx = currentZoneIndex;

    if (phase === "COMPLETE" || zoneIdx >= totalZones) {
      zoneIdx = 0;
      setCurrentZoneIndex(0);
      updateBotPose(0, 0, 0);
      setPlants((prev) => prev.map((p) => ({ ...p, status: "pending" })));
      setStats({
        distanceCm: 0,
        zonesScanned: 0,
        weedsDetected: 0,
        weedsSprayed: 0,
        cropsProtected: 0,
        herbicideMl: 0,
      });
    }

    const activeRunId = ++runIdRef.current;
    pausedRef.current = false;
    setIsPaused(false);
    setIsRunning(true);
    setArmedTemplate(null);

    try {
      await executeSingleZone(zoneIdx, activeRunId);
      if (runIdRef.current === activeRunId) {
        const nextIdx = zoneIdx + 1;
        if (nextIdx >= totalZones) {
          await returnBotToStart(activeRunId);
          if (runIdRef.current === activeRunId) {
            setCurrentZoneIndex(0);
            setPhase("COMPLETE");
            appendLog("Mission complete! Bot returned to 0 cm start position.", "success");
          }
        } else {
          setCurrentZoneIndex(nextIdx);
          setPhase("PAUSED");
        }
      }
    } catch (err) {
      if (err.message !== "ABORTED") {
        appendLog(`Step error: ${err.message}`, "error");
      }
    } finally {
      if (runIdRef.current === activeRunId) {
        setIsRunning(false);
        stopHardwareActuators();
      }
    }
  };

  const handlePause = () => {
    if (!isRunning) return;
    pausedRef.current = true;
    setIsPaused(true);
    stopHardwareActuators();
    appendLog("Mission paused by operator.", "warn");
  };

  const handleReset = () => {
    runIdRef.current += 1;
    pausedRef.current = false;
    setIsRunning(false);
    setIsPaused(false);
    setPhase("IDLE");
    setCurrentZoneIndex(0);
    setActiveZone(null);
    setRawFrameUrl(null);
    setCameraFrameUrl(null);
    setVisionSource(null);
    setLastDetections([]);
    setLastLatencyMs(null);
    setLastYoloProof(null);
    updateBotPose(0, 0, 0);
    stopHardwareActuators();
    setPlants((prev) => prev.map((p) => ({ ...p, status: "pending" })));
    setStats({
      distanceCm: 0,
      zonesScanned: 0,
      weedsDetected: 0,
      weedsSprayed: 0,
      cropsProtected: 0,
      herbicideMl: 0,
    });
    appendLog("Bot returned to 0 cm Start Pad. Field ready to edit.", "info");
  };

  const handleSimEStop = () => {
    runIdRef.current += 1;
    pausedRef.current = false;
    setIsRunning(false);
    setIsPaused(false);
    setPhase("IDLE");
    stopHardwareActuators();
    onEmergencyStop?.();
    appendLog("EMERGENCY STOP triggered — all actuators halted!", "error");
  };

  // Drag & Drop handlers for the field track
  const handleDropPlant = (templateKey, cm, lat) => {
    const newPlant = createPlantInstance(templateKey, cm, lat);
    setPlants((prev) => [...prev, newPlant].sort((a, b) => a.positionCm - b.positionCm));
  };

  const handleMovePlant = (plantId, cm, lat) => {
    setPlants((prev) =>
      prev.map((p) =>
        p.id === plantId
          ? { ...p, positionCm: Number(cm.toFixed(1)), lateralOffset: Number(lat.toFixed(2)) }
          : p
      )
    );
  };

  const handleRemovePlant = (plantId) => {
    setPlants((prev) => prev.filter((p) => p.id !== plantId));
  };

  // Live test with any external photo chosen by user/evaluator
  const handleTestCustomPhoto = async (dataUrl, fileName) => {
    setRawFrameUrl(dataUrl);
    const health = await checkYoloHealth(yoloUrlRef.current);
    setYoloHealth(health);
    if (!health.online) {
      appendLog(
        `Cannot test "${fileName}": Python YOLOv8 server is offline at ${yoloUrlRef.current}`,
        "error"
      );
      return;
    }

    try {
      const res = await detectFrameWithYolo(yoloUrlRef.current, dataUrl, yoloConfRef.current);
      setCameraFrameUrl(res.annotated_image);
      setVisionSource("yolo");
      setLastDetections(res.detections || []);
      setLastLatencyMs(res.latency_ms);
      setLastYoloProof(res);
      appendLog(
        `Real Photo Test "${fileName}": Frame #${res.frame_id} -> ${
          res.detections?.length || 0
        } detection(s) in ${Math.round(res.latency_ms)} ms`,
        "success"
      );
    } catch (err) {
      appendLog(`Real Photo Test failed: ${err.message}`, "error");
    }
  };

  const handleAddCustomPalettePhoto = (e, plantType = "weed") => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        const customItem = {
          key: `custom-${Date.now()}`,
          type: plantType,
          label: file.name.replace(/\.[^/.]+$/, "").slice(0, 18) || "Custom Weed",
          category: "Custom Upload",
          sampleImage: reader.result,
          badge: plantType.toUpperCase(),
          description: "Uploaded custom photo",
        };
        setCustomPaletteItems((prev) => [customItem, ...prev]);
        setArmedTemplate(customItem);
        appendLog(`Added "${customItem.label}" to palette — drag or click row to place.`, "info");
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleTrackLengthChange = (newLen) => {
    if (isRunning) return;
    setTrackLengthCm(newLen);
    handleReset();
    setPlants(buildDemoFieldPreset(newLen));
  };

  // Build active palette list (Dataset Catalog when Python online, else 24 bundled varieties)
  const offlineFiltered = [...customPaletteItems, ...PLANT_PALETTE].filter((item) => {
    if (paletteType !== "all" && item.type !== paletteType) return false;
    if (paletteCategory !== "all" && item.category.toLowerCase() !== paletteCategory.toLowerCase()) {
      return false;
    }
    if (paletteSearch.trim()) {
      const q = paletteSearch.trim().toLowerCase();
      return (
        item.label.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.key.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const isCatalogActive = Boolean(datasetCatalog);
  const displayedPalette = isCatalogActive
    ? [...(palettePage === 1 ? customPaletteItems : []), ...(datasetCatalog.items || [])]
    : offlineFiltered;
  const totalWeedsAvail = isCatalogActive
    ? datasetCatalog.total_weeds
    : PLANT_PALETTE.filter((p) => p.type === "weed").length;
  const totalCropsAvail = isCatalogActive
    ? datasetCatalog.total_crops
    : PLANT_PALETTE.filter((p) => p.type === "crop").length;
  const totalPages = isCatalogActive
    ? Math.max(1, Math.ceil((datasetCatalog.total_matching || 0) / 24))
    : 1;

  const availableCategories = isCatalogActive
    ? paletteType === "crop"
      ? datasetCatalog.crop_categories || []
      : paletteType === "weed"
      ? datasetCatalog.weed_categories || []
      : [...(datasetCatalog.weed_categories || []), ...(datasetCatalog.crop_categories || [])]
    : Array.from(
        new Set(
          PLANT_PALETTE.filter((p) => paletteType === "all" || p.type === paletteType).map(
            (p) => p.category
          )
        )
      );

  const totalWeedsPlaced = plants.filter((p) => p.type === "weed").length;
  const totalCropsPlaced = plants.filter((p) => p.type === "crop").length;

  // Broadcast spraying baseline: ~12 mL per 10 cm zone vs spot-spraying ~4.5 mL per weed
  const broadcastEstimateMl = Math.max(1, stats.zonesScanned * 12);
  const herbicideSavedPct =
    stats.zonesScanned === 0
      ? 0
      : Math.max(0, Math.round(((broadcastEstimateMl - stats.herbicideMl) / broadcastEstimateMl) * 100));

  return (
    <div className="space-y-4">
      {/* Top Simulation Control Toolbar */}
      <Card className="border-zinc-800 bg-zinc-950/90">
        <CardContent className="p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3">
          {/* Primary Run Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {!isRunning || isPaused ? (
              <Button
                onClick={handleRunMission}
                className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold h-9 px-4"
              >
                <Play className="size-4 fill-current" />
                <span>{isPaused ? "RESUME BOT" : "RUN AUTONOMOUS BOT"}</span>
              </Button>
            ) : (
              <Button
                onClick={handlePause}
                className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold h-9 px-4"
              >
                <Pause className="size-4 fill-current" />
                <span>PAUSE</span>
              </Button>
            )}

            <Button
              variant="outline"
              onClick={handleStepZone}
              disabled={isRunning}
              className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800 h-9"
              title="Advance one 30 cm section, scan, and spray"
            >
              <StepForward className="size-4 text-sky-400" />
              <span>STEP 30 CM</span>
            </Button>

            <Button
              variant="outline"
              onClick={handleReset}
              className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800 h-9"
            >
              <RotateCcw className="size-4" />
              <span>RESET</span>
            </Button>

            <Button
              variant="destructive"
              onClick={handleSimEStop}
              className="bg-rose-600 hover:bg-rose-700 text-white font-bold h-9"
            >
              <ShieldAlert className="size-4" />
              <span>STOP</span>
            </Button>
          </div>

          {/* Track, Speed & Hardware Mirror Controls */}
          <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
            {/* Row Length */}
            <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
              <Ruler className="size-3.5 text-zinc-400 ml-1" />
              {[60, 90, 120, 150].map((len) => (
                <button
                  key={len}
                  type="button"
                  disabled={isRunning}
                  onClick={() => handleTrackLengthChange(len)}
                  className={`px-2 py-0.5 rounded text-[11px] ${
                    trackLengthCm === len
                      ? "bg-emerald-500 text-zinc-950 font-bold"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  {len}cm
                </button>
              ))}
            </div>

            {/* Mirror to Real ESP8266 Bot */}
            <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1">
              <Radio
                className={`size-3.5 ${
                  mirrorRealBot && isWsConnected
                    ? "text-emerald-400 animate-pulse"
                    : mirrorRealBot
                    ? "text-amber-400 animate-pulse"
                    : "text-zinc-500"
                }`}
              />
              <span className="text-[11px] text-zinc-300">Bot</span>
              <Switch checked={mirrorRealBot} onCheckedChange={setMirrorRealBot} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main 3-Column Virtual Field Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* LEFT COLUMN (3 cols): Drag-and-Drop Plant Palette + Mission Stats */}
        <div className="lg:col-span-3 flex flex-col gap-4">
          <Card className="border-zinc-800 bg-zinc-950/80 flex-1 flex flex-col">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-xs font-bold text-zinc-100 flex items-center gap-1.5 whitespace-nowrap">
                  <Plus className="size-4 text-emerald-400 shrink-0" />
                  <span>PLANT PALETTE</span>
                </CardTitle>
                <Badge variant="outline" className="text-[10px] font-mono shrink-0 whitespace-nowrap">
                  {plants.length} items
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-3 pt-1 flex-1 flex flex-col">
              {/* Visual Mode Switch */}
              <div className="flex items-center justify-between text-[10px] font-mono bg-zinc-900/70 p-2 rounded-lg border border-zinc-800">
                <span className="text-zinc-400">VISUALS:</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setVisualMode("dataset")}
                    className={`px-2 py-0.5 rounded ${
                      visualMode === "dataset"
                        ? "bg-emerald-500 text-zinc-950 font-bold"
                        : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    Dataset Photos
                  </button>
                  <button
                    type="button"
                    onClick={() => setVisualMode("schematic")}
                    className={`px-2 py-0.5 rounded ${
                      visualMode === "schematic"
                        ? "bg-emerald-500 text-zinc-950 font-bold"
                        : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    Icons
                  </button>
                </div>
              </div>

              {/* Weed / Crop Type Filter Tabs */}
              <div className="grid grid-cols-3 gap-1 bg-zinc-900/70 p-1 rounded-lg border border-zinc-800 text-[10px] font-mono">
                <button
                  type="button"
                  onClick={() => {
                    setPaletteType("all");
                    setPaletteCategory("all");
                    setPalettePage(1);
                  }}
                  className={`py-1 rounded ${
                    paletteType === "all"
                      ? "bg-emerald-500 text-zinc-950 font-bold"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  All ({totalWeedsAvail + totalCropsAvail})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPaletteType("weed");
                    setPaletteCategory("all");
                    setPalettePage(1);
                  }}
                  className={`py-1 rounded ${
                    paletteType === "weed"
                      ? "bg-rose-500 text-white font-bold"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Weeds ({totalWeedsAvail})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPaletteType("crop");
                    setPaletteCategory("all");
                    setPalettePage(1);
                  }}
                  className={`py-1 rounded ${
                    paletteType === "crop"
                      ? "bg-emerald-500 text-zinc-950 font-bold"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Crops ({totalCropsAvail})
                </button>
              </div>

              {/* Search & Weed Category Selector */}
              <div className="space-y-1.5 text-[10px] font-mono">
                <div className="relative">
                  <Search className="size-3 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={paletteSearch}
                    onChange={(e) => {
                      setPaletteSearch(e.target.value);
                      setPalettePage(1);
                    }}
                    placeholder="Search weed ID or type..."
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-7 pr-2 py-1 text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setPaletteCategory("all");
                      setPalettePage(1);
                    }}
                    className={`px-1.5 py-0.5 rounded border text-[9px] ${
                      paletteCategory === "all"
                        ? "bg-emerald-500/20 border-emerald-400 text-emerald-300 font-bold"
                        : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    All Types
                  </button>
                  {availableCategories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        setPaletteCategory(cat);
                        setPalettePage(1);
                      }}
                      className={`px-1.5 py-0.5 rounded border text-[9px] ${
                        paletteCategory.toLowerCase() === cat.toLowerCase()
                          ? "bg-sky-500/20 border-sky-400 text-sky-300 font-bold"
                          : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Draggable Plant Cards Grid */}
              <div className="flex-1 min-h-72 max-h-[620px] overflow-y-auto pr-1 grid grid-cols-2 gap-1.5 content-start">
                {displayedPalette.map((item) => {
                  const isWeed = item.type === "weed";
                  const isArmed = armedTemplate?.key === item.key;

                  return (
                    <div
                      key={item.key}
                      draggable={!isRunning}
                      onDragStart={(e) => {
                        if (isRunning) {
                          e.preventDefault();
                          return;
                        }
                        e.dataTransfer.setData("application/x-agri-plant", item.key);
                        e.dataTransfer.setData("application/x-agri-plant-json", JSON.stringify(item));
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      onClick={() => {
                        if (isRunning) return;
                        setArmedTemplate((prev) => (prev?.key === item.key ? null : item));
                      }}
                      title={`${item.label} (${item.category})`}
                      className={`flex flex-col gap-1 p-1.5 rounded-lg border transition-all select-none ${
                        isRunning
                          ? "opacity-50 cursor-not-allowed border-zinc-800 bg-zinc-900/40"
                          : isArmed
                          ? "border-emerald-400 bg-emerald-500/15 ring-1 ring-emerald-400/50 cursor-pointer"
                          : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-600 cursor-grab active:cursor-grabbing"
                      }`}
                    >
                      <div className="relative aspect-square w-full rounded overflow-hidden border border-zinc-800">
                        <img
                          src={item.sampleImage}
                          alt={item.label}
                          loading="lazy"
                          draggable={false}
                          className="w-full h-full object-cover"
                        />
                        <span
                          className={`absolute top-1 right-1 text-[8px] font-mono font-bold px-1 rounded ${
                            isWeed
                              ? "bg-rose-600/90 text-white"
                              : "bg-emerald-600/90 text-white"
                          }`}
                        >
                          {item.badge}
                        </span>
                      </div>
                      <div className="text-[10px] font-semibold text-zinc-100 truncate leading-tight">
                        {item.label}
                      </div>
                      <div className="text-[8px] font-mono text-zinc-400 truncate leading-tight">
                        {item.category || item.description}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pagination (when browsing all 1,298 dataset plants) + Upload Custom Weed */}
              <div className="flex items-center justify-between gap-2 text-[10px] font-mono pt-1">
                {totalPages > 1 ? (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon-xs"
                      disabled={palettePage <= 1}
                      onClick={() => setPalettePage((p) => Math.max(1, p - 1))}
                      className="border-zinc-700 text-zinc-300"
                    >
                      <ChevronLeft className="size-3" />
                    </Button>
                    <span className="text-zinc-400 px-1">
                      {palettePage}/{totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="icon-xs"
                      disabled={palettePage >= totalPages}
                      onClick={() => setPalettePage((p) => Math.min(totalPages, p + 1))}
                      className="border-zinc-700 text-zinc-300"
                    >
                      <ChevronRight className="size-3" />
                    </Button>
                  </div>
                ) : (
                  <span className="text-[9px] text-zinc-500">
                    {isCatalogActive ? "Full Dataset Live" : "24 Offline Samples"}
                  </span>
                )}

                <input
                  ref={customPlantInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleAddCustomPalettePhoto(e, paletteType === "crop" ? "crop" : "weed")}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  size="xs"
                  disabled={isRunning}
                  onClick={() => customPlantInputRef.current?.click()}
                  className="border-zinc-700 text-zinc-300 h-6"
                  title="Upload your own weed or crop image to drag onto the path"
                >
                  <Upload className="size-3" />
                  <span>+ Custom</span>
                </Button>
              </div>

              {/* Field Quick-Action Buttons */}
              <div className="grid grid-cols-3 gap-1.5 pt-1">
                <Button
                  variant="outline"
                  size="xs"
                  disabled={isRunning}
                  onClick={() => {
                    handleReset();
                    setPlants(buildDemoFieldPreset(trackLengthCm));
                  }}
                  className="border-zinc-700 text-zinc-300 h-7"
                >
                  <Sparkles className="size-3" />
                  <span>Demo</span>
                </Button>
                <Button
                  variant="outline"
                  size="xs"
                  disabled={isRunning}
                  onClick={() => {
                    handleReset();
                    setPlants(buildRandomField(trackLengthCm, displayedPalette));
                  }}
                  className="border-zinc-700 text-zinc-300 h-7"
                >
                  <Shuffle className="size-3" />
                  <span>Random</span>
                </Button>
                <Button
                  variant="outline"
                  size="xs"
                  disabled={isRunning}
                  onClick={() => {
                    handleReset();
                    setPlants([]);
                  }}
                  className="border-rose-500/30 text-rose-400 hover:bg-rose-500/15 h-7"
                >
                  <Trash2 className="size-3" />
                  <span>Clear</span>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Mission Efficiency Summary Card */}
          <Card className="border-zinc-800 bg-zinc-950/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold text-zinc-100">
                MISSION TELEMETRY & SAVINGS
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 pt-1 text-xs font-mono">
              <div className="p-2 rounded-lg bg-zinc-900/60 border border-zinc-800/80">
                <div className="text-[10px] text-zinc-400 flex items-center gap-1">
                  <Ruler className="size-3 text-sky-400" />
                  <span>PROGRESS</span>
                </div>
                <div className="text-sm font-bold text-zinc-100 mt-0.5">
                  {stats.distanceCm} / {trackLengthCm} cm
                </div>
              </div>

              <div className="p-2 rounded-lg bg-zinc-900/60 border border-zinc-800/80">
                <div className="text-[10px] text-zinc-400 flex items-center gap-1">
                  <Target className="size-3 text-rose-400" />
                  <span>WEEDS SPRAYED</span>
                </div>
                <div className="text-sm font-bold text-rose-400 mt-0.5">
                  {stats.weedsSprayed} / {totalWeedsPlaced}
                </div>
              </div>

              <div className="p-2 rounded-lg bg-zinc-900/60 border border-zinc-800/80">
                <div className="text-[10px] text-zinc-400 flex items-center gap-1">
                  <Sprout className="size-3 text-emerald-400" />
                  <span>CROPS SAFE</span>
                </div>
                <div className="text-sm font-bold text-emerald-400 mt-0.5">
                  {stats.cropsProtected} / {totalCropsPlaced}
                </div>
              </div>

              <div className="p-2 rounded-lg bg-zinc-900/60 border border-zinc-800/80">
                <div className="text-[10px] text-zinc-400 flex items-center gap-1">
                  <Droplets className="size-3 text-cyan-400" />
                  <span>SAVED CHEM</span>
                </div>
                <div className="text-sm font-bold text-cyan-400 mt-0.5">
                  {herbicideSavedPct}% ({stats.herbicideMl}mL)
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Calibration for Real Bot Mirroring */}
          {mirrorRealBot && (
            <Card className="border-emerald-500/30 bg-zinc-950/80">
              <CardContent className="p-3 space-y-2 text-[11px] font-mono">
                <div className="flex items-center justify-between">
                  <span className="text-emerald-400 font-bold">30 CM MOTOR TIME</span>
                  <span className="text-zinc-200">
                    {(pulseMsPer30Cm / 1000).toFixed(2)} s ({Math.round(pulseMsPer30Cm / 30)} ms/cm)
                  </span>
                </div>
                <Slider
                  value={pulseMsPer30Cm}
                  min={300}
                  max={3000}
                  step={10}
                  onChange={setPulseMsPer30Cm}
                />
                <div className="flex items-center justify-between gap-2 text-[10px] text-zinc-400">
                  <span>
                    10 cm = {Math.round(pulseMsPer30Cm / 3)} ms | 30 cm = {pulseMsPer30Cm} ms
                  </span>
                  {pulseMsPer30Cm !== DEFAULT_MS_PER_30CM && (
                    <button
                      type="button"
                      onClick={() => setPulseMsPer30Cm(DEFAULT_MS_PER_30CM)}
                      className="px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 shrink-0"
                    >
                      Reset 1.13s
                    </button>
                  )}
                </div>

                <div className="pt-2 border-t border-zinc-800/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sky-400 font-bold">N20 START → END TIME</span>
                    <span className="text-zinc-200">
                      {(n20FullSweepMs / 1000).toFixed(1)} s
                    </span>
                  </div>
                  <Slider
                    value={n20FullSweepMs}
                    min={2000}
                    max={15000}
                    step={500}
                    onChange={setN20FullSweepMs}
                  />
                  <div className="flex items-center justify-between gap-2 text-[10px] text-zinc-400">
                    <span>Full Left ↔ Right rail sweep = 10.0 sec.</span>
                    {n20FullSweepMs !== 10000 && (
                      <button
                        type="button"
                        onClick={() => setN20FullSweepMs(10000)}
                        className="px-1.5 py-0.5 rounded bg-sky-500/15 border border-sky-500/30 text-sky-300 shrink-0"
                      >
                        Reset 10.0s
                      </button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* CENTER COLUMN (5 cols): Interactive 1D Straight-Line Field Track */}
        <div className="lg:col-span-5 flex flex-col">
          <Card className="border-zinc-800 bg-zinc-950/80 flex-1 flex flex-col">
            <CardContent className="p-3 sm:p-4 flex-1 flex flex-col">
              <VirtualFieldTrack
                trackLengthCm={trackLengthCm}
                plants={plants}
                botCm={botCm}
                nozzleCm={nozzleCm}
                nozzleX={nozzleX}
                driveState={driveState}
                n20State={n20State}
                isSpraying={isSpraying}
                activeZone={activeZone}
                phase={phase}
                armedTemplate={armedTemplate}
                visualMode={visualMode}
                isLocked={isRunning}
                onDropPlant={handleDropPlant}
                onMovePlant={handleMovePlant}
                onRemovePlant={handleRemovePlant}
              />
            </CardContent>
          </Card>
        </div>

        {/* RIGHT COLUMN (4 cols): Camera Feed, 4-Dir Nozzle HUD, Autonomous Log */}
        <div className="lg:col-span-4 space-y-4">
          <VirtualCameraHud
            yoloServerUrl={yoloServerUrl}
            onChangeYoloUrl={setYoloServerUrl}
            yoloHealth={yoloHealth}
            onCheckYolo={refreshYoloHealth}
            yoloConf={yoloConf}
            onChangeYoloConf={setYoloConf}
            strictYoloOnly={strictYoloOnly}
            onToggleStrictYolo={setStrictYoloOnly}
            rawFrameUrl={rawFrameUrl}
            cameraFrameUrl={cameraFrameUrl}
            visionSource={visionSource}
            lastDetections={lastDetections}
            lastLatencyMs={lastLatencyMs}
            lastYoloProof={lastYoloProof}
            activeZone={activeZone}
            onTestCustomPhoto={handleTestCustomPhoto}
          />

          <Nozzle4DirHud
            botCm={botCm}
            nozzleCm={nozzleCm}
            nozzleX={nozzleX}
            driveState={driveState}
            n20State={n20State}
            isSpraying={isSpraying}
            phase={phase}
          />

          {/* Step-by-Step Autonomous Rule Log */}
          <Card className="border-zinc-800 bg-zinc-950/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold text-zinc-100 flex items-center gap-2">
                <Terminal className="size-4 text-emerald-400" />
                AUTONOMOUS STEP LOG
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-1">
              <div className="h-44 overflow-y-auto rounded-lg bg-zinc-900/70 border border-zinc-800 p-2 space-y-1 font-mono text-[10px]">
                {cycleLog.map((entry) => {
                  const color =
                    entry.level === "spray"
                      ? "text-cyan-300"
                      : entry.level === "target"
                      ? "text-rose-300"
                      : entry.level === "crop"
                      ? "text-emerald-300"
                      : entry.level === "scan"
                      ? "text-amber-300"
                      : entry.level === "error"
                      ? "text-rose-400"
                      : entry.level === "success"
                      ? "text-emerald-400 font-bold"
                      : "text-zinc-300";

                  return (
                    <div key={entry.id} className="leading-snug">
                      <span className="text-zinc-500 mr-1.5">[{entry.time}]</span>
                      <span className={color}>{entry.text}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
