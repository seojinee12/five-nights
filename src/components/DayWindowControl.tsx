import { Clock } from "lucide-react";
import { timeLabel, windowOptions, withWindowChange } from "@/lib/dayWindow";
import type { DayWindow } from "@/lib/schedule";

const select = "rounded-md border bg-card px-2 py-1 text-xs";

/** One compact control: when the day starts and ends. Invalid choices are disabled. */
export function DayWindowControl({
  value,
  onChange,
}: {
  value: DayWindow;
  onChange: (next: DayWindow) => void;
}) {
  const options = windowOptions(value);
  return (
    <div className="flex items-center gap-1.5 text-muted-foreground">
      <Clock className="h-3.5 w-3.5" aria-hidden />
      <select
        aria-label="My day starts"
        className={select}
        value={value.start}
        onChange={(e) => onChange(withWindowChange(value, { start: Number(e.target.value) }))}
      >
        {options.starts.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {timeLabel(o.value)}
          </option>
        ))}
      </select>
      <span className="text-xs">to</span>
      <select
        aria-label="My day ends"
        className={select}
        value={value.end}
        onChange={(e) => onChange(withWindowChange(value, { end: Number(e.target.value) }))}
      >
        {options.ends.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {timeLabel(o.value)}
          </option>
        ))}
      </select>
    </div>
  );
}
