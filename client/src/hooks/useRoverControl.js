import { useState, useRef, useCallback, useEffect } from "react";
import { calculateKinematics, getDPadKinematics } from "@/lib/kinematics";
import { RobotApi } from "@/services/robotApi";

/**
 * useRoverControl
 * Unified state and dispatch controller for the 4WD Rover and N20 Motor.
 * Seamlessly manages rate limiting, WebSocket streaming, and fallback to HTTP.
 */
export function useRoverControl({ ip, httpPort = 80, wsSend, isWsConnected }) {
  const [maxSpeed, setMaxSpeed] = useState(200);
  const [activeDirection, setActiveDirection] = useState("STOP");
  const [joystickVector, setJoystickVector] = useState({ x: 0, y: 0, magnitude: 0, angle: 0 });
  const [motorTelemetry, setMotorTelemetry] = useState({
    m1: { speed: 0, dir: "F" },
    m2: { speed: 0, dir: "F" },
    m3: { speed: 0, dir: "F" },
    m4: { speed: 0, dir: "F" },
  });

  // N20 Cutter motor state
  const [n20Speed, setN20Speed] = useState(180);
  const [n20Direction, setN20Direction] = useState("STOP");
  const [n20Power, setN20Power] = useState(true);

  const robotApiRef = useRef(new RobotApi(ip, httpPort));
  const lastSendTimeRef = useRef(0);
  const lastCommandRef = useRef("");
  const pendingStopTimeoutRef = useRef(null);
  const mirrorTimersRef = useRef([]);

  const clearMirrorTimers = useCallback(() => {
    mirrorTimersRef.current.forEach((id) => clearTimeout(id));
    mirrorTimersRef.current = [];
  }, []);

  useEffect(() => {
    robotApiRef.current.setIp(ip, httpPort);
  }, [ip, httpPort]);

  // Dispatch drive command to ESP8266
  const dispatchDrive = useCallback(
    (kinematics, isImmediateStop = false) => {
      const now = performance.now();
      const interval = isWsConnected ? 60 : 120; // 60ms for WS (16Hz is buttery smooth and zero lag)
      const cmd = kinematics.wsCommand;

      // Cancel any trailing delayed STOP so a new drive command is never killed
      if (!isImmediateStop && cmd !== "STOP") {
        if (pendingStopTimeoutRef.current) {
          clearTimeout(pendingStopTimeoutRef.current);
          pendingStopTimeoutRef.current = null;
        }
      }

      // Immediate stop always bypasses throttling
      if (isImmediateStop) {
        lastSendTimeRef.current = now;
        lastCommandRef.current = "STOP";
      } else {
        const isSameCmd = cmd === lastCommandRef.current;
        // Prevent flooding TCP socket when holding the stick steady,
        // but never drop a direction/command change (e.g. STOP -> FORWARD)
        if (isSameCmd && now - lastSendTimeRef.current < 400) {
          return;
        }
        if (isSameCmd && now - lastSendTimeRef.current < interval) {
          return;
        }
        lastSendTimeRef.current = now;
        lastCommandRef.current = cmd;
      }

      setMotorTelemetry(kinematics.motors || {
        m1: { speed: 0, dir: "F" },
        m2: { speed: 0, dir: "F" },
        m3: { speed: 0, dir: "F" },
        m4: { speed: 0, dir: "F" },
      });

      if (isWsConnected) {
        wsSend(cmd);
      } else {
        if (cmd === "STOP" || isImmediateStop) {
          robotApiRef.current.sendStop(false).catch(() => {});
        } else {
          const { m1, m2, m3, m4 } = kinematics.motors;
          robotApiRef.current
            .sendDrive(m1.speed, m1.dir, m2.speed, m2.dir, m3.speed, m3.dir, m4.speed, m4.dir)
            .catch(() => {});
        }
      }
    },
    [isWsConnected, wsSend]
  );

  // Stop rover chassis
  const stopRover = useCallback(() => {
    clearMirrorTimers();
    setActiveDirection("STOP");
    setJoystickVector({ x: 0, y: 0, magnitude: 0, angle: 0 });
    const stopKinematics = calculateKinematics(0, 0, 0, 0.15);
    dispatchDrive(stopKinematics, true);

    // Redundant stop burst to guarantee Arduino Uno stops
    if (pendingStopTimeoutRef.current) clearTimeout(pendingStopTimeoutRef.current);
    pendingStopTimeoutRef.current = setTimeout(() => {
      if (isWsConnected) {
        wsSend("STOP");
      } else {
        robotApiRef.current.sendStop(false).catch(() => {});
      }
    }, 50);
  }, [clearMirrorTimers, dispatchDrive, isWsConnected, wsSend]);

  // Emergency Stop (Both chassis & N20 Cutter)
  const emergencyStop = useCallback(() => {
    clearMirrorTimers();
    if (pendingStopTimeoutRef.current) {
      clearTimeout(pendingStopTimeoutRef.current);
      pendingStopTimeoutRef.current = null;
    }
    setActiveDirection("EMERGENCY_STOP");
    setN20Direction("STOP");
    setJoystickVector({ x: 0, y: 0, magnitude: 0, angle: 0 });
    setMotorTelemetry({
      m1: { speed: 0, dir: "F" },
      m2: { speed: 0, dir: "F" },
      m3: { speed: 0, dir: "F" },
      m4: { speed: 0, dir: "F" },
    });

    if (isWsConnected) {
      wsSend("ESTOP");
    } else {
      robotApiRef.current.sendStop(true).catch(() => {});
      robotApiRef.current.sendN20("STOP", 0, n20Power).catch(() => {});
    }
  }, [clearMirrorTimers, isWsConnected, wsSend, n20Power]);

  // Handle Joystick (x, y) coordinates (-1.0 to 1.0)
  const handleJoystickMove = useCallback(
    (x, y) => {
      const kinematics = calculateKinematics(x, y, maxSpeed, 0.15);
      const mag = Math.sqrt(x * x + y * y);
      const angle = (Math.atan2(y, x) * 180) / Math.PI;

      setJoystickVector({ x, y, magnitude: mag, angle });

      if (kinematics.isStopped) {
        setActiveDirection("STOP");
        dispatchDrive(kinematics, true);
      } else {
        setActiveDirection("JOYSTICK");
        dispatchDrive(kinematics, false);
      }
    },
    [maxSpeed, dispatchDrive]
  );

  // Handle D-Pad discrete actions
  const handleDPadPress = useCallback(
    (direction) => {
      clearMirrorTimers();
      setActiveDirection(direction);
      const kinematics = getDPadKinematics(direction, maxSpeed);
      dispatchDrive(kinematics, direction === "STOP");
    },
    [clearMirrorTimers, maxSpeed, dispatchDrive]
  );

  // Reliable all-4-motor drive for Virtual Mirror Mode (paces UNO:M4..M1 so
  // half-duplex SoftwareSerial on Arduino UNO never drops any of the 4 motors)
  const sendMirrorDrive = useCallback(
    (direction, speedOverride = maxSpeed) => {
      clearMirrorTimers();
      if (direction === "STOP") {
        stopRover();
        return;
      }

      setActiveDirection(direction);
      const spd = Math.min(255, Math.max(0, speedOverride));
      const kinematics = getDPadKinematics(direction, spd);
      dispatchDrive(kinematics, false);

      if (isWsConnected && (direction === "FORWARD" || direction === "BACKWARD")) {
        const unoDir = direction === "FORWARD" ? "F" : "R";
        const motors = [4, 3, 2, 1];
        motors.forEach((m, idx) => {
          const timerId = setTimeout(() => {
            wsSend(`UNO:M${m},${spd},${unoDir}`);
          }, 25 + idx * 30);
          mirrorTimersRef.current.push(timerId);
        });
      }
    },
    [clearMirrorTimers, dispatchDrive, isWsConnected, maxSpeed, stopRover, wsSend]
  );

  // Handle N20 TB6612FNG cutter motor
  const handleN20Control = useCallback(
    (dir, speed = n20Speed, power = n20Power) => {
      setN20Direction(dir);
      if (dir !== "STOP" && speed > 0) {
        setN20Speed(speed);
      }
      setN20Power(power);
      const effectiveSpeed = dir === "STOP" ? 0 : speed;

      if (isWsConnected) {
        wsSend(`N20:${dir},${effectiveSpeed},${power ? 1 : 0}`);
      } else {
        robotApiRef.current.sendN20(dir, effectiveSpeed, power).catch(() => {});
      }
    },
    [n20Speed, n20Power, isWsConnected, wsSend]
  );

  return {
    maxSpeed,
    setMaxSpeed,
    activeDirection,
    joystickVector,
    motorTelemetry,
    handleJoystickMove,
    handleDPadPress,
    sendMirrorDrive,
    stopRover,
    emergencyStop,
    // N20 Motor Controls
    n20Speed,
    setN20Speed,
    n20Direction,
    n20Power,
    handleN20Control,
  };
}
