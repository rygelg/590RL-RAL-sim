"use client";

import { motion } from "framer-motion";
import { ExternalLink, Github } from "lucide-react";
import snapshot from "@/data/snapshot.json";

export function Credits() {
  const team = snapshot.team;
  const papers = snapshot.papers;

  return (
    <section className="px-6 sm:px-10 lg:px-20 py-24 max-w-7xl mx-auto">
      <div className="grid lg:grid-cols-[1.4fr_2fr] gap-12 items-start">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
        >
          <div className="text-[11px] uppercase tracking-[0.18em] text-accent-cyan/80 mb-4 num">
            The team
          </div>
          <h2 className="text-4xl font-semibold mb-6">
            Built for {team.course}
          </h2>
          <div className="text-white/55 leading-relaxed mb-8">
            {team.institution} · presented {team.presented}.
          </div>
          <div className="space-y-2 mb-10">
            {team.members.map((m) => (
              <div key={m} className="text-white/85 text-lg">
                {m}
              </div>
            ))}
          </div>
          <div className="text-xs text-white/35 leading-relaxed border-t border-white/5 pt-5">
            The interactive playground and the three live evaluation cards run
            on REAL Chatbot Arena votes from{" "}
            <code className="text-white/55">
              lmarena-ai/arena-human-preference-140k
            </code>
            . We precompute a Bradley–Terry fit on the 15.9k votes between the
            top-12 most-active models, bundle a deterministic 3,000-vote
            subsample for the slider (β / CI from the full fit, not the
            subsample), and ship a 20-model Elo snapshot for the side-panel.
            The MT-Bench preset is intentionally synthetic — kept as a
            wide-gap foil to the real arena. No PII; no runtime network calls.
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, delay: 0.05 }}
        >
          <div className="text-[11px] uppercase tracking-[0.18em] text-white/50 mb-4 num">
            Papers we lean on
          </div>
          <div className="space-y-2">
            {papers.map((p) => (
              <a
                key={p.label}
                href={
                  p.arxiv ? `https://arxiv.org/abs/${p.arxiv}` : "#"
                }
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 group p-3.5 rounded-lg hover:bg-white/[0.02] transition-colors border border-transparent hover:border-white/5"
              >
                <span className="num text-[10px] uppercase tracking-wider text-white/30 mt-1 min-w-[68px]">
                  {p.role}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-white/85 text-sm leading-snug group-hover:text-white">
                    {p.title}
                  </div>
                  <div className="text-white/40 text-xs num mt-1">
                    {p.label} {p.arxiv && `· arXiv:${p.arxiv}`}
                  </div>
                </div>
                {p.arxiv && (
                  <ExternalLink className="w-3.5 h-3.5 text-white/30 group-hover:text-white/60 mt-1.5 shrink-0" />
                )}
              </a>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap gap-3 text-sm">
            <a
              href="https://huggingface.co/datasets/lmarena-ai/arena-human-preference-140k"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-lg border border-white/10 hover:border-white/20 text-white/70 hover:text-white transition-colors flex items-center gap-2"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              arena-human-preference-140k
            </a>
            <a
              href="https://lmarena.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-lg border border-white/10 hover:border-white/20 text-white/70 hover:text-white transition-colors flex items-center gap-2"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              lmarena.ai
            </a>
          </div>
        </motion.div>
      </div>

      <div className="text-center text-white/30 text-xs num mt-20 pt-8 border-t border-white/5">
        Robustness-Aware Leaderboards · {team.presented} · {team.institution}
      </div>
    </section>
  );
}
