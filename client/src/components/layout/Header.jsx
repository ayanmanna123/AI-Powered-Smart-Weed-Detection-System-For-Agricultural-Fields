import { Wifi, WifiOff, Activity, ShieldAlert, Settings, Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function Header({
  connectionStatus,
  latency,
  ip,
  wsPort,
  telemetry,
  onEmergencyStop,
  onOpenSettings,
}) {
  const isConnected = connectionStatus === "connected";
  const isConnecting = connectionStatus === "connecting";

  // Signal strength calculation from RSSI
  const rssi = telemetry?.rssi;
  let signalText = "N/A";
  let signalColor = "text-zinc-500";
  if (rssi !== null && rssi !== undefined) {
    if (rssi > -60) {
      signalText = "Excellent";
      signalColor = "text-emerald-400";
    } else if (rssi > -75) {
      signalText = "Good";
      signalColor = "text-sky-400";
    } else if (rssi > -85) {
      signalText = "Fair";
      signalColor = "text-amber-400";
    } else {
      signalText = "Weak";
      signalColor = "text-rose-400";
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-md px-4 py-3 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3 max-w-7xl mx-auto">
        {/* Brand / Title */}
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-black">
            🌾
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-bold tracking-wider text-zinc-100 uppercase">
                AgriRover Pro
              </h1>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                v2.0 WS
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 hidden sm:block">
              AI Smart Weed Detection & Precision Eradication Robot
            </p>
          </div>
        </div>

        {/* Live Indicators */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Connection Badge */}
          <Badge
            variant={isConnected ? "success" : isConnecting ? "warning" : "destructive"}
            className="font-mono text-[11px] px-2.5 py-1"
          >
            {isConnected ? (
              <Wifi className="size-3 animate-pulse" />
            ) : isConnecting ? (
              <Activity className="size-3 animate-spin" />
            ) : (
              <WifiOff className="size-3" />
            )}
            <span>
              {isConnected ? "WS CONNECTED" : isConnecting ? "CONNECTING..." : "OFFLINE"}
            </span>
          </Badge>

          {/* Latency Pill */}
          {isConnected && latency !== null && (
            <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-0.5 text-[11px] font-mono text-sky-400">
              <Activity className="size-3" />
              <span>{latency} ms</span>
            </div>
          )}

          {/* Wi-Fi RSSI */}
          {isConnected && rssi !== null && (
            <div className="hidden md:flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900/60 px-2.5 py-0.5 text-[11px] font-mono text-zinc-300">
              <Radio className={`size-3 ${signalColor}`} />
              <span>{rssi} dBm ({signalText})</span>
            </div>
          )}

          {/* Settings Trigger */}
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenSettings}
            className="border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:text-white hover:bg-zinc-800"
            title="Configure IP Address"
          >
            <Settings className="size-3.5" />
            <span className="hidden sm:inline font-mono text-[11px]">{ip}</span>
          </Button>

          {/* Emergency Stop Button */}
          <button
            type="button"
            onClick={onEmergencyStop}
            className="flex items-center gap-1.5 rounded-lg border border-rose-500 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold text-xs px-3 py-1.5 shadow-lg shadow-rose-900/40 transition-all uppercase tracking-wider"
          >
            <ShieldAlert className="size-4 animate-bounce" />
            <span>E-STOP</span>
          </button>
        </div>
      </div>
    </header>
  );
}
