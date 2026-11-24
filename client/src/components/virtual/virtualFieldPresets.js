/**
 * Palette items, sample dataset sprites (16 weeds + 8 crops bundled offline),
 * and preset field paths for the 1D Straight-Row Virtual Field Simulator.
 *
 * When the Python server is running, VirtualEnvironmentPage also loads all
 * 665 weed + 633 crop images directly from python/archive/agri_data/data.
 */

const OFFLINE_WEED_LABELS = [
  { label: "Broadleaf Weed", category: "Broadleaf / Large" },
  { label: "Grassy Weed", category: "Cluster Weed" },
  { label: "Yellow Nutsedge", category: "Medium Weed" },
  { label: "Emerging Weed", category: "Small Sprout" },
  { label: "Amaranth Weed", category: "Broadleaf / Large" },
  { label: "Spurge Weed", category: "Small Sprout" },
  { label: "Crabgrass Patch", category: "Cluster Weed" },
  { label: "Pigweed Leaf", category: "Medium Weed" },
  { label: "Ragweed Sprout", category: "Small Sprout" },
  { label: "Foxtail Weed", category: "Medium Weed" },
  { label: "Dandelion Cluster", category: "Cluster Weed" },
  { label: "Lambsquarters", category: "Broadleaf / Large" },
  { label: "Chickweed Patch", category: "Cluster Weed" },
  { label: "Purslane Weed", category: "Medium Weed" },
  { label: "Bindweed Shoot", category: "Small Sprout" },
  { label: "Thistle Weed", category: "Broadleaf / Large" },
  { label: "Sowthistle Weed", category: "Broadleaf / Large" },
];

const OFFLINE_CROP_LABELS = [
  { label: "Healthy Crop", category: "Mature Crop" },
  { label: "Crop Seedling", category: "Seedling Crop" },
  { label: "Young Crop Row", category: "Crop Cluster" },
  { label: "Broad Crop Leaf", category: "Mature Crop" },
  { label: "Field Crop #5", category: "Mature Crop" },
  { label: "Crop Shoot #6", category: "Seedling Crop" },
  { label: "Crop Cluster #7", category: "Crop Cluster" },
  { label: "Mature Crop #8", category: "Mature Crop" },
];

export const PLANT_PALETTE = [
  ...OFFLINE_WEED_LABELS.map((meta, idx) => ({
    key: `weed_${idx + 1}`,
    type: "weed",
    label: meta.label,
    category: meta.category,
    shortLabel: `Weed #${idx + 1}`,
    sampleImage: `/samples/weed_${idx + 1}.jpeg`,
    badge: "WEED",
    description: `${meta.category} • Dataset Weed #${idx + 1}`,
  })),
  ...OFFLINE_CROP_LABELS.map((meta, idx) => ({
    key: `crop_${idx + 1}`,
    type: "crop",
    label: meta.label,
    category: meta.category,
    shortLabel: `Crop #${idx + 1}`,
    sampleImage: `/samples/crop_${idx + 1}.jpeg`,
    badge: "CROP",
    description: `${meta.category} • Protected Crop #${idx + 1}`,
  })),
];

let uidCounter = 1;

/**
 * Create a plant node from either a template key or a full template object
 * (such as an entry from the 665-weed/633-crop Python dataset catalog or custom photo).
 */
export function createPlantInstance(templateOrKey, positionCm, lateralOffset = 0) {
  const tpl =
    typeof templateOrKey === "string"
      ? PLANT_PALETTE.find((p) => p.key === templateOrKey) || PLANT_PALETTE[0]
      : templateOrKey || PLANT_PALETTE[0];

  return {
    id: `plant-${Date.now()}-${uidCounter++}`,
    templateKey: tpl.key,
    type: tpl.type,
    label: tpl.label,
    category: tpl.category || (tpl.type === "weed" ? "Weed" : "Crop"),
    sampleImage: tpl.sampleImage,
    positionCm: Number(positionCm.toFixed(1)),
    lateralOffset: Number(Math.max(-1, Math.min(1, lateralOffset)).toFixed(2)),
    status: "pending", // pending | scanned | sprayed | protected
  };
}

export function buildDemoFieldPreset(trackLengthCm = 120) {
  const ratio = trackLengthCm / 120;
  const raw = [
    { key: "crop_1", cm: 8, lat: -0.75 },
    { key: "weed_1", cm: 15, lat: 0.92 },
    { key: "weed_2", cm: 23, lat: -0.94 },
    { key: "crop_2", cm: 38, lat: 0.15 },
    { key: "weed_3", cm: 47, lat: 0.95 },
    { key: "weed_5", cm: 54, lat: -0.45 },
    { key: "crop_3", cm: 68, lat: 0.75 },
    { key: "weed_4", cm: 76, lat: -0.88 },
    { key: "weed_7", cm: 84, lat: 0.9 },
    { key: "crop_4", cm: 97, lat: -0.3 },
    { key: "weed_11", cm: 106, lat: -0.92 },
    { key: "crop_5", cm: 112, lat: 0.25 },
    { key: "weed_16", cm: 115, lat: -0.95 },
  ];

  return raw
    .map((item) =>
      createPlantInstance(
        item.key,
        Math.min(trackLengthCm - 3, Math.max(3, item.cm * ratio)),
        item.lat
      )
    )
    .sort((a, b) => a.positionCm - b.positionCm);
}

export function buildRandomField(trackLengthCm = 120, customPool = null) {
  const items = [];
  const sectionCm = 30;
  const zones = Math.floor(trackLengthCm / sectionCm);
  const sourcePool = Array.isArray(customPool) && customPool.length > 0 ? customPool : PLANT_PALETTE;
  const weedPool = sourcePool.filter((p) => p.type === "weed");
  const cropPool = sourcePool.filter((p) => p.type === "crop");

  const fallbackWeeds = PLANT_PALETTE.filter((p) => p.type === "weed");
  const fallbackCrops = PLANT_PALETTE.filter((p) => p.type === "crop");

  for (let z = 0; z < zones; z++) {
    const count = 2 + (Math.random() < 0.5 ? 1 : 0);
    for (let i = 0; i < count; i++) {
      const isWeed = Math.random() < 0.62;
      const pool = isWeed
        ? weedPool.length > 0
          ? weedPool
          : fallbackWeeds
        : cropPool.length > 0
        ? cropPool
        : fallbackCrops;
      const tpl = pool[Math.floor(Math.random() * pool.length)];
      const cm = z * sectionCm + 3 + Math.random() * (sectionCm - 6);
      const lat = Math.random() * 2 - 1;
      items.push(createPlantInstance(tpl, cm, lat));
    }
  }
  return items.sort((a, b) => a.positionCm - b.positionCm);
}
