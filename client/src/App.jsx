import { useState, useEffect } from "react";
import {
  Gamepad2,
  Activity,
  Terminal as TerminalIcon,
  Bot,
} from "lucide-react";

import { DEFAULT_CONFIG } from "@/config/robotConfig";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useRoverControl } from "@/hooks/useRoverControl";
import { useKeyboardControls } from "@/hooks/useKeyboardControls";

import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { VirtualJoystick } from "@/components/controls/VirtualJoystick";
import { DPadControl } from "@/components/controls/DPadControl";
import { SpeedControl } from "@/components/controls/SpeedControl";
import { N20CutterCard } from "@/components/controls/N20CutterCard";
import { RobotStatusCard } from "@/components/telemetry/RobotStatusCard";
import { LiveCameraFeed } from "@/components/telemetry/LiveCameraFeed";
import { WeedAnalyticsCard } from "@/components/telemetry/WeedAnalyticsCard";
import { CommandConsole } from "@/components/terminal/CommandConsole";
import { ConnectionSettingsModal } from "@/components/settings/ConnectionSettingsModal";
import { VirtualEnvironmentPage } from "@/components/virtual/VirtualEnvironmentPage";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function App() {
  // Connection Configuration
  const [ip, setIp] = useState(() => {
    return localStorage.getItem("agri_rover_ip") || DEFAULT_CONFIG.defaultIp;
  });
  const [wsPort, setWsPort] = useState(() => {
    return Number(localStorage.getItem("agri_rover_ws_port")) || DEFAULT_CONFIG.wsPort;
  });
  const [httpPort, setHttpPort] = useState(() => {
    return Number(localStorage.getItem("agri_rover_http_port")) || DEFAULT_CONFIG.httpPort;
  });

  const [activeTab, setActiveTab] = useState(() => {
    const hash = typeof window !== "undefined" ? window.location.hash.replace("#", "") : "";
    if (["cockpit", "virtual", "analytics", "terminal"].includes(hash)) return hash;
    return "cockpit";
  }); // cockpit, virtual, analytics, terminal
  const [controlMode, setControlMode] = useState("both"); // joystick, dpad, both
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${activeTab}`);
    }
  }, [activeTab]);

  // WebSocket Manager
  const {
    status: wsStatus,
    latency,
    telemetry,
    logs,
    send: wsSend,
    clearLogs,
  } = useWebSocket(ip, wsPort);

  const isWsConnected = wsStatus === "connected";

  // Unified Rover Kinematics & Dispatch Engine
  const {
    maxSpeed,
    setMaxSpeed,
    activeDirection,
    motorTelemetry,
    handleJoystickMove,
    handleDPadPress,
    sendMirrorDrive,
    stopRover,
    emergencyStop,
    // N20 Motor TB6612FNG
    n20Speed,
    n20Direction,
    n20Power,
    handleN20Control,
  } = useRoverControl({
    ip,
    wsPort,
    httpPort,
    wsSend,
    isWsConnected,
  });

  // Physical Keyboard Bindings (WASD, Arrows, Space, U, J, K)
  useKeyboardControls({
    onDPadPress: handleDPadPress,
    onStop: stopRover,
    onEmergencyStop: emergencyStop,
    onN20Control: handleN20Control,
    enabled: activeTab !== "virtual",
  });

  // Save Settings
  const handleSaveSettings = ({ ip: newIp, wsPort: newWsPort, httpPort: newHttpPort }) => {
    setIp(newIp);
    setWsPort(newWsPort);
    setHttpPort(newHttpPort);
    localStorage.setItem("agri_rover_ip", newIp);
    localStorage.setItem("agri_rover_ws_port", newWsPort);
    localStorage.setItem("agri_rover_http_port", newHttpPort);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-zinc-950">
      {/* Cockpit Status Header */}
      <Header
        connectionStatus={wsStatus}
        latency={latency}
        ip={ip}
        wsPort={wsPort}
        telemetry={telemetry}
        onEmergencyStop={emergencyStop}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Main View Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-5">
        {/* Navigation Tabs Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-1.5 bg-zinc-900/80 p-1 rounded-xl border border-zinc-800">
            <button
              type="button"
              onClick={() => setActiveTab("cockpit")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "cockpit"
                  ? "bg-emerald-500 text-zinc-950 shadow-md font-bold"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800"
              }`}
            >
              <Gamepad2 className="size-3.5" />
              <span>ROVER COCKPIT</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("virtual")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "virtual"
                  ? "bg-emerald-500 text-zinc-950 shadow-md font-bold"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800"
              }`}
            >
              <Bot className="size-3.5" />
              <span>VIRTUAL DEMO</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("analytics")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "analytics"
                  ? "bg-emerald-500 text-zinc-950 shadow-md font-bold"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800"
              }`}
            >
              <Activity className="size-3.5" />
              <span>AI VISION & FIELD STATS</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("terminal")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "terminal"
                  ? "bg-emerald-500 text-zinc-950 shadow-md font-bold"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800"
              }`}
            >
              <TerminalIcon className="size-3.5" />
              <span>CONSOLE & LOGS</span>
            </button>
          </div>
        </div>

        {/* TAB 1: ROVER COCKPIT */}
        {activeTab === "cockpit" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left 7 Columns: Chassis & Driving Controls */}
            <div className="lg:col-span-7 space-y-5">
              <Card className="border-zinc-800 bg-zinc-950/80">
                <CardHeader className="pb-3 flex-row items-center justify-between">
                  <CardTitle className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                    <Gamepad2 className="size-4 text-emerald-400" />
                    4WD CHASSIS DRIVE CONTROLS
                  </CardTitle>

                  {/* Switch between Joystick / D-Pad / Both */}
                  <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setControlMode("both")}
                      className={`px-2 py-0.5 rounded ${controlMode === "both" ? "bg-emerald-500 text-zinc-950 font-bold" : "text-zinc-400"}`}
                    >
                      Dual
                    </button>
                    <button
                      type="button"
                      onClick={() => setControlMode("joystick")}
                      className={`px-2 py-0.5 rounded ${controlMode === "joystick" ? "bg-emerald-500 text-zinc-950 font-bold" : "text-zinc-400"}`}
                    >
                      Stick
                    </button>
                    <button
                      type="button"
                      onClick={() => setControlMode("dpad")}
                      className={`px-2 py-0.5 rounded ${controlMode === "dpad" ? "bg-emerald-500 text-zinc-950 font-bold" : "text-zinc-400"}`}
                    >
                      D-Pad
                    </button>
                  </div>
                </CardHeader>

                <CardContent className="space-y-6 pt-2">
                  {/* Controllers Arena */}
                  <div className="flex flex-wrap items-center justify-around gap-6 py-2">
                    {/* Analog Joystick */}
                    {(controlMode === "joystick" || controlMode === "both") && (
                      <div className="flex flex-col items-center">
                        <div className="text-[11px] font-mono text-zinc-400 mb-2 font-medium">
                          TOUCH ANALOG JOYSTICK
                        </div>
                        <VirtualJoystick
                          onMove={handleJoystickMove}
                          onStop={stopRover}
                          size={210}
                        />
                      </div>
                    )}

                    {/* 8-Way D-Pad */}
                    {(controlMode === "dpad" || controlMode === "both") && (
                      <div className="flex flex-col items-center">
                        <div className="text-[11px] font-mono text-zinc-400 mb-2 font-medium">
                          8-WAY KEYPAD / WASD
                        </div>
                        <DPadControl
                          activeDirection={activeDirection}
                          onDirectionPress={handleDPadPress}
                          onStop={stopRover}
                        />
                      </div>
                    )}
                  </div>

                  {/* Master Speed Control Slider & Motor Telemetry */}
                  <SpeedControl
                    maxSpeed={maxSpeed}
                    onSpeedChange={setMaxSpeed}
                    motorTelemetry={motorTelemetry}
                  />
                </CardContent>
              </Card>

              {/* Hardware Telemetry Summary */}
              <RobotStatusCard
                telemetry={telemetry}
                isWsConnected={isWsConnected}
                latency={latency}
              />
            </div>

            {/* Right 5 Columns: N20 Cutter Tool & AI Vision */}
            <div className="lg:col-span-5 space-y-5">
              {/* TB6612FNG N20 Weeding Cutter Card */}
              <N20CutterCard
                speed={n20Speed}
                direction={n20Direction}
                power={n20Power}
                onControl={handleN20Control}
              />

              {/* Live AI Vision Stream / HUD */}
              <LiveCameraFeed defaultActive={true} />
            </div>
          </div>
        )}

        {/* TAB 2: VIRTUAL ENVIRONMENT SIMULATOR */}
        {activeTab === "virtual" && (
          <VirtualEnvironmentPage
            isWsConnected={isWsConnected}
            onDriveStep={(dir) => (dir === "STOP" ? stopRover() : sendMirrorDrive(dir))}
            onN20Step={(dir, speed) => handleN20Control(dir, speed, true)}
            onEmergencyStop={emergencyStop}
          />
        )}

        {/* TAB 3: AI VISION & FIELD ANALYTICS */}
        {activeTab === "analytics" && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div className="lg:col-span-7">
                <LiveCameraFeed defaultActive={true} />
              </div>
              <div className="lg:col-span-5">
                <WeedAnalyticsCard />
              </div>
            </div>

            <RobotStatusCard
              telemetry={telemetry}
              isWsConnected={isWsConnected}
              latency={latency}
            />
          </div>
        )}

        {/* TAB 3: CONSOLE & SYSTEM LOGS */}
        {activeTab === "terminal" && (
          <div className="space-y-5">
            <CommandConsole
              logs={logs}
              onSendCommand={(cmd, log) => wsSend(cmd, log)}
              onClearLogs={clearLogs}
            />

            <RobotStatusCard
              telemetry={telemetry}
              isWsConnected={isWsConnected}
              latency={latency}
            />
          </div>
        )}
      </main>

      {/* Connection IP Settings Modal */}
      <ConnectionSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentIp={ip}
        currentWsPort={wsPort}
        currentHttpPort={httpPort}
        onSave={handleSaveSettings}
      />

      {/* Cockpit Footer */}
      <Footer />
    </div>
  );
}
