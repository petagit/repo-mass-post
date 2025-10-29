"use client";

import type { Destination } from "../page";

export interface DestinationPickerProps {
  destinations: Destination[];
  selected: string[];
  onToggle: (id: string) => void;
  disabled?: boolean;
}

export default function DestinationPicker(props: DestinationPickerProps): JSX.Element {
  const { destinations, selected, onToggle, disabled } = props;
  return (
    <div className="flex flex-wrap gap-3">
      {destinations.map((d) => (
        <button
          key={d.id}
          onClick={(): void => onToggle(d.id)}
          className={`px-3 py-2 rounded-full border transition-colors ${
            selected.includes(d.id)
              ? "bg-gray-900 text-white border-gray-900"
              : "bg-white text-gray-800 border-gray-300 hover:border-gray-400"
          }`}
          disabled={disabled}
          aria-pressed={selected.includes(d.id)}
        >
          {d.platform === "instagram" ? "IG" : "X"} · {d.handle}
        </button>
      ))}
      {destinations.length === 0 && (
        <div className="text-sm text-gray-500">{disabled ? "Loading…" : "No accounts available"}</div>
      )}
    </div>
  );
}



