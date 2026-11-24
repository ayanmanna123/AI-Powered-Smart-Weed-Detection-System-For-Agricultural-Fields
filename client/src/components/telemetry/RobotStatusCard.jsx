import { Cpu, HardDrive, Clock, Wifi, Server, CheckCircle2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function RobotStatusCard({ telemetry, isWsConnected, latency }) {
  const formatUptime = (sec) => {
    if (!sec) return "0s";
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (hrs > 0) return `${hrs}h ${mins}m ${s}s`;
    if (mins > 0) return `${mins}m ${s}s`;
    return `${s}s`;
  };

  const freeHeapKb = telemetry?.heap ? Math.round(telemetry.heap / 1024) : null;

  return (
    <Card className="border-zinc-800 bg-zinc-950/80">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-bold text-zinc-100">
            <Server className="size-4 text-emerald-400" />
            ROBOT HARDWARE TELEMETRY
          </CardTitle>
          <Badge variant={isWsConnected ? "success" : "outline"} className="text-[10px]">
            {isWsConnected ? "WEBSOCKET STREAM" : "HTTP FALLBACK"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
        {/* Memory Heap */}
        <div className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800/60">
          <div className="flex items-center gap-1.5 text-zinc-400 text-xs mb-1">
            <HardDrive className="size-3.5 text-emerald-400" />
            <span>ESP Free RAM</span>
          </div>
          <div className="text-sm font-mono font-bold text-zinc-100">
            {freeHeapKb !== null ? `${freeHeapKb} KB` : "Waiting..."}
          </div>
          <div className="text-[10px] text-zinc-500 font-mono">Dynamic Heap</div>
        </div>

        {/* Signal RSSI */}
        <div className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800/60">
          <div className="flex items-center gap-1.5 text-zinc-400 text-xs mb-1">
            <Wifi className="size-3.5 text-sky-400" />
            <span>Wi-Fi RSSI</span>
          </div>
          <div className="text-sm font-mono font-bold text-zinc-100">
            {telemetry?.rssi !== null ? `${telemetry.rssi} dBm` : "Offline"}
          </div>
          <div className="text-[10px] text-zinc-500 font-mono">2.4GHz 802.11b/g/n</div>
        </div>

        {/* Round Trip Latency */}
        <div className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800/60">
          <div className="flex items-center gap-1.5 text-zinc-400 text-xs mb-1">
            <Cpu className="size-3.5 text-amber-400" />
            <span>WS Latency</span>
          </div>
          <div className="text-sm font-mono font-bold text-emerald-400">
            {latency !== null ? `${latency} ms` : "N/A"}
          </div>
          <div className="text-[10px] text-zinc-500 font-mono">Real-time Ping</div>
        </div>

        {/* Uptime */}
        <div className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800/60">
          <div className="flex items-center gap-1.5 text-zinc-400 text-xs mb-1">
            <Clock className="size-3.5 text-purple-400" />
            <span>Rover Uptime</span>
          </div>
          <div className="text-sm font-mono font-bold text-zinc-100">
            {formatUptime(telemetry?.uptime)}
          </div>
          <div className="text-[10px] text-zinc-500 font-mono">Since Boot</div>
        </div>
      </CardContent>
    </Card>
  );
}
