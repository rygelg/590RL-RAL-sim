import { Hero } from "@/components/Hero";
import { Primer } from "@/components/Primer";
import { FailureModes } from "@/components/FailureModes";
import { Playground } from "@/components/Playground";
import { RAL } from "@/components/RAL";
import { Evaluation } from "@/components/Evaluation";
import { Credits } from "@/components/Credits";

export default function HomePage() {
  return (
    <main className="min-h-screen">
      <Nav />
      <Hero />
      <Divider />
      <Primer />
      <Divider />
      <FailureModes />
      <Divider />
      <Playground />
      <Divider />
      <RAL />
      <Divider />
      <Evaluation />
      <Divider />
      <Credits />
    </main>
  );
}

function Nav() {
  return (
    <nav className="fixed top-0 inset-x-0 z-40 px-6 sm:px-10 lg:px-20 py-5 flex items-center justify-between bg-gradient-to-b from-ink-950/80 to-transparent backdrop-blur-md">
      <div className="flex items-center gap-2.5">
        <div className="w-2 h-2 rounded-full bg-accent-amber shadow-glow-amber" />
        <span className="num text-[11px] uppercase tracking-[0.18em] text-white/70">
          RAL · Robustness-Aware Leaderboards
        </span>
      </div>
      <div className="hidden md:flex items-center gap-5 text-[11px] uppercase tracking-[0.16em] num text-white/40">
        <a href="#playground" className="hover:text-white/80 transition-colors">
          Playground
        </a>
        <a
          href="https://arxiv.org/abs/2508.11847"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-white/80 transition-colors"
        >
          Primary paper ↗
        </a>
      </div>
    </nav>
  );
}

function Divider() {
  return (
    <div className="px-6 sm:px-10 lg:px-20 max-w-7xl mx-auto">
      <div className="hairline" />
    </div>
  );
}
