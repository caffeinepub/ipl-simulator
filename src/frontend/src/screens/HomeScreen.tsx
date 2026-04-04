import {
  BarChart3,
  Gavel,
  Star,
  Swords,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { motion } from "motion/react";
import { INITIAL_TEAMS } from "../data/players";
import type { GameState } from "../types/game";

interface HomeScreenProps {
  gameState: GameState;
  onNavigate: (phase: GameState["phase"]) => void;
  onReset: () => void;
}

export default function HomeScreen({
  gameState,
  onNavigate,
  onReset,
}: HomeScreenProps) {
  const hasStarted = gameState.auctionComplete || gameState.auctionIndex > 0;

  const features = [
    {
      icon: Gavel,
      title: "Live Auction System",
      desc: "Bid against AI teams in real-time",
    },
    {
      icon: Swords,
      title: "Batting & Bowling Controls",
      desc: "Full ball-by-ball control",
    },
    {
      icon: Users,
      title: "Team Management",
      desc: "Build your perfect Playing XI",
    },
    {
      icon: Trophy,
      title: "Full Tournament & Leaderboard",
      desc: "Win the IPL trophy!",
    },
  ];

  return (
    <div className="relative overflow-hidden">
      {/* Hero Section */}
      <section
        className="relative min-h-[90vh] flex flex-col items-center justify-center px-4 py-20"
        style={{
          background:
            "radial-gradient(ellipse at top, #0E2A40 0%, #070B14 60%)",
        }}
      >
        {/* Background glow effects */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div
            className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full opacity-10"
            style={{ background: "#35E06F", filter: "blur(80px)" }}
          />
          <div
            className="absolute top-1/4 right-1/4 w-64 h-64 rounded-full opacity-10"
            style={{ background: "#FF6A2A", filter: "blur(80px)" }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 50% 50%, rgba(34,184,199,0.04) 0%, transparent 70%)",
            }}
          />
          {/* Stadium light streaks */}
          <div
            className="absolute top-0 left-1/3 w-1 h-48 opacity-20"
            style={{
              background: "linear-gradient(to bottom, #35E06F, transparent)",
            }}
          />
          <div
            className="absolute top-0 right-1/3 w-1 h-48 opacity-20"
            style={{
              background: "linear-gradient(to bottom, #FF6A2A, transparent)",
            }}
          />
        </div>

        {/* Left cricketer silhouette */}
        <div className="absolute left-0 bottom-0 opacity-20 text-9xl select-none pointer-events-none hidden lg:block">
          <div
            style={{
              fontSize: "12rem",
              filter: "drop-shadow(0 0 30px #35E06F)",
            }}
          >
            🤾
          </div>
        </div>
        {/* Right cricketer silhouette */}
        <div className="absolute right-0 bottom-0 opacity-20 text-9xl select-none pointer-events-none hidden lg:block">
          <div
            style={{
              fontSize: "12rem",
              filter: "drop-shadow(0 0 30px #FF6A2A)",
            }}
          >
            🏏
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="text-center relative z-10 max-w-4xl"
        >
          {/* Season Badge */}
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-6 border"
            style={{
              borderColor: "rgba(34,184,199,0.3)",
              background: "rgba(34,184,199,0.08)",
            }}
          >
            <span
              className="text-xs font-bold tracking-widest uppercase"
              style={{ color: "#22B8C7" }}
            >
              IPL 2024 • Season {gameState.season}
            </span>
          </div>

          <h1
            className="text-5xl md:text-7xl font-black uppercase tracking-tight mb-4"
            style={{
              fontFamily: "'BricolageGrotesque', sans-serif",
              color: "#E9EEF5",
              lineHeight: 1.05,
            }}
          >
            RULE THE AUCTION.
            <br />
            <span className="text-gradient-orange">OWN THE GAME.</span>
          </h1>

          <p
            className="text-lg mb-8 max-w-xl mx-auto"
            style={{ color: "#A7B3C2" }}
          >
            Build your dream IPL team, bid for legendary players, and lead your
            franchise to championship glory.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {!hasStarted ? (
              <>
                <button
                  type="button"
                  onClick={() => onNavigate("franchise")}
                  data-ocid="home.start_auction.primary_button"
                  className="px-8 py-3 rounded-lg text-base font-bold uppercase tracking-wider transition-all duration-200"
                  style={{
                    background: "linear-gradient(135deg, #FF6A2A, #FF9A3D)",
                    color: "#fff",
                    boxShadow: "0 4px 20px rgba(255,106,42,0.35)",
                  }}
                >
                  BUILD YOUR TEAM NOW
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate("franchise")}
                  data-ocid="home.auction.secondary_button"
                  className="px-8 py-3 rounded-lg text-base font-bold uppercase tracking-wider border transition-all duration-200"
                  style={{
                    borderColor: "#FF7A2F",
                    color: "#FF7A2F",
                    background: "transparent",
                  }}
                >
                  START AUCTION
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onNavigate("tournament")}
                  data-ocid="home.continue.primary_button"
                  className="px-8 py-3 rounded-lg text-base font-bold uppercase tracking-wider transition-all duration-200"
                  style={{
                    background: "linear-gradient(135deg, #FF6A2A, #FF9A3D)",
                    color: "#fff",
                    boxShadow: "0 4px 20px rgba(255,106,42,0.35)",
                  }}
                >
                  CONTINUE GAME
                </button>
                <button
                  type="button"
                  onClick={onReset}
                  data-ocid="home.new_game.secondary_button"
                  className="px-8 py-3 rounded-lg text-base font-bold uppercase tracking-wider border transition-all duration-200"
                  style={{
                    borderColor: "rgba(167,179,194,0.4)",
                    color: "#A7B3C2",
                    background: "transparent",
                  }}
                >
                  NEW GAME
                </button>
              </>
            )}
          </div>
        </motion.div>

        {/* Feature tiles */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-16 relative z-10 w-full max-w-5xl"
        >
          {features.map((f, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: static list
              key={i}
              className="panel-glass rounded-xl p-4 text-center"
              data-ocid={`home.feature.item.${i + 1}`}
            >
              <f.icon
                className="w-6 h-6 mx-auto mb-2"
                style={{ color: i % 2 === 0 ? "#35E06F" : "#FF7A2F" }}
              />
              <div
                className="text-xs font-bold uppercase tracking-wide mb-1"
                style={{ color: "#E9EEF5" }}
              >
                {f.title}
              </div>
              <div className="text-xs" style={{ color: "#A7B3C2" }}>
                {f.desc}
              </div>
            </div>
          ))}
        </motion.div>
      </section>

      {/* Live match strip */}
      <div
        className="w-full py-3 px-4 border-y"
        style={{
          borderColor: "rgba(30,58,74,0.5)",
          background: "rgba(11,18,34,0.9)",
        }}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 overflow-x-auto">
            <span
              className="text-sm font-bold"
              style={{ color: "#E9EEF5", whiteSpace: "nowrap" }}
            >
              MM vs CC
            </span>
            <span
              className="text-sm"
              style={{ color: "#35E06F", whiteSpace: "nowrap" }}
            >
              185/4 (19.2)
            </span>
            <span
              className="text-xs"
              style={{ color: "#A7B3C2", whiteSpace: "nowrap" }}
            >
              Target: 178 • Need 0 from 4 balls
            </span>
          </div>
          <span className="badge-live shrink-0">LIVE</span>
        </div>
      </div>

      {/* Content Split */}
      <section className="max-w-7xl mx-auto px-4 py-10 grid md:grid-cols-2 gap-6">
        {/* Upcoming Auctions */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="panel-glow rounded-2xl p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <h2
              className="text-sm font-bold uppercase tracking-widest"
              style={{
                color: "#E9EEF5",
                fontFamily: "'BricolageGrotesque', sans-serif",
              }}
            >
              Upcoming Auctions
            </h2>
            <span
              className="text-xs px-2 py-0.5 rounded"
              style={{
                background: "rgba(53,224,111,0.1)",
                color: "#35E06F",
                border: "1px solid rgba(53,224,111,0.3)",
              }}
            >
              Dynamic Bidding
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              {
                name: "Virat Kohli",
                price: "15 Cr",
                role: "BAT",
                color: "#FF4444",
              },
              {
                name: "Jasprit Bumrah",
                price: "12 Cr",
                role: "BOWL",
                color: "#35E06F",
              },
              {
                name: "Rashid Khan",
                price: "11 Cr",
                role: "AR",
                color: "#FF9A3D",
              },
            ].map((p, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: static list
                key={i}
                className="rounded-xl p-3 text-center border"
                style={{
                  background: "rgba(15,34,51,0.8)",
                  borderColor: "rgba(30,58,74,0.6)",
                }}
                data-ocid={`home.auction_preview.item.${i + 1}`}
              >
                <div
                  className="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center text-xs font-bold"
                  style={{ background: p.color, color: "#fff" }}
                >
                  {p.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </div>
                <div
                  className="text-xs font-semibold"
                  style={{ color: "#E9EEF5" }}
                >
                  {p.name.split(" ")[0]}
                </div>
                <div className="text-xs" style={{ color: "#A7B3C2" }}>
                  {p.role} • {p.price}
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => onNavigate("franchise")}
            data-ocid="home.go_auction.button"
            className="w-full mt-4 py-2.5 rounded-lg text-sm font-bold uppercase tracking-wider transition-all"
            style={{
              background: "linear-gradient(135deg, #FF6A2A, #FF9A3D)",
              color: "#fff",
            }}
          >
            {hasStarted ? "Continue Auction" : "Start Auction"}
          </button>
        </motion.div>

        {/* IPL Bracket */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="panel-glow rounded-2xl p-5"
        >
          <h2
            className="text-sm font-bold uppercase tracking-widest mb-4"
            style={{
              color: "#E9EEF5",
              fontFamily: "'BricolageGrotesque', sans-serif",
            }}
          >
            IPL 2024 Bracket
          </h2>
          <div className="space-y-2">
            {["Qualifier 1", "Eliminator", "Qualifier 2", "Final"].map(
              (stage, i) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: static list
                  key={i}
                  className="flex items-center gap-3 py-2 rounded-lg px-3"
                  style={{ background: "rgba(15,34,51,0.6)" }}
                  data-ocid={`home.bracket.item.${i + 1}`}
                >
                  <div
                    className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold"
                    style={{
                      background:
                        i === 3
                          ? "rgba(255,154,61,0.2)"
                          : "rgba(34,184,199,0.1)",
                      color: i === 3 ? "#FF9A3D" : "#22B8C7",
                    }}
                  >
                    {i + 1}
                  </div>
                  <span className="text-sm" style={{ color: "#E9EEF5" }}>
                    {stage}
                  </span>
                  <span
                    className="ml-auto text-xs"
                    style={{ color: "#A7B3C2" }}
                  >
                    {i === 3 ? "🏆" : "TBD vs TBD"}
                  </span>
                </div>
              ),
            )}
          </div>
          <button
            type="button"
            onClick={() => onNavigate("tournament")}
            data-ocid="home.tournament.button"
            className="w-full mt-4 py-2.5 rounded-lg text-sm font-bold uppercase tracking-wider border transition-all"
            style={{
              borderColor: "#22B8C7",
              color: "#22B8C7",
              background: "transparent",
            }}
          >
            View Tournament
          </button>
        </motion.div>
      </section>

      {/* Leaderboard Preview */}
      <section className="max-w-7xl mx-auto px-4 pb-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="panel-glow rounded-2xl p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <h2
              className="text-sm font-bold uppercase tracking-widest"
              style={{
                color: "#E9EEF5",
                fontFamily: "'BricolageGrotesque', sans-serif",
              }}
            >
              Global Leaderboard
            </h2>
            <button
              type="button"
              onClick={() => onNavigate("leaderboard")}
              className="text-xs"
              style={{ color: "#22B8C7" }}
              data-ocid="home.leaderboard.link"
            >
              View All →
            </button>
          </div>
          <div className="overflow-x-auto">
            <table
              className="w-full text-xs"
              data-ocid="home.leaderboard.table"
            >
              <thead>
                <tr style={{ color: "#A7B3C2" }}>
                  <th className="text-left pb-2">Rank</th>
                  <th className="text-left pb-2">Team</th>
                  <th className="text-right pb-2">W</th>
                  <th className="text-right pb-2">Pts</th>
                </tr>
              </thead>
              <tbody>
                {gameState.teams.slice(0, 4).map((team, i) => (
                  <tr
                    key={team.id}
                    style={{ borderTop: "1px solid rgba(30,58,74,0.4)" }}
                    data-ocid={`home.leaderboard.row.${i + 1}`}
                  >
                    <td
                      className="py-2"
                      style={{ color: i === 0 ? "#FF9A3D" : "#A7B3C2" }}
                    >
                      #{i + 1}
                    </td>
                    <td className="py-2">
                      <span
                        className="font-semibold"
                        style={{
                          color: team.isUserTeam ? "#35E06F" : "#E9EEF5",
                        }}
                      >
                        {team.isUserTeam ? "⭐ " : ""}
                        {team.name}
                      </span>
                    </td>
                    <td
                      className="py-2 text-right"
                      style={{ color: "#35E06F" }}
                    >
                      {team.wins}
                    </td>
                    <td
                      className="py-2 text-right"
                      style={{ color: "#FF9A3D" }}
                    >
                      {team.points}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      </section>
    </div>
  );
}
