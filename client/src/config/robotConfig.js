// Configuration for AgriRover Pro & TB6612FNG N20 Weeding System

export const DEFAULT_CONFIG = {
  // Connection defaults
  defaultIp: (typeof window !== "undefined" && window.location.hostname && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1")
    ? window.location.hostname
    : "192.168.1.15",
  wsPort: 81,
  httpPort: 80,
  reconnectIntervalMs: 2000,
  pingIntervalMs: 2500,

  // Rover Drive Configuration
  defaultSpeed: 200,
  minSpeed: 60,
  maxSpeed: 255,
  deadzone: 0.15, // 15% center deadzone to prevent drift
  rateLimitMs: 40, // WebSocket stream interval (25 packets/sec)
  httpRateLimitMs: 120, // HTTP fallback interval

  // N20 Motor TB6612FNG Defaults
  defaultN20Speed: 180,
  n20MinSpeed: 50,
  n20MaxSpeed: 255,

  // Motor mapping (Front-Left=M4, Front-Right=M3, Rear-Left=M2, Rear-Right=M1)
  motors: {
    frontLeft: 4,
    frontRight: 3,
    rearLeft: 2,
    rearRight: 1,
  },

  // Agricultural Weed Detection Demo Presets
  weedClasses: [
    { id: "broadleaf", name: "Broadleaf Weed", color: "#ef4444", danger: "High" },
    { id: "grassy", name: "Grassy Weed", color: "#f59e0b", danger: "Medium" },
    { id: "sedge", name: "Yellow Nutsedge", color: "#ec4899", danger: "Critical" },
    { id: "crop", name: "Healthy Crop", color: "#10b981", danger: "Safe" },
  ]
};
