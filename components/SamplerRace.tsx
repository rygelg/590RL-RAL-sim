"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { generatePreset } from "@/lib/synthetic";
import { simulateAllSamplers, type SamplerCurves } from "@/lib/sampler";

interface Row {
  votesAdded: number;
  uniform: number;
  info: number;
  influence: number;
}

export function SamplerRace() {
  const [data, setData] = useState<Row[] | null>(null);

  useEffect(() => {
    // Compute once on mount, off the main paint thread.
    const run = () => {
      const ds = generatePreset("arena", 2200);
      const curves: SamplerCurves = simulateAllSamplers(
        ds.votes,
        ds.models.length,
        { budget: 240, step: 30, seed: 42 },
      );
      const rows: Row[] = curves.uniform.map((p, i) => ({
        votesAdded: p.votesAdded,
        uniform: pct(curves.uniform[i].alphaFlipTop),
        info: pct(curves.info[i].alphaFlipTop),
        influence: pct(curves.influence[i].alphaFlipTop),
      }));
      setData(rows);
    };
    if ("requestIdleCallback" in window) {
      (window as Window & typeof globalThis).requestIdleCallback(run);
    } else {
      setTimeout(run, 50);
    }
  }, []);

  return (
    <div className="bg-ink-950/40 border border-white/5 rounded-xl p-5 mt-5 h-[260px]">
      <div className="text-[10px] uppercase tracking-wider text-white/40 num mb-2">
        Top-pair α_flip vs new votes spent
      </div>
      {data ? (
        <ResponsiveContainer width="100%" height="92%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="3 3" />
            <XAxis
              dataKey="votesAdded"
              stroke="rgba(255,255,255,0.3)"
              tick={{ fontSize: 11, fontFamily: "var(--font-mono)" }}
              label={{
                value: "Votes added",
                position: "insideBottom",
                offset: -2,
                style: { fill: "rgba(255,255,255,0.4)", fontSize: 10, fontFamily: "var(--font-mono)" },
              }}
            />
            <YAxis
              stroke="rgba(255,255,255,0.3)"
              tick={{ fontSize: 11, fontFamily: "var(--font-mono)" }}
              tickFormatter={(v: number) => `${v.toFixed(2)}%`}
            />
            <Tooltip
              contentStyle={{
                background: "rgba(12,12,16,0.95)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                fontFamily: "var(--font-mono)",
                fontSize: 12,
              }}
              labelStyle={{ color: "rgba(255,255,255,0.5)" }}
              formatter={(v: number) => `${v.toFixed(3)}%`}
            />
            <Legend
              wrapperStyle={{ fontFamily: "var(--font-mono)", fontSize: 11, paddingTop: 8 }}
            />
            <Line type="monotone" dataKey="uniform" name="Uniform" stroke="#9598A1" strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="info" name="Info-gain" stroke="#22D3EE" strokeWidth={1.8} dot={false} />
            <Line type="monotone" dataKey="influence" name="Influence-gain (ours)" stroke="#FBBF24" strokeWidth={2.2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-full flex items-center justify-center text-white/30 text-sm num">
          Simulating samplers...
        </div>
      )}
    </div>
  );
}

function pct(x: number): number {
  if (!Number.isFinite(x)) return 25;
  return x * 100;
}
