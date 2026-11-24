import { useState } from "react";
import { Settings, Save, X, RotateCcw } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function ConnectionSettingsModal({
  isOpen,
  onClose,
  currentIp,
  currentWsPort,
  currentHttpPort,
  onSave,
}) {
  const [ip, setIp] = useState(currentIp);
  const [wsPort, setWsPort] = useState(currentWsPort);
  const [httpPort, setHttpPort] = useState(currentHttpPort);

  if (!isOpen) return null;

  const handleSave = (e) => {
    e.preventDefault();
    onSave({ ip: ip.trim(), wsPort: Number(wsPort), httpPort: Number(httpPort) });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <Card className="w-full max-w-md border-zinc-800 bg-zinc-950 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-bold text-zinc-100 flex items-center gap-2">
            <Settings className="size-4 text-emerald-400" />
            ESP8266 ROVER CONFIGURATION
          </CardTitle>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1 rounded-md"
          >
            <X className="size-4" />
          </button>
        </CardHeader>

        <form onSubmit={handleSave}>
          <CardContent className="space-y-3.5 py-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-300">
                ESP8266 IP Address
              </label>
              <input
                type="text"
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                placeholder="192.168.1.15"
                className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-xs font-mono text-zinc-100 focus:border-emerald-500 focus:outline-none"
                required
              />
              <p className="text-[11px] text-zinc-500">
                The IP address shown in your Arduino IDE Serial Monitor.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-300">
                  WebSocket Port
                </label>
                <input
                  type="number"
                  value={wsPort}
                  onChange={(e) => setWsPort(e.target.value)}
                  className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-xs font-mono text-zinc-100 focus:border-emerald-500 focus:outline-none"
                  required
                />
                <p className="text-[10px] text-zinc-500">Default: 81</p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-300">
                  HTTP Port
                </label>
                <input
                  type="number"
                  value={httpPort}
                  onChange={(e) => setHttpPort(e.target.value)}
                  className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-xs font-mono text-zinc-100 focus:border-emerald-500 focus:outline-none"
                  required
                />
                <p className="text-[10px] text-zinc-500">Default: 80</p>
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex justify-end gap-2 pt-3 border-t border-zinc-800/60">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="border-zinc-800 text-zinc-300"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-bold"
            >
              <Save className="size-3.5 mr-1" />
              Save & Connect
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
