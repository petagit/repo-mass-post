"use client";

import React from "react";

interface ProgressBarProps {
  progress: number; // 0-100
  label?: string;
  showPercentage?: boolean;
  barColor?: string;
  height?: string;
}

export default function ProgressBar({
  progress,
  label = "Loading...",
  showPercentage = true,
  barColor = "bg-orange-500",
  height = "h-2.5",
}: ProgressBarProps): JSX.Element {
  const clampedProgress = Math.max(0, Math.min(100, progress));

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-theme-primary/90">{label}</span>
        {showPercentage && (
          <span className="text-sm font-medium text-theme-primary">{clampedProgress}%</span>
        )}
      </div>
      <div className={`w-full bg-white/10 rounded-full ${height} overflow-hidden`}>
        <div
          className={`${barColor} h-full rounded-full transition-all duration-300 ease-out`}
          style={{ width: `${clampedProgress}%` }}
          role="progressbar"
          aria-valuenow={clampedProgress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={label}
        />
      </div>
    </div>
  );
}

