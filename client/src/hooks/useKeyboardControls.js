import { useEffect } from "react";

/**
 * useKeyboardControls
 * Listens for WASD, Arrow keys, Q/E for spin, and Spacebar for Emergency Stop
 */
export function useKeyboardControls({
  onDPadPress,
  onStop,
  onEmergencyStop,
  onN20Control,
  enabled = true,
}) {
  useEffect(() => {
    if (!enabled) return;

    const activeKeys = new Set();

    const handleKeyDown = (e) => {
      // Avoid triggering when user is typing in an input field
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

      const key = e.key.toUpperCase();
      if (activeKeys.has(key)) return;
      activeKeys.add(key);

      // Spacebar -> Emergency Stop
      if (e.code === "Space") {
        e.preventDefault();
        onEmergencyStop();
        return;
      }

      // Drive Movements
      if (key === "W" || key === "ARROWUP") {
        e.preventDefault();
        onDPadPress("FORWARD");
      } else if (key === "S" || key === "ARROWDOWN") {
        e.preventDefault();
        onDPadPress("BACKWARD");
      } else if (key === "A" || key === "ARROWLEFT") {
        e.preventDefault();
        onDPadPress("SPIN_LEFT");
      } else if (key === "D" || key === "ARROWRIGHT") {
        e.preventDefault();
        onDPadPress("SPIN_RIGHT");
      } else if (key === "Q") {
        onDPadPress("FWD_LEFT");
      } else if (key === "E") {
        onDPadPress("FWD_RIGHT");
      }

      // N20 Cutter Up / Down / Stop
      if (key === "U") {
        onN20Control("UP");
      } else if (key === "J") {
        onN20Control("DOWN");
      } else if (key === "K") {
        onN20Control("STOP");
      }
    };

    const handleKeyUp = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

      const key = e.key.toUpperCase();
      activeKeys.delete(key);

      // If driving keys released, stop chassis
      if (["W", "S", "A", "D", "ARROWUP", "ARROWDOWN", "ARROWLEFT", "ARROWRIGHT", "Q", "E"].includes(key)) {
        if (![...activeKeys].some((k) => ["W", "S", "A", "D", "ARROWUP", "ARROWDOWN", "ARROWLEFT", "ARROWRIGHT", "Q", "E"].includes(k))) {
          onStop();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [enabled, onDPadPress, onStop, onEmergencyStop, onN20Control]);
}
