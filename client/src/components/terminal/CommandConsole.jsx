import { useState, useRef, useEffect } from "react";
import { Terminal, Send, Trash2, Shield, CornerDownLeft } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function CommandConsole({ logs, onSendCommand, onClearLogs, disabled = false }) {
  const [inputVal, setInputVal] = useState("");
  const [filter, setFilter] = useState("all"); // all, uno, rx, tx, error
  const logsEndRef = useRef(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!inputVal.trim() || disabled) return;
    onSendCommand(inputVal.trim(), true);
    setInputVal("");
  };

  const filteredLogs = logs.filter((log) => {
    if (filter === "all") return true;
    return log.type === filter;
  });

  const getLogColor = (type) => {
    switch (type) {
      case "success":
        return "text-emerald-400";
      case "warn":
        return "text-amber-400";
      case "error":
        return "text-rose-400";
      case "tx":
        return "text-sky-400";
      case "rx":
        return "text-zinc-300";
      case "uno":
        return "text-purple-400 font-semibold";
      default:
        return "text-zinc-400";
    }
  };

  return (
    <Card className="border-zinc-800 bg-zinc-950/90 font-mono">
      <CardHeader className="pb-3 flex-row items-center justify-between">
        <CardTitle className="text-sm font-bold text-zinc-100 flex items-center gap-2">
          <Terminal className="size-4 text-emerald-400" />
          SYSTEM CONSOLE & ARDUINO LOGS
        </CardTitle>

        <div className="flex items-center gap-1.5">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="text-[11px] bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-zinc-300 focus:outline-none"
          >
            <option value="all">All Logs</option>
            <option value="uno">Uno Serial</option>
            <option value="tx">Outgoing (TX)</option>
            <option value="rx">Incoming (RX)</option>
            <option value="error">Errors</option>
          </select>
          <Button
            variant="outline"
            size="xs"
            onClick={onClearLogs}
            className="border-zinc-800 text-zinc-400 hover:text-white"
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pt-1">
        {/* Terminal Window */}
        <div className="h-44 sm:h-52 w-full rounded-lg bg-zinc-950 border border-zinc-900 p-3 overflow-y-auto text-xs leading-relaxed font-mono">
          {filteredLogs.length === 0 ? (
            <div className="text-zinc-600 italic">No console logs yet. Commands and feedback will appear here.</div>
          ) : (
            filteredLogs.map((log) => (
              <div key={log.id} className="flex gap-2">
                <span className="text-zinc-600 shrink-0">[{log.time}]</span>
                <span className={`break-all ${getLogColor(log.type)}`}>{log.text}</span>
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>

        {/* Command Input Form */}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            disabled={disabled}
            placeholder="Type command: e.g. DRIVE:200,F,200,F,200,F,200,F or N20 FWD 200 or PING"
            className="flex-1 rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none"
          />
          <Button
            type="submit"
            size="sm"
            disabled={disabled || !inputVal.trim()}
            className="bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-bold"
          >
            <Send className="size-3.5 mr-1" />
            Send
          </Button>
        </form>

        {/* Quick Command Snippets */}
        <div className="flex flex-wrap gap-1.5 pt-1 text-[10px]">
          <span className="text-zinc-500 py-0.5">Quick:</span>
          {["PING", "STATUS", "STOP", "N20 FWD 220", "N20 STOP", "N20 REV 220"].map((cmd) => (
            <button
              key={cmd}
              type="button"
              onClick={() => onSendCommand(cmd, true)}
              disabled={disabled}
              className="rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 px-2 py-0.5 text-zinc-300 font-mono transition-colors"
            >
              {cmd}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
