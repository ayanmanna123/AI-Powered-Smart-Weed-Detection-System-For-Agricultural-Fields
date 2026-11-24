/**
 * Client service for the local Python YOLOv8 Virtual Demo Inference Server
 * (python/src/virtual_demo_server.py on port 5050).
 *
 * Also renders 512x512 virtual camera snapshots of the active 10 cm field zone
 * so both YOLOv8 (best.pt) and the built-in simulation fallback inspect the
 * exact same field-of-view frame.
 */

export const DEFAULT_YOLO_SERVER_URL = "http://127.0.0.1:5050";

/**
 * Check whether the Python YOLOv8 inference server is reachable.
 */
export async function checkYoloHealth(baseUrl = DEFAULT_YOLO_SERVER_URL) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1200);
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/health`, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return { online: false };
    const data = await res.json();
    return { online: true, ...data };
  } catch {
    clearTimeout(timeout);
    return { online: false };
  }
}

/**
 * Send a base64 camera snapshot to YOLOv8 /detect.
 */
export async function detectFrameWithYolo(
  baseUrl = DEFAULT_YOLO_SERVER_URL,
  imageBase64,
  conf = 0.3
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/detect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: imageBase64, conf }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

/**
 * Load an image URL into an HTMLImageElement (cached by caller).
 */
export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Compute non-overlapping (px, py) tile centers on a 512x512 camera frame so
 * nearby plants in the same 10 cm bay never occlude each other for YOLOv8.
 */
function resolveNonOverlappingTiles(plants, zoneStartCm, zoneEndCm, frameSize = 512) {
  if (!plants || plants.length === 0) return [];

  const count = plants.length;
  const patchSize = count === 1 ? 180 : count === 2 ? 156 : count <= 4 ? 132 : 108;
  const gap = 14;
  const minSep = patchSize + gap;
  const margin = patchSize / 2 + 12;
  const spanCm = Math.max(1, zoneEndCm - zoneStartCm);

  const items = plants.map((plant) => {
    const rawX = ((plant.lateralOffset + 1) / 2) * (frameSize - margin * 2) + margin;
    const normY = (zoneEndCm - plant.positionCm) / spanCm;
    const rawY = Math.max(margin, Math.min(frameSize - margin, normY * (frameSize - margin * 2) + margin));
    return {
      plant,
      px: Math.max(margin, Math.min(frameSize - margin, rawX)),
      py: Math.max(margin, Math.min(frameSize - margin, rawY)),
      patchSize,
    };
  });

  // Iterative pairwise separation along X/Y
  for (let iter = 0; iter < 40; iter++) {
    let moved = false;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];
        let dx = b.px - a.px;
        let dy = b.py - a.py;

        // Break exact ties deterministically using lateral/position order
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
          dx = (j - i) * 4;
          dy = (j % 2 === 0 ? 1 : -1) * 2;
        }

        const overlapX = minSep - Math.abs(dx);
        const overlapY = minSep - Math.abs(dy);

        if (overlapX > 0 && overlapY > 0) {
          moved = true;
          if (overlapX < overlapY) {
            const push = overlapX / 2 + 1;
            const sign = dx >= 0 ? 1 : -1;
            a.px -= sign * push;
            b.px += sign * push;
          } else {
            const push = overlapY / 2 + 1;
            const sign = dy >= 0 ? 1 : -1;
            a.py -= sign * push;
            b.py += sign * push;
          }

          a.px = Math.max(margin, Math.min(frameSize - margin, a.px));
          a.py = Math.max(margin, Math.min(frameSize - margin, a.py));
          b.px = Math.max(margin, Math.min(frameSize - margin, b.px));
          b.py = Math.max(margin, Math.min(frameSize - margin, b.py));
        }
      }
    }
    if (!moved) break;
  }

  // Verify no residual AABB overlap; if crowded (e.g. 5+ items), fall back to crisp grid
  let hasOverlap = false;
  for (let i = 0; i < items.length && !hasOverlap; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (
        Math.abs(items[i].px - items[j].px) < minSep - 2 &&
        Math.abs(items[i].py - items[j].py) < minSep - 2
      ) {
        hasOverlap = true;
        break;
      }
    }
  }

  if (hasOverlap) {
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);
    const cellW = (frameSize - 24) / cols;
    const cellH = (frameSize - 44) / rows;
    const gridPatch = Math.max(84, Math.min(patchSize, Math.floor(Math.min(cellW, cellH) - 10)));
    const ordered = [...items].sort((a, b) => a.py - b.py || a.px - b.px);
    ordered.forEach((item, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      item.px = 12 + cellW * (col + 0.5);
      item.py = 16 + cellH * (row + 0.5);
      item.patchSize = gridPatch;
    });
  }

  return items;
}

/**
 * Render a 512x512 top-down virtual camera frame for a 10 cm scan zone.
 *
 * Returns { dataUrl, placedTiles } where placedTiles records the exact
 * non-overlapping canvas coordinates of each plant for accurate YOLO mapping.
 */
export async function renderZoneCameraSnapshot({
  plants,
  zoneStartCm,
  zoneEndCm,
  imageCache,
  visualMode = "dataset",
}) {
  const SIZE = 512;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");

  // Rich soil background
  const grad = ctx.createLinearGradient(0, 0, 0, SIZE);
  grad.addColorStop(0, "#2f2419");
  grad.addColorStop(0.5, "#3a2c1e");
  grad.addColorStop(1, "#2a2016");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Subtle soil granules & furrow lines
  for (let i = 0; i < 220; i++) {
    const gx = (i * 73) % SIZE;
    const gy = (i * 137) % SIZE;
    ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.16)";
    ctx.fillRect(gx, gy, 3, 3);
  }

  ctx.strokeStyle = "rgba(16, 185, 129, 0.14)";
  ctx.lineWidth = 1;
  for (let p = 64; p < SIZE; p += 64) {
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, SIZE);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(SIZE, p);
    ctx.stroke();
  }

  const placedTiles = resolveNonOverlappingTiles(plants, zoneStartCm, zoneEndCm, SIZE);

  // Draw every plant in the current 10 cm zone without overlap
  for (const tile of placedTiles) {
    const { plant, px, py, patchSize } = tile;

    if (visualMode === "dataset" && plant.sampleImage) {
      let img = imageCache.get(plant.sampleImage);
      if (!img) {
        try {
          img = await loadImage(plant.sampleImage);
          imageCache.set(plant.sampleImage, img);
        } catch {
          img = null;
        }
      }
      if (img) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(px - patchSize / 2, py - patchSize / 2, patchSize, patchSize, 12);
        ctx.clip();
        ctx.drawImage(img, px - patchSize / 2, py - patchSize / 2, patchSize, patchSize);
        ctx.restore();

        ctx.strokeStyle = plant.type === "weed" ? "rgba(244,63,94,0.35)" : "rgba(16,185,129,0.35)";
        ctx.lineWidth = 2;
        ctx.strokeRect(px - patchSize / 2, py - patchSize / 2, patchSize, patchSize);
        continue;
      }
    }

    // Schematic / synthetic top-down plant drawing
    drawTopDownPlant(ctx, px, py, plant.type);
  }

  // Camera HUD metadata watermark
  ctx.fillStyle = "rgba(9, 9, 11, 0.72)";
  ctx.fillRect(8, SIZE - 34, 230, 24);
  ctx.fillStyle = "#34d399";
  ctx.font = "bold 12px monospace";
  ctx.fillText(`SCAN BAY: ${zoneStartCm.toFixed(0)}-${zoneEndCm.toFixed(0)} cm`, 16, SIZE - 17);

  return {
    dataUrl: canvas.toDataURL("image/jpeg", 0.88),
    placedTiles,
  };
}

function drawTopDownPlant(ctx, cx, cy, type) {
  const isWeed = type === "weed";
  const leafCount = isWeed ? 7 : 5;
  const leafColor = isWeed ? "#84cc16" : "#10b981";
  const edgeColor = isWeed ? "#ef4444" : "#34d399";

  ctx.save();
  ctx.translate(cx, cy);

  for (let i = 0; i < leafCount; i++) {
    const angle = (i * Math.PI * 2) / leafCount;
    ctx.save();
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.ellipse(24, 0, isWeed ? 24 : 28, isWeed ? 8 : 13, 0, 0, Math.PI * 2);
    ctx.fillStyle = leafColor;
    ctx.fill();
    ctx.strokeStyle = edgeColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, Math.PI * 2);
  ctx.fillStyle = isWeed ? "#f43f5e" : "#059669";
  ctx.fill();
  ctx.restore();
}

/**
 * Draw fallback bounding boxes onto a 512x512 snapshot when Python YOLO server
 * is offline or returns no synthetic detections.
 */
export async function annotateFallbackFrame(rawDataUrl, plants, zoneStartCm, zoneEndCm, placedTiles = null) {
  const img = await loadImage(rawDataUrl);
  const SIZE = 512;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, SIZE, SIZE);

  const tiles = placedTiles || resolveNonOverlappingTiles(plants, zoneStartCm, zoneEndCm, SIZE);
  const detections = tiles.map(({ plant, px, py, patchSize }) => {
    const cx = Math.round(px);
    const cy = Math.round(py);
    const boxW = plant.sampleImage ? Math.round(patchSize * 0.8) : 100;
    const boxH = plant.sampleImage ? Math.round(patchSize * 0.8) : 100;
    const x1 = Math.max(4, cx - boxW / 2);
    const y1 = Math.max(4, cy - boxH / 2);

    const isWeed = plant.type === "weed";
    const color = isWeed ? "#f43f5e" : "#10b981";

    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(x1, y1, boxW, boxH);

    const conf = isWeed ? 0.92 : 0.96;
    const label = `${isWeed ? "WEED" : "CROP"} ${conf.toFixed(2)}`;
    ctx.fillStyle = color;
    ctx.fillRect(x1, Math.max(0, y1 - 20), 116, 20);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 12px monospace";
    ctx.fillText(label, x1 + 5, Math.max(14, y1 - 6));

    // Center crosshair
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy);
    ctx.lineTo(cx + 10, cy);
    ctx.moveTo(cx, cy - 10);
    ctx.lineTo(cx, cy + 10);
    ctx.stroke();

    return {
      plantId: plant.id,
      class: plant.type,
      confidence: conf,
      center_x: cx,
      center_y: cy,
      norm_x: Number((cx / SIZE).toFixed(4)),
      norm_y: Number((cy / SIZE).toFixed(4)),
      width: boxW,
      height: boxH,
      positionCm: plant.positionCm,
      lateralOffset: plant.lateralOffset,
    };
  });

  ctx.fillStyle = "rgba(9, 9, 11, 0.78)";
  ctx.fillRect(8, 8, 250, 24);
  ctx.fillStyle = "#fbbf24";
  ctx.font = "bold 12px monospace";
  ctx.fillText(`SIM VISION | Detections: ${detections.length}`, 16, 24);

  return {
    annotated_image: canvas.toDataURL("image/jpeg", 0.88),
    detections,
  };
}
