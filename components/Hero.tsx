"use client";

import { motion } from "framer-motion";
import { ArrowDown } from "lucide-react";
import Image from "next/image";

export function Hero() {
  return (
    <section className="relative min-h-[88vh] px-6 sm:px-10 lg:px-20 pt-32 pb-16">
      <div className="mx-auto max-w-7xl grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
        <div className="lg:col-span-6">
          {/* Eyebrow */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="flex flex-wrap items-center gap-3 mb-8"
          >
            <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 num">
              MGMT 590 · LLM Evaluation Track · April 2026
            </span>
            <span className="hidden sm:inline-block w-1 h-1 rounded-full bg-white/20" />
            <span className="text-[11px] uppercase tracking-[0.18em] text-white/40">
              Interactive Playground
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: "easeOut", delay: 0.05 }}
            className="text-display-1 font-semibold text-balance max-w-[18ch]"
          >
            <span className="text-white/90">Two votes can</span>{" "}
            <span className="text-gradient-fragile">flip the throne.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
            className="mt-8 text-lg sm:text-xl text-white/60 max-w-2xl text-pretty leading-relaxed"
          >
            On Chatbot Arena, a noise budget of{" "}
            <span className="num text-white/85">0.003%</span> — just two battles
            out of 57,477 — is enough to unseat the top-ranked LLM (Huang et al.
            2025). That's the share of votes that could plausibly be off in any
            leaderboard: ambiguous prompts, rater disagreement, selective
            reporting. Bootstrap confidence intervals don't catch it. The
            playground below runs on real{" "}
            <code className="text-white/80">arena-human-preference-140k</code>{" "}
            votes — verify the fragility yourself, then watch our framework fix
            it.
          </motion.p>

          {/* Stat strip */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: "easeOut", delay: 0.35 }}
            className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-px rounded-2xl overflow-hidden border border-white/5 max-w-4xl"
          >
            <StatTile value="0.003%" label="Votes that flip #1 on Arena" />
            <StatTile value="6,000×" label="Arena vs MT-Bench fragility gap" />
            <StatTile value="2M+" label="Battles audited (Singh et al.)" />
            <StatTile value="3" label="Components in our framework" />
          </motion.div>

          {/* CTA / scroll cue */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.6 }}
            className="mt-16 flex items-center gap-3 text-white/40 text-sm"
          >
            <ArrowDown className="w-4 h-4 animate-bounce" />
            <span>
              Scroll. Below, you control four levers — dataset, estimator, drop
              rule, and α — and watch the leaderboard refit live.
            </span>
          </motion.div>
        </div>

        {/* Hero image + subtle motion + hover */}
        <motion.div
          initial={{ opacity: 0, y: 18, rotate: -0.5 }}
          animate={{ opacity: 1, y: 0, rotate: 0 }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.12 }}
          className="lg:col-span-6"
        >
          <div className="lg:-translate-y-12 xl:-translate-y-16">
          <motion.div
            animate={{ y: [-6, 6, -6] }}
            transition={{ duration: 9, ease: "easeInOut", repeat: Infinity }}
            whileHover={{ scale: 1.02, rotate: 0.25 }}
            className="relative mx-auto w-full max-w-none lg:w-[min(980px,52vw)] lg:-mr-10 xl:-mr-16 transform-gpu"
            style={{ willChange: "transform" }}
          >
            <div className="relative overflow-visible">
              <Image
                src="/hero.png"
                alt="Throne illustration"
                width={1024}
                height={576}
                priority
                sizes="(min-width: 1280px) 980px, (min-width: 1024px) 52vw, 92vw"
                className="w-full h-auto object-contain"
              />
            </div>
          </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-ink-900/60 px-5 py-5 sm:px-6 sm:py-6">
      <div className="num text-2xl sm:text-3xl text-white/95 tabular-nums">{value}</div>
      <div className="text-[11px] uppercase tracking-wider text-white/40 mt-2 leading-snug">
        {label}
      </div>
    </div>
  );
}
