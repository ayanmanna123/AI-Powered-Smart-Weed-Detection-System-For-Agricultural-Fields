import { useState, useEffect, useRef, useCallback } from "react";

/**
 * High-performance, Leak-Free WebSocket Hook for ESP8266
 * Prevents phantom reconnect loops, handles React StrictMode double-mounting,
 * and maintains a rock-solid persistent link.
 */
export function useWebSocket(ip, port = 81) {
  const [status, setStatus] = useState("disconnected"); // connecting, connected, disconnected, error
  const [latency, setLatency] = useState(null);
  const [telemetry, setTelemetry] = useState({
    rssi: null,
    heap: null,
    uptime: 0,
    n20Dir: "STOP",
    n20Speed: 180,
    n20Power: true,
  });
  const [logs, setLogs] = useState([]);

  const wsRef = useRef(null);
  const pingStartRef = useRef(0);
  const reconnectTimeoutRef = useRef(null);
  const pingIntervalRef = useRef(null);
  const isIntentionalCloseRef = useRef(false);

  const addLog = useCallback((text, type = "info") => {
    setLogs((prev) => [
      ...prev.slice(-99), // keep last 100 logs
      { id: Date.now() + Math.random(), time: new Date().toLocaleTimeString(), text, type },
    ]);
  }, []);

  const connect = useCallback((force = false) => {
    if (!ip) return;

    // Clear any pending reconnect timers
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // If already connected or connecting and not forcing, do nothing
    if (!force && wsRef.current) {
      const state = wsRef.current.readyState;
      if (state === WebSocket.OPEN || state === WebSocket.CONNECTING) {
        return;
      }
    }

    // Cleanly dismantle previous socket without triggering phantom onclose handlers
    if (wsRef.current) {
      isIntentionalCloseRef.current = true;
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onerror = null;
      wsRef.current.onclose = null;
      try {
        wsRef.current.close();
      } catch (e) {
        // Ignore close errors
      }
      wsRef.current = null;
    }

    isIntentionalCloseRef.current = false;
    const url = `ws://${ip}:${port}`;
    setStatus("connecting");
    addLog(`Connecting to WebSocket: ${url}`, "info");

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        // Clear any lingering reconnect timers
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }

        setStatus("connected");
        addLog(`Connected to ESP8266 WebSocket Server (Port ${port})`, "success");

        // Request initial status
        ws.send("STATUS");

        // Start ping heartbeat
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            pingStartRef.current = Date.now();
            ws.send("PING");
          }
        }, 2000);
      };

      ws.onmessage = (event) => {
        const data = event.data;

        // Check for Pong latency
        if (data === "PONG") {
          if (pingStartRef.current > 0) {
            const rtt = Date.now() - pingStartRef.current;
            setLatency(rtt);
            pingStartRef.current = 0;
          }
          return;
        }

        // Check for Telemetry updates
        if (data.startsWith("TELEMETRY:") || data.startsWith("STATUS:")) {
          const jsonStr = data.substring(data.indexOf(":") + 1);
          try {
            const parsed = JSON.parse(jsonStr);
            setTelemetry((prev) => ({ ...prev, ...parsed }));
          } catch (e) {
            // Ignore parse errors
          }
          return;
        }

        // Forward Arduino Uno logs
        if (data.startsWith("[UNO]")) {
          addLog(data, "uno");
          return;
        }

        // Acknowledgments & other messages
        if (data.startsWith("ACK:")) {
          return;
        }

        addLog(`RX: ${data}`, "rx");
      };

      ws.onclose = (event) => {
        // If closed intentionally by app/cleanup, do not schedule reconnect
        if (isIntentionalCloseRef.current) {
          return;
        }

        setStatus("disconnected");
        setLatency(null);
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);

        addLog(`WebSocket closed (code: ${event.code || 1006}). Reconnecting in 3s...`, "warn");

        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = setTimeout(() => {
          connect(true);
        }, 3000);
      };

      ws.onerror = (err) => {
        setStatus("error");
      };
    } catch (e) {
      setStatus("error");
      addLog(`WebSocket connection exception: ${e.message}`, "error");
    }
  }, [ip, port, addLog]);

  useEffect(() => {
    connect(true);

    return () => {
      isIntentionalCloseRef.current = true;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);

      if (wsRef.current) {
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onerror = null;
        wsRef.current.onclose = null;
        try {
          wsRef.current.close();
        } catch (e) {}
        wsRef.current = null;
      }
    };
  }, [ip, port]); // Re-connect only when IP or Port explicitly changes

  // Send raw text over WebSocket
  const send = useCallback(
    (msg, logMsg = false) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(msg);
        if (logMsg) {
          addLog(`TX: ${msg}`, "tx");
        }
        return true;
      }
      return false;
    },
    [addLog]
  );

  return {
    status,
    latency,
    telemetry,
    logs,
    send,
    reconnect: () => connect(true),
    clearLogs: () => setLogs([]),
  };
}
