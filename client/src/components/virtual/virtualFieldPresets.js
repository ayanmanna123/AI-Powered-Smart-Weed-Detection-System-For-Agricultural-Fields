/**
 * Palette items, sample dataset sprites, and preset field paths
 * for the 1D Straight-Row Virtual Field Simulator.
 */

export const PLANT_PALETTE = [
  {
    key: "weed_broadleaf",
    type: "weed",
    label: "Broadleaf Weed",
    shortLabel: "Broadleaf",
    sampleImage: "/samples/weed_1.jpeg",
    badge: "WEED",
    description: "Invasive broadleaf weed — target for herbicide spray",
  },
  {
    key: "weed_grassy",
    type: "weed",
    label: "Grassy Weed",
    shortLabel: "Grassy",
    sampleImage: "/samples/weed_2.jpeg",
    badge: "WEED",
    description: "Fast-spreading grass weed along crop row",
  },
  {
    key: "weed_nutsedge",
    type: "weed",
    label: "Yellow Nutsedge",
    shortLabel: "Nutsedge",
    sampleImage: "/samples/weed_3.jpeg",
    badge: "WEED",
    description: "Dense sedge cluster requiring precision spot spray",
  },
  {
    key: "weed_sprout",
    type: "weed",
    label: "Emerging Weed",
    shortLabel: "Weed #4",
    sampleImage: "/samples/weed_4.jpeg",
    badge: "WEED",
    description: "Dataset weed sample (agri_0_1095)",
  },
  {
    key: "crop_row",
    type: "crop",
    label: "Healthy Crop",
    shortLabel: "Crop #1",
    sampleImage: "/samples/crop_1.jpeg",
    badge: "CROP",
    description: "Protected agricultural crop — bot must skip spraying",
  },
  {
    key: "crop_seedling",
    type: "crop",
    label: "Crop Seedling",
    shortLabel: "Crop #2",
    sampleImage: "/samples/crop_2.jpeg",
    badge: "CROP",
    description: "Dataset crop sample (agri_0_1053) — safe zone",
  },
];

let uidCounter = 1;
export function createPlantInstance(templateKey, positionCm, lateralOffset = 0) {
  const tpl = PLANT_PALETTE.find((p) => p.key === templateKey) || PLANT_PALETTE[0];
  return {
    id: `plant-${Date.now()}-${uidCounter++}`,
    templateKey: tpl.key,
    type: tpl.type,
    label: tpl.label,
    sampleImage: tpl.sampleImage,
    positionCm: Number(positionCm.toFixed(1)),
    lateralOffset: Number(Math.max(-1, Math.min(1, lateralOffset)).toFixed(2)),
    status: "pending", // pending | scanned | sprayed | protected
  };
}

export function buildDemoFieldPreset(trackLengthCm = 100) {
  const ratio = trackLengthCm / 100;
  const raw = [
    { key: "crop_row", cm: 6, lat: -0.75 },
    { key: "weed_broadleaf", cm: 8, lat: 0.92 },
    { key: "weed_grassy", cm: 16, lat: -0.94 },
    { key: "crop_seedling", cm: 24, lat: 0.15 },
    { key: "weed_nutsedge", cm: 33, lat: 0.95 },
    { key: "weed_broadleaf", cm: 37, lat: -0.45 },
    { key: "crop_row", cm: 46, lat: 0.75 },
    { key: "weed_sprout", cm: 54, lat: -0.88 },
    { key: "crop_seedling", cm: 65, lat: -0.3 },
    { key: "weed_grassy", cm: 73, lat: 0.9 },
    { key: "weed_nutsedge", cm: 84, lat: -0.92 },
    { key: "crop_row", cm: 93, lat: 0.25 },
    { key: "weed_broadleaf", cm: 96, lat: -0.95 },
  ];

  return raw
    .map((item) =>
      createPlantInstance(
        item.key,
        Math.min(trackLengthCm - 2, Math.max(2, item.cm * ratio)),
        item.lat
      )
    )
    .sort((a, b) => a.positionCm - b.positionCm);
}

export function buildRandomField(trackLengthCm = 100) {
  const items = [];
  const zones = Math.floor(trackLengthCm / 10);
  const weedTemplates = ["weed_broadleaf", "weed_grassy", "weed_nutsedge", "weed_sprout"];
  const cropTemplates = ["crop_row", "crop_seedling"];

  for (let z = 0; z < zones; z++) {
    const count = Math.random() < 0.75 ? (Math.random() < 0.4 ? 2 : 1) : 0;
    for (let i = 0; i < count; i++) {
      const isWeed = Math.random() < 0.62;
      const pool = isWeed ? weedTemplates : cropTemplates;
      const key = pool[Math.floor(Math.random() * pool.length)];
      const cm = z * 10 + 1.5 + Math.random() * 7;
      const lat = Math.random() * 2 - 1;
      items.push(createPlantInstance(key, cm, lat));
    }
  }
  return items.sort((a, b) => a.positionCm - b.positionCm);
}
