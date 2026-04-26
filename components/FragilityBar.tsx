"use client";

import { motion } from "framer-motion";

export type FragilityStatus = "fragile" | "moderate" | "robust" | "unknown";

export function statusFromAlpha(alpha: number): FragilityStatus {
  if (!Number.isFinite(alpha)) return "robust";
  if (alpha < 0.001) return "fragile";
  if (alpha < 0.01) return "moderate";
  return "robust";
}

const STATUS_COLOR: Record<FragilityStatus, { ring: string; fill: string; text: string }> = {
  fragile: { ring: "border-accent-rose/60", fill: "bg-gradient-to-r from-amber-400/40 to-rose-500/60", text: "text-accent-rose" },
  moderate: { ring: "border-accent-amber/50", fill: "bg-gradient-to-r from-amber-400/40 to-amber-500/60", text: "text-accent-amber" },
  robust: { ring: "border-accent-emerald/40", fill: "bg-gradient-to-r from-emerald-400/40 to-emerald-500/50", text: "text-accent-emerald" },
  unknown: { ring: "border-white/10", fill: "bg-white/10", text: "text-white/50" },
};

interface FragilityBarProps {
  alpha: number; // fraction (0..1) or Infinity
  // Reference scale: bar fills to log mapping. We map alpha=0.0001 -> 0.05 fill,
  // alpha=0.01 -> 0.5 fill, alpha=0.1 -> 0.85 fill, alpha=Inf -> 1.
  width?: number;
}

export function FragilityBar({ alpha, width = 80 }: FragilityBarProps) {
  const status = statusFromAlpha(alpha);
  const fillPct = mapAlphaToFill(alpha);
  const colors = STATUS_COLOR[status];
  const label = formatAlphaPercent(alpha);
  return (
    <div className="flex items-center gap-2.5">
      <div
        className={`relative h-1.5 rounded-full bg-white/[0.04] overflow-hidden border border-white/5`}
        style={{ width }}
      >
        <motion.div
          className={`absolute inset-y-0 left-0 ${colors.fill}`}
          animate={{ width: `${fillPct * 100}%` }}
          transition={{ type: "spring", stiffness: 220, damping: 28 }}
        />
      </div>
      <span className={`num text-[11px] tabular-nums ${colors.text} min-w-[68px]`}>{label}</span>
    </div>
  );
}

export function mapAlphaToFill(alpha: number): number {
  if (!Number.isFinite(alpha)) return 1;
  if (alpha <= 0) return 0;
  // log10 from 0.00001 (-5) to 0.5 (-0.3). Map to [0, 1].
  const logMin = -5;
  const logMax = -0.3;
  const v = Math.log10(alpha);
  const t = (v - logMin) / (logMax - logMin);
  return Math.max(0.04, Math.min(1, t));
}

export function formatAlphaPercent(alpha: number): string {
  if (!Number.isFinite(alpha)) return ">50%";
  const pct = alpha * 100;
  if (pct >= 1) return `${pct.toFixed(2)}%`;
  if (pct >= 0.01) return `${pct.toFixed(3)}%`;
  return `${pct.toFixed(4)}%`;
}

export function statusLabel(status: FragilityStatus): string {
  if (status === "fragile") return "FRAGILE";
  if (status === "moderate") return "MODERATE";
  if (status === "robust") return "ROBUST";
  return "—";
}
