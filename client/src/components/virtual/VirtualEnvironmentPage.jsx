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
export function VirtualEnvironmentPage({
  isWsConnected,
  onDriveStep, // (direction: "FORWARD" | "BACKWARD" | "STOP") => void
  onN20Step, // (dir: "FORWARD" | "BACKWARD" | "STOP", speed?: number) => void
  onEmergencyStop,
}) {
  // Field configuration
  const [trackLengthCm, setTrackLengthCm] = useState(100);
  const [plants, setPlants] = useState(() => buildDemoFieldPreset(100));
  const [armedTemplate, setArmedTemplate] = useState(null);
  const [visualMode, setVisualMode] = useState("dataset"); // "dataset" | "schematic"
  const [speedMultiplier, setSpeedMultiplier] = useState(1);

  // Real hardware sync
  const [mirrorRealBot, setMirrorRealBot] = useState(false);
  const [pulseMsPer10Cm, setPulseMsPer10Cm] = useState(450);

  // YOLO backend state
  const [yoloServerUrl, setYoloServerUrl] = useState(DEFAULT_YOLO_SERVER_URL);
  const [yoloHealth, setYoloHealth] = useState({ online: false });
  const [yoloConf, setYoloConf] = useState(0.3);
  const [cameraFrameUrl, setCameraFrameUrl] = useState(null);
  const [visionSource, setVisionSource] = useState(null);
  const [lastDetections, setLastDetections] = useState([]);
  const [lastLatencyMs, setLastLatencyMs] = useState(null);

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
  const speedRef = useRef(1);
  const mirrorRef = useRef(false);
  const pulseMsRef = useRef(450);
  const yoloUrlRef = useRef(yoloServerUrl);
  const yoloConfRef = useRef(yoloConf);
  const visualModeRef = useRef(visualMode);
  const plantsRef = useRef(plants);

  const botPosRef = useRef({ botCm: 0, nozzleCm: 0, nozzleX: 0 });

  useEffect(() => {
    speedRef.current = speedMultiplier;
  }, [speedMultiplier]);

  useEffect(() => {
    mirrorRef.current = mirrorRealBot && isWsConnected;
  }, [mirrorRealBot, isWsConnected]);

  useEffect(() => {
    pulseMsRef.current = pulseMsPer10Cm;
  }, [pulseMsPer10Cm]);

  useEffect(() => {
    yoloUrlRef.current = yoloServerUrl;
  }, [yoloServerUrl]);

  useEffect(() => {
    yoloConfRef.current = yoloConf;
  }, [yoloConf]);

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

  // Sleep helper respecting pause & cancellation
  const waitMs = useCallback(async (ms, activeRunId) => {
    let remaining = ms;
    while (remaining > 0) {
      if (runIdRef.current !== activeRunId) throw new Error("ABORTED");
      if (pausedRef.current) {
        await new Promise((r) => setTimeout(r, 60));
        continue;
      }
      const step = Math.min(30, remaining);
      await new Promise((r) => setTimeout(r, step / speedRef.current));
      remaining -= step;
    }
  }, []);

  // Smoothly animate rover & N20 nozzle to target coordinates
  const animateTo = useCallback(
    async (targetBotCm, targetNozzleCm, targetNozzleX, baseDurationMs, activeRunId) => {
      const start = { ...botPosRef.current };
      const steps = Math.max(8, Math.round(baseDurationMs / 25));

      for (let i = 1; i <= steps; i++) {
        if (runIdRef.current !== activeRunId) throw new Error("ABORTED");
        while (pausedRef.current) {
          if (runIdRef.current !== activeRunId) throw new Error("ABORTED");
          await new Promise((r) => setTimeout(r, 60));
        }

        const t = i / steps;
        const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

        const curBot = start.botCm + (targetBotCm - start.botCm) * ease;
        const curNozzleY = start.nozzleCm + (targetNozzleCm - start.nozzleCm) * ease;
        const curNozzleX = start.nozzleX + (targetNozzleX - start.nozzleX) * ease;
        updateBotPose(curBot, curNozzleY, curNozzleX);

        await new Promise((r) => setTimeout(r, Math.max(12, 25 / speedRef.current)));
      }

      updateBotPose(targetBotCm, targetNozzleCm, targetNozzleX);
    },
    [updateBotPose]
  );

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

  // Execute one 10 cm scan-detect-spray cycle
  const executeSingleZone = useCallback(
    async (zoneIdx, activeRunId) => {
      const zoneStart = zoneIdx * 10;
      const zoneEnd = Math.min(trackLengthCm, zoneStart + 10);
      const checkpointNozzleY = zoneStart + (zoneEnd - zoneStart) / 2;

      setCurrentZoneIndex(zoneIdx);
      setActiveZone({ startCm: zoneStart, endCm: zoneEnd });

      // ------------------------------------------------------------------
      // STEP 1: Move 10 cm Forward along the single-line path
      // ------------------------------------------------------------------
      setPhase("MOVE_10CM");
      setDriveState("FORWARD");
      setN20State("STOP");
      appendLog(`Moving 10 cm forward (${zoneStart} -> ${zoneEnd} cm)...`, "move");

      if (mirrorRef.current) {
        onDriveStep?.("FORWARD");
      }

      const travelDuration = mirrorRef.current ? pulseMsRef.current : 750;
      await animateTo(zoneEnd, checkpointNozzleY, 0, travelDuration, activeRunId);

      setDriveState("STOP");
      if (mirrorRef.current) {
        onDriveStep?.("STOP");
      }

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

      const rawSnapshot = await renderZoneCameraSnapshot({
        plants: zonePlants,
        zoneStartCm: zoneStart,
        zoneEndCm: zoneEnd,
        imageCache: imageCacheRef.current,
        visualMode: visualModeRef.current,
      });

      let detectedList = [];
      let annotatedUrl = rawSnapshot;
      let usedSource = "fallback";
      let latency = null;

      // Try live YOLOv8 best.pt backend first when zone has plants (or always inspect)
      const health = await checkYoloHealth(yoloUrlRef.current);
      setYoloHealth(health);

      if (health.online) {
        try {
          const yoloResult = await detectFrameWithYolo(
            yoloUrlRef.current,
            rawSnapshot,
            yoloConfRef.current
          );
          if (yoloResult && Array.isArray(yoloResult.detections) && yoloResult.detections.length > 0) {
            usedSource = "yolo";
            annotatedUrl = yoloResult.annotated_image;
            latency = yoloResult.latency_ms;

            // Map pixel (norm_x, norm_y) back to track coordinates
            const span = Math.max(1, zoneEnd - zoneStart);
            detectedList = yoloResult.detections.map((d, idx) => {
              const estLat = Math.max(-0.85, Math.min(0.85, ((d.norm_x * 512 - 70) / (512 - 140)) * 2 - 1));
              const estCm = Math.max(
                zoneStart,
                Math.min(zoneEnd, zoneEnd - ((d.norm_y * 512 - 60) / (512 - 120)) * span)
              );
              // Match nearest virtual plant of same class so we can mark it sprayed/protected
              const nearest = zonePlants.find(
                (p) =>
                  p.type === d.class &&
                  Math.abs(p.positionCm - estCm) < 3.5 &&
                  Math.abs(p.lateralOffset - estLat) < 0.45
              );
              return {
                ...d,
                plantId: nearest?.id || `yolo-${zoneIdx}-${idx}`,
                positionCm: nearest ? nearest.positionCm : Number(estCm.toFixed(1)),
                lateralOffset: nearest ? nearest.lateralOffset : Number(estLat.toFixed(2)),
              };
            });
          }
        } catch {
          // Fall back cleanly if YOLO server drops mid-run
        }
      }

      // Built-in Simulation Vision fallback (offline or schematic mode)
      if (usedSource !== "yolo") {
        const fallback = await annotateFallbackFrame(rawSnapshot, zonePlants, zoneStart, zoneEnd);
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

      await waitMs(550, activeRunId);

      const detectedWeeds = detectedList
        .filter((d) => d.class === "weed")
        .sort((a, b) => a.positionCm - b.positionCm);
      const detectedCrops = detectedList.filter((d) => d.class === "crop");

      // Mark protected crops immediately
      const cropIdsToProtect = new Set([
        ...detectedCrops.map((c) => c.plantId),
        ...zonePlants.filter((p) => p.type === "crop").map((p) => p.id),
      ]);

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

          appendLog(
            `Targeting weed @ ${weed.positionCm.toFixed(1)} cm (X=${Math.round(
              weed.lateralOffset * 100
            )}%): Rover ${longDir} + N20 ${latDir}`,
            "target"
          );

          if (mirrorRef.current) {
            if (longDir !== "STOP") {
              onDriveStep?.(longDir === "FORWARD" ? "FORWARD" : "BACKWARD");
            }
            if (latDir !== "STOP") {
              onN20Step?.(latDir === "RIGHT" ? "FORWARD" : "BACKWARD", 180);
            }
          }

          const targetBot = cur.botCm + deltaCm;
          await animateTo(targetBot, weed.positionCm, weed.lateralOffset, 520, activeRunId);

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

          if (mirrorRef.current) {
            if (realignDrive !== "STOP") {
              onDriveStep?.(realignDrive === "FORWARD" ? "FORWARD" : "BACKWARD");
            }
            if (realignN20 !== "STOP") {
              onN20Step?.(realignN20 === "RIGHT" ? "FORWARD" : "BACKWARD", 180);
            }
          }

          await animateTo(zoneEnd, checkpointNozzleY, 0, 400, activeRunId);
          stopHardwareActuators();
        }
      }
    },
    [
      trackLengthCm,
      animateTo,
      waitMs,
      appendLog,
      onDriveStep,
      onN20Step,
      stopHardwareActuators,
    ]
  );

  // Full autonomous run from currentZoneIndex -> end of path
  const handleRunMission = async () => {
    if (isRunning && isPaused) {
      pausedRef.current = false;
      setIsPaused(false);
      appendLog("Mission resumed.", "info");
      return;
    }
    if (isRunning) return;

    const totalZones = Math.ceil(trackLengthCm / 10);
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
    appendLog(`Starting autonomous 10 cm patrol (${trackLengthCm} cm row)...`, "info");

    try {
      for (let z = startIdx; z < totalZones; z++) {
        await executeSingleZone(z, activeRunId);
      }

      if (runIdRef.current === activeRunId) {
        setPhase("COMPLETE");
        setCurrentZoneIndex(totalZones);
        stopHardwareActuators();
        appendLog("Mission complete! Entire straight path scanned & treated.", "success");
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

  // Single 10 cm zone step (ideal for live presentation walkthroughs)
  const handleStepZone = async () => {
    if (isRunning) return;
    const totalZones = Math.ceil(trackLengthCm / 10);
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
        setCurrentZoneIndex(nextIdx);
        setPhase(nextIdx >= totalZones ? "COMPLETE" : "PAUSED");
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
    setCameraFrameUrl(null);
    setVisionSource(null);
    setLastDetections([]);
    setLastLatencyMs(null);
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

  const handleTrackLengthChange = (newLen) => {
    if (isRunning) return;
    setTrackLengthCm(newLen);
    handleReset();
    setPlants(buildDemoFieldPreset(newLen));
  };

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
              title="Advance exactly 10 cm, scan, and spray"
            >
              <StepForward className="size-4 text-sky-400" />
              <span>STEP 10 CM</span>
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
              {[60, 100, 120].map((len) => (
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

            {/* Sim Speed */}
            <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
              <span className="text-[10px] text-zinc-400 px-1">SPEED</span>
              {[0.5, 1, 2].map((spd) => (
                <button
                  key={spd}
                  type="button"
                  onClick={() => setSpeedMultiplier(spd)}
                  className={`px-2 py-0.5 rounded text-[11px] ${
                    speedMultiplier === spd
                      ? "bg-sky-500 text-zinc-950 font-bold"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>

            {/* Mirror to Real ESP8266 Bot */}
            <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1">
              <Radio
                className={`size-3.5 ${
                  mirrorRealBot && isWsConnected ? "text-emerald-400 animate-pulse" : "text-zinc-500"
                }`}
              />
              <span className="text-[11px] text-zinc-300">Mirror Real Bot</span>
              <Switch checked={mirrorRealBot} onCheckedChange={setMirrorRealBot} />
              {mirrorRealBot && !isWsConnected && (
                <span className="text-[10px] text-amber-400">(WS Offline)</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main 3-Column Virtual Field Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT COLUMN (3 cols): Drag-and-Drop Plant Palette + Mission Stats */}
        <div className="lg:col-span-3 space-y-4">
          <Card className="border-zinc-800 bg-zinc-950/80">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-bold text-zinc-100 flex items-center gap-2">
                  <Plus className="size-4 text-emerald-400" />
                  PLANT PALETTE (DRAG & DROP)
                </CardTitle>
                <Badge variant="outline" className="text-[10px] font-mono">
                  {plants.length} items
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-3 pt-1">
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

              {/* Draggable Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
                {PLANT_PALETTE.map((item) => {
                  const isWeed = item.type === "weed";
                  const isArmed = armedTemplate === item.key;

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
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      onClick={() => {
                        if (isRunning) return;
                        setArmedTemplate((prev) => (prev === item.key ? null : item.key));
                      }}
                      className={`flex items-center gap-2.5 p-2 rounded-xl border transition-all select-none ${
                        isRunning
                          ? "opacity-50 cursor-not-allowed border-zinc-800 bg-zinc-900/40"
                          : isArmed
                          ? "border-emerald-400 bg-emerald-500/15 ring-1 ring-emerald-400/50 cursor-pointer"
                          : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-600 cursor-grab active:cursor-grabbing"
                      }`}
                    >
                      <img
                        src={item.sampleImage}
                        alt={item.label}
                        draggable={false}
                        className={`w-10 h-10 rounded-lg object-cover border shrink-0 ${
                          isWeed ? "border-rose-500/60" : "border-emerald-500/60"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-semibold text-zinc-100 truncate">
                            {item.label}
                          </span>
                          <span
                            className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded ${
                              isWeed
                                ? "bg-rose-500/20 text-rose-400"
                                : "bg-emerald-500/20 text-emerald-400"
                            }`}
                          >
                            {item.badge}
                          </span>
                        </div>
                        <p className="text-[10px] text-zinc-400 truncate">{item.description}</p>
                      </div>
                    </div>
                  );
                })}
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
                    setPlants(buildRandomField(trackLengthCm));
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
                  <span className="text-emerald-400 font-bold">10 CM MOTOR PULSE</span>
                  <span className="text-zinc-200">{pulseMsPer10Cm} ms</span>
                </div>
                <Slider
                  value={pulseMsPer10Cm}
                  min={200}
                  max={1200}
                  step={50}
                  onChange={setPulseMsPer10Cm}
                />
                <div className="text-[10px] text-zinc-400">
                  Calibrates how long ESP8266 drives forward for each 10 cm virtual step.
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* CENTER COLUMN (5 cols): Interactive 1D Straight-Line Field Track */}
        <div className="lg:col-span-5">
          <Card className="border-zinc-800 bg-zinc-950/80">
            <CardContent className="p-3 sm:p-4">
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
            cameraFrameUrl={cameraFrameUrl}
            visionSource={visionSource}
            lastDetections={lastDetections}
            lastLatencyMs={lastLatencyMs}
            activeZone={activeZone}
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
