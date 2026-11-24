import { Sprout, Target, ShieldCheck, Flame, PieChart } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function WeedAnalyticsCard() {
  const stats = [
    { label: "Weeds Detected", value: "148", change: "+12 this run", color: "text-rose-400", icon: Target },
    { label: "Eradicated (Cut)", value: "142", change: "96% Success", color: "text-emerald-400", icon: Flame },
    { label: "Crops Protected", value: "892", change: "100% Healthy", color: "text-sky-400", icon: Sprout },
    { label: "Herbicide Saved", value: "4.8 L", change: "Eco Mode", color: "text-amber-400", icon: ShieldCheck },
  ];

  const species = [
    { name: "Broadleaf Amaranth", count: 72, pct: 51, color: "bg-rose-500" },
    { name: "Yellow Nutsedge", count: 48, pct: 34, color: "bg-amber-500" },
    { name: "Crabgrass", count: 22, pct: 15, color: "bg-pink-500" },
  ];

  return (
    <Card className="border-zinc-800 bg-zinc-950/80">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-bold text-zinc-100 flex items-center gap-2">
            <PieChart className="size-4 text-emerald-400" />
            FIELD WEED ERADICATION ANALYTICS
          </CardTitle>
          <Badge variant="success" className="text-[10px]">
            FIELD EFFICIENCY: 98.4%
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-1">
        {/* Metric Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {stats.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800/60">
                <div className="flex items-center gap-1.5 text-zinc-400 text-xs mb-1">
                  <Icon className={`size-3.5 ${s.color}`} />
                  <span className="truncate">{s.label}</span>
                </div>
                <div className={`text-lg font-mono font-bold ${s.color}`}>{s.value}</div>
                <div className="text-[10px] text-zinc-500 font-mono">{s.change}</div>
              </div>
            );
          })}
        </div>

        {/* Weed Species Breakdown */}
        <div className="space-y-2 pt-1 border-t border-zinc-800/60">
          <div className="text-xs font-semibold text-zinc-300">Target Species Distribution</div>
          <div className="space-y-1.5">
            {species.map((sp) => (
              <div key={sp.name} className="text-xs">
                <div className="flex justify-between text-zinc-400 text-[11px] mb-0.5">
                  <span>{sp.name}</span>
                  <span className="font-mono text-zinc-200">
                    {sp.count} ({sp.pct}%)
                  </span>
                </div>
                <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                  <div className={`h-full ${sp.color} rounded-full`} style={{ width: `${sp.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
