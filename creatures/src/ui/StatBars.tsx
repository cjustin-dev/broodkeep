// The five care stats as icon + bar. No numbers or words: kids read the icon and the bar.
import type { IconName } from "../art/sprites";
import type { Stats } from "../game/state";
import { Icon } from "./Icon";

const rows: Array<{ stat: keyof Stats; icon: IconName; label: string }> = [
  { stat: "hunger", icon: "hunger", label: "Hunger" },
  { stat: "happiness", icon: "happiness", label: "Happiness" },
  { stat: "energy", icon: "energy", label: "Energy" },
  { stat: "hygiene", icon: "hygiene", label: "Cleanliness" },
  { stat: "wellness", icon: "wellness", label: "Wellness" },
];

function level(value: number): "good" | "ok" | "low" {
  return value >= 50 ? "good" : value >= 25 ? "ok" : "low";
}

// stats is null while there is only an egg (the bars show as empty and dim).
export function StatBars({ stats }: { stats: Stats | null }) {
  return (
    <div class="stats" data-dim={stats ? "false" : "true"}>
      {rows.map(({ stat, icon, label }) => {
        const value = stats ? Math.round(stats[stat]) : 0;
        return (
          <div
            class="stat"
            role="meter"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={value}
            data-level={level(value)}
          >
            <Icon name={icon} px={28} />
            <span class="bar">
              <span class="fill" style={{ transform: `translateX(${value - 100}%)` }} />
            </span>
          </div>
        );
      })}
    </div>
  );
}
