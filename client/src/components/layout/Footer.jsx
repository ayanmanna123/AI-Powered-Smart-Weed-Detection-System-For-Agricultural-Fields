import { Keyboard, ShieldCheck } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-zinc-800/80 bg-zinc-950/80 px-4 py-3 text-xs text-zinc-400 mt-6">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[11px]">
          <ShieldCheck className="size-3.5 text-emerald-400" />
          <span>Final Year Project: AI-Powered Smart Weed Detection & Eradication System</span>
        </div>

        <div className="flex items-center gap-3 text-[11px] font-mono text-zinc-400">
          <div className="hidden md:flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded">
            <Keyboard className="size-3 text-zinc-400" />
            <span>WASD/Arrows: Drive | Space: E-Stop | U/J: N20 Cutter</span>
          </div>
          <span>ESP8266 & Arduino UNO Dual-MCU</span>
        </div>
      </div>
    </footer>
  );
}
