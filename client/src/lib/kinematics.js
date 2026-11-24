/**
 * Kinematics engine for 4WD Skid-Steer / Differential Rover Chassis
 * Motor layout:
 *   Motor 4 = Front-Left (FL)
 *   Motor 3 = Front-Right (FR)
 *   Motor 2 = Rear-Left (RL)
 *   Motor 1 = Rear-Right (RR)
 */

export function calculateKinematics(x, y, maxPwm = 220, deadzone = 0.15) {
  // Calculate polar magnitude and angle
  const magnitude = Math.sqrt(x * x + y * y);

  // If inside deadzone, all motors stop immediately
  if (magnitude < deadzone) {
    return {
      isStopped: true,
      leftSpeed: 0,
      rightSpeed: 0,
      leftDir: "F",
      rightDir: "F",
      motors: {
        m1: { speed: 0, dir: "F" }, // RR
        m2: { speed: 0, dir: "F" }, // RL
        m3: { speed: 0, dir: "F" }, // FR
        m4: { speed: 0, dir: "F" }, // FL
      },
      wsCommand: "DRIVE:0,F,0,F,0,F,0,F",
    };
  }

  // Clamped normalized coordinates
  const nx = Math.max(-1, Math.min(1, x));
  const ny = Math.max(-1, Math.min(1, y));

  // Differential skid-steer blending
  // Forward motion (ny > 0) vs Backward (ny < 0)
  // Turning (nx > 0 is Right, nx < 0 is Left)
  let left = ny + nx;
  let right = ny - nx;

  // Normalize so neither side exceeds 1.0
  const maxVal = Math.max(Math.abs(left), Math.abs(right), 1.0);
  left = left / maxVal;
  right = right / maxVal;

  // Scale by requested max PWM
  const leftPwm = Math.round(Math.abs(left) * maxPwm);
  const rightPwm = Math.round(Math.abs(right) * maxPwm);

  const leftDir = left >= 0 ? "F" : "R";
  const rightDir = right >= 0 ? "F" : "R";

  // M1 (RR) and M3 (FR) get right motor values
  // M2 (RL) and M4 (FL) get left motor values
  return {
    isStopped: false,
    leftSpeed: leftPwm,
    rightSpeed: rightPwm,
    leftDir,
    rightDir,
    motors: {
      m1: { speed: rightPwm, dir: rightDir }, // RR
      m2: { speed: leftPwm, dir: leftDir },   // RL
      m3: { speed: rightPwm, dir: rightDir }, // FR
      m4: { speed: leftPwm, dir: leftDir },   // FL
    },
    // Format: DRIVE:s1,d1,s2,d2,s3,d3,s4,d4
    wsCommand: `DRIVE:${rightPwm},${rightDir},${leftPwm},${leftDir},${rightPwm},${rightDir},${leftPwm},${leftDir}`,
  };
}

/**
 * Generates discrete direction commands for D-Pad
 */
export function getDPadKinematics(direction, speed = 200) {
  const s = Math.min(255, Math.max(0, speed));

  switch (direction) {
    case "FORWARD":
      return {
        m1: { speed: s, dir: "F" },
        m2: { speed: s, dir: "F" },
        m3: { speed: s, dir: "F" },
        m4: { speed: s, dir: "F" },
        wsCommand: `DRIVE:${s},F,${s},F,${s},F,${s},F`,
      };
    case "BACKWARD":
      return {
        m1: { speed: s, dir: "R" },
        m2: { speed: s, dir: "R" },
        m3: { speed: s, dir: "R" },
        m4: { speed: s, dir: "R" },
        wsCommand: `DRIVE:${s},R,${s},R,${s},R,${s},R`,
      };
    case "SPIN_LEFT":
      return {
        m1: { speed: s, dir: "F" },
        m2: { speed: s, dir: "R" },
        m3: { speed: s, dir: "F" },
        m4: { speed: s, dir: "R" },
        wsCommand: `DRIVE:${s},F,${s},R,${s},F,${s},R`,
      };
    case "SPIN_RIGHT":
      return {
        m1: { speed: s, dir: "R" },
        m2: { speed: s, dir: "F" },
        m3: { speed: s, dir: "R" },
        m4: { speed: s, dir: "F" },
        wsCommand: `DRIVE:${s},R,${s},F,${s},R,${s},F`,
      };
    case "FWD_LEFT":
      return {
        m1: { speed: s, dir: "F" },
        m2: { speed: Math.round(s * 0.4), dir: "F" },
        m3: { speed: s, dir: "F" },
        m4: { speed: Math.round(s * 0.4), dir: "F" },
        wsCommand: `DRIVE:${s},F,${Math.round(s * 0.4)},F,${s},F,${Math.round(s * 0.4)},F`,
      };
    case "FWD_RIGHT":
      return {
        m1: { speed: Math.round(s * 0.4), dir: "F" },
        m2: { speed: s, dir: "F" },
        m3: { speed: Math.round(s * 0.4), dir: "F" },
        m4: { speed: s, dir: "F" },
        wsCommand: `DRIVE:${Math.round(s * 0.4)},F,${s},F,${Math.round(s * 0.4)},F,${s},F`,
      };
    case "REV_LEFT":
      return {
        m1: { speed: s, dir: "R" },
        m2: { speed: Math.round(s * 0.4), dir: "R" },
        m3: { speed: s, dir: "R" },
        m4: { speed: Math.round(s * 0.4), dir: "R" },
        wsCommand: `DRIVE:${s},R,${Math.round(s * 0.4)},R,${s},R,${Math.round(s * 0.4)},R`,
      };
    case "REV_RIGHT":
      return {
        m1: { speed: Math.round(s * 0.4), dir: "R" },
        m2: { speed: s, dir: "R" },
        m3: { speed: Math.round(s * 0.4), dir: "R" },
        m4: { speed: s, dir: "R" },
        wsCommand: `DRIVE:${Math.round(s * 0.4)},R,${s},R,${Math.round(s * 0.4)},R,${s},R`,
      };
    case "STOP":
    default:
      return {
        m1: { speed: 0, dir: "F" },
        m2: { speed: 0, dir: "F" },
        m3: { speed: 0, dir: "F" },
        m4: { speed: 0, dir: "F" },
        wsCommand: "STOP",
      };
  }
}
