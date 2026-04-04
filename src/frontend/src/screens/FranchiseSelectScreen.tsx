import { motion } from "motion/react";
import { useState } from "react";
import { INITIAL_TEAMS } from "../data/players";
import type { GameState } from "../types/game";

interface Props {
  onSelect: (franchiseId: number, mode: "auction" | "quickplay") => void;
}

const TEAM_DESCRIPTIONS: Record<number, string> = {
  0: "Coastal powerhouse known for explosive batting",
  1: "Legendary franchise with a fortress home ground",
  2: "Capital giants powered by pace and aggression",
  3: "Purple Brigade -- spin-heavy and streetwise",
  4: "The romantics of cricket, always fighting back",
  5: "Lion-hearted fighters with a fearless top order",
  6: "Sun-scorched warriors with lethal fast bowlers",
  7: "Red-and-gold royalty -- high-scoring and fearless",
};

export default function FranchiseSelectScreen({ onSelect }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const [hoveredMode, setHoveredMode] = useState<
    "auction" | "quickplay" | null
  >(null);

  return (
    <div
      className="min-h-screen p-4 md:p-8"
      style={{
        background: "radial-gradient(ellipse at top, #0E2A40 0%, #070B14 60%)",
      }}
    >
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-4 border"
            style={{
              borderColor: "rgba(255,122,47,0.4)",
              background: "rgba(255,122,47,0.08)",
            }}
          >
            <span
              className="text-xs font-bold tracking-widest uppercase"
              style={{ color: "#FF7A2F" }}
            >
              Step 1 of 2 — Choose Your Franchise
            </span>
          </div>
          <h1
            className="text-4xl md:text-5xl font-black uppercase tracking-tight mb-3"
            style={{
              fontFamily: "'BricolageGrotesque', sans-serif",
              color: "#E9EEF5",
            }}
          >
            PICK YOUR{" "}
            <span
              style={{
                background: "linear-gradient(90deg, #FF6A2A, #FF9A3D)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              FRANCHISE
            </span>
          </h1>
          <p className="text-sm" style={{ color: "#A7B3C2" }}>
            Select the team you want to manage for this season
          </p>
        </motion.div>

        {/* Franchise Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
          {INITIAL_TEAMS.map((team, i) => (
            <motion.button
              key={team.id}
              type="button"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              onClick={() => setSelected(team.id)}
              className="rounded-2xl p-4 text-left transition-all duration-200 cursor-pointer"
              style={{
                background:
                  selected === team.id
                    ? `${team.primaryColor}33`
                    : "rgba(15,34,51,0.7)",
                border:
                  selected === team.id
                    ? `2px solid ${team.primaryColor}`
                    : "2px solid rgba(30,58,74,0.5)",
                boxShadow:
                  selected === team.id
                    ? `0 0 20px ${team.primaryColor}44`
                    : "none",
              }}
            >
              {/* Badge */}
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-sm mb-3"
                style={{ background: team.primaryColor, color: "#fff" }}
              >
                {team.shortName}
              </div>
              <div
                className="text-sm font-bold mb-1 leading-tight"
                style={{ color: "#E9EEF5" }}
              >
                {team.name}
              </div>
              <div className="text-xs" style={{ color: "#A7B3C2" }}>
                {TEAM_DESCRIPTIONS[team.id]}
              </div>
              {selected === team.id && (
                <div
                  className="mt-2 text-xs font-bold"
                  style={{ color: team.primaryColor }}
                >
                  ✓ Selected
                </div>
              )}
            </motion.button>
          ))}
        </div>

        {/* Mode selection -- only shown after picking franchise */}
        {selected !== null && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid md:grid-cols-2 gap-4"
          >
            {/* Auction Mode */}
            <button
              type="button"
              onMouseEnter={() => setHoveredMode("auction")}
              onMouseLeave={() => setHoveredMode(null)}
              onClick={() => onSelect(selected, "auction")}
              className="rounded-2xl p-6 text-left transition-all duration-200"
              style={{
                background:
                  hoveredMode === "auction"
                    ? "rgba(255,106,42,0.15)"
                    : "rgba(15,34,51,0.8)",
                border:
                  hoveredMode === "auction"
                    ? "2px solid #FF6A2A"
                    : "2px solid rgba(255,106,42,0.3)",
              }}
            >
              <div className="text-2xl mb-3">🔨</div>
              <h3
                className="text-lg font-black uppercase mb-2"
                style={{
                  color: "#FF9A3D",
                  fontFamily: "'BricolageGrotesque', sans-serif",
                }}
              >
                LIVE AUCTION
              </h3>
              <p className="text-sm" style={{ color: "#A7B3C2" }}>
                Bid against 7 AI teams in real-time. Win players within your 100
                Cr budget, then play the tournament.
              </p>
              <div
                className="mt-4 text-xs font-bold uppercase tracking-wider"
                style={{ color: "#FF7A2F" }}
              >
                Recommended →
              </div>
            </button>

            {/* Quick Play Mode */}
            <button
              type="button"
              onMouseEnter={() => setHoveredMode("quickplay")}
              onMouseLeave={() => setHoveredMode(null)}
              onClick={() => onSelect(selected, "quickplay")}
              className="rounded-2xl p-6 text-left transition-all duration-200"
              style={{
                background:
                  hoveredMode === "quickplay"
                    ? "rgba(34,184,199,0.15)"
                    : "rgba(15,34,51,0.8)",
                border:
                  hoveredMode === "quickplay"
                    ? "2px solid #22B8C7"
                    : "2px solid rgba(34,184,199,0.3)",
              }}
            >
              <div className="text-2xl mb-3">⚡</div>
              <h3
                className="text-lg font-black uppercase mb-2"
                style={{
                  color: "#22B8C7",
                  fontFamily: "'BricolageGrotesque', sans-serif",
                }}
              >
                QUICK PLAY
              </h3>
              <p className="text-sm" style={{ color: "#A7B3C2" }}>
                Auction is auto-simulated instantly. You get a full squad
                assigned to your franchise -- jump straight into matches.
              </p>
              <div
                className="mt-4 text-xs font-bold uppercase tracking-wider"
                style={{ color: "#22B8C7" }}
              >
                Skip to matches →
              </div>
            </button>
          </motion.div>
        )}

        {selected === null && (
          <div className="text-center" style={{ color: "#A7B3C2" }}>
            <p className="text-sm">← Select a franchise above to continue</p>
          </div>
        )}
      </div>
    </div>
  );
}
