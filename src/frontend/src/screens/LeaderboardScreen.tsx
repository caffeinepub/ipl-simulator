import { BarChart3, Star, Target, Trophy, Zap } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { getPlayer } from "../data/players";
import {
  getBestEconomy,
  getBestStrikeRate,
  getPlayerOfTournament,
  getTopBatsmen,
  getTopCenturyScorers,
  getTopFiftyScorers,
  getTopFourHitters,
  getTopSixHitters,
  getTopWicketTakers,
} from "../engine/gameEngine";
import type { GameState, PlayerTournamentStats } from "../types/game";

interface Props {
  gameState: GameState;
  onNavigate: (phase: GameState["phase"]) => void;
}

type LeaderboardTab =
  | "runs"
  | "wickets"
  | "sixes"
  | "fours"
  | "sr"
  | "pot"
  | "100s"
  | "50s"
  | "economy";

const TABS: {
  key: LeaderboardTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { key: "runs", label: "Most Runs", icon: Target },
  { key: "wickets", label: "Most Wickets", icon: Zap },
  { key: "100s", label: "Most 100s", icon: Trophy },
  { key: "50s", label: "Most 50s", icon: Star },
  { key: "sixes", label: "Most Sixes", icon: Trophy },
  { key: "fours", label: "Most Fours", icon: BarChart3 },
  { key: "sr", label: "Best SR", icon: Star },
  { key: "economy", label: "Best Economy", icon: Zap },
  { key: "pot", label: "Player of Tournament", icon: Star },
];

const ROLE_COLORS: Record<string, string> = {
  Batsman: "#35E06F",
  Bowler: "#22B8C7",
  AllRounder: "#FF9A3D",
  WicketKeeper: "#FF7A2F",
};

const MY_TEAM_CATEGORIES = [
  { key: "runs", label: "Top Run Scorer", emoji: "🏏" },
  { key: "wickets", label: "Top Wicket Taker", emoji: "🎯" },
  { key: "sixes", label: "Top Six Hitter", emoji: "💥" },
  { key: "fours", label: "Top Four Hitter", emoji: "🔥" },
  { key: "strikeRate", label: "Best Strike Rate", emoji: "⚡" },
  { key: "centuries", label: "Top Century Scorer", emoji: "💯" },
  { key: "halfCenturies", label: "Top Fifty Scorer", emoji: "🌟" },
  { key: "economy", label: "Best Economy", emoji: "🧊" },
] as const;

type MyTeamCategoryKey = (typeof MY_TEAM_CATEGORIES)[number]["key"];

function getMockStats(gameState: GameState) {
  if (gameState.playerStats.length > 0) return gameState.playerStats;

  const stats: PlayerTournamentStats[] = [];
  for (const team of gameState.teams) {
    for (const playerId of team.squad.slice(0, 11)) {
      const player = getPlayer(playerId);
      if (!player) continue;
      const isBatter =
        player.role === "Batsman" || player.role === "WicketKeeper";
      const isBowler = player.role === "Bowler" || player.role === "AllRounder";
      const runs = isBatter
        ? Math.floor(Math.random() * 400 + 50)
        : Math.floor(Math.random() * 100);
      const balls = Math.floor(runs / (player.strikeRate / 100)) || 1;
      const sixes = Math.floor(runs / 30);
      const fours = Math.floor(runs / 20);
      const wickets = isBowler ? Math.floor(Math.random() * 18) : 0;
      const oversBowled = isBowler ? Math.floor(Math.random() * 30 + 5) : 0;
      const runsConceded = oversBowled * player.economy;
      // Realistic milestone ratios: ~1 century per 15 innings, ~1 fifty per 5 innings
      // Estimate innings based on ~28 runs/innings average
      const estInnings = Math.max(1, Math.floor(runs / 28));
      const centuries = isBatter
        ? Math.max(0, Math.floor(estInnings * 0.07))
        : 0;
      // halfCenturies counts scores of 50-99 only (not centuries)
      const halfCenturies = isBatter
        ? Math.max(centuries, Math.floor(estInnings * 0.18) - centuries)
        : 0;
      stats.push({
        playerId,
        teamId: team.id,
        runs,
        balls,
        fours,
        sixes,
        wickets,
        oversBowled,
        runsConceded,
        innings: estInnings,
        matchesPlayed: Math.max(estInnings, Math.floor(Math.random() * 10 + 4)),
        strikeRate: balls > 0 ? (runs / balls) * 100 : 0,
        economy: oversBowled > 0 ? runsConceded / oversBowled : 0,
        playerOfMatchCount: Math.floor(Math.random() * 3),
        centuries,
        halfCenturies,
      });
    }
  }
  return stats;
}

interface MyTeamStat {
  label: string;
  emoji: string;
  playerId: number | null;
  playerName: string | null;
  playerRole: string | null;
  value: string;
  hasData: boolean;
}

/** Returns the user team's best performer for a given stat category */
function getMyTeamBest(
  stats: PlayerTournamentStats[],
  userTeamId: number,
  userSquad: number[],
): MyTeamStat[] {
  // Filter stats to only include players in the user's squad
  // Cross-check by both squad membership AND teamId to ensure correctness
  const myStats = stats.filter(
    (s) => userSquad.includes(s.playerId) || s.teamId === userTeamId,
  );

  const best = (
    arr: PlayerTournamentStats[],
    key: MyTeamCategoryKey,
    ascending = false,
    minFilter?: (s: PlayerTournamentStats) => boolean,
  ): PlayerTournamentStats | null => {
    const filtered = minFilter
      ? arr.filter(minFilter)
      : arr.filter((s) => {
          const val = s[key as keyof PlayerTournamentStats] as number;
          return val > 0;
        });
    if (!filtered.length) return null;
    return filtered.reduce((a, b) => {
      const av = a[key as keyof PlayerTournamentStats] as number;
      const bv = b[key as keyof PlayerTournamentStats] as number;
      return ascending ? (av < bv ? a : b) : av > bv ? a : b;
    });
  };

  const topRuns = best(myStats, "runs");
  const topWickets = best(myStats, "wickets");
  const topSixes = best(myStats, "sixes");
  const topFours = best(myStats, "fours");
  const topSR = best(myStats, "strikeRate", false, (s) => s.balls >= 30);
  const topCenturies = best(myStats, "centuries");
  const topFifties = best(myStats, "halfCenturies");
  const bestEco = best(myStats, "economy", true, (s) => s.oversBowled >= 2);

  const playerName = (s: PlayerTournamentStats | null): string | null => {
    if (!s) return null;
    const p = getPlayer(s.playerId);
    return p?.name ?? null;
  };
  const playerRole = (s: PlayerTournamentStats | null): string | null => {
    if (!s) return null;
    const p = getPlayer(s.playerId);
    return p?.role ?? null;
  };

  const makeRow = (
    label: string,
    emoji: string,
    s: PlayerTournamentStats | null,
    displayValue: string,
  ): MyTeamStat => ({
    label,
    emoji,
    playerId: s?.playerId ?? null,
    playerName: playerName(s),
    playerRole: playerRole(s),
    value: displayValue,
    hasData: s !== null,
  });

  return [
    makeRow(
      "Top Run Scorer",
      "🏏",
      topRuns,
      topRuns ? `${topRuns.runs} runs` : "No data yet",
    ),
    makeRow(
      "Top Wicket Taker",
      "🎯",
      topWickets,
      topWickets ? `${topWickets.wickets} wkts` : "No data yet",
    ),
    makeRow(
      "Top Six Hitter",
      "💥",
      topSixes,
      topSixes ? `${topSixes.sixes} sixes` : "No data yet",
    ),
    makeRow(
      "Top Four Hitter",
      "🔥",
      topFours,
      topFours ? `${topFours.fours} fours` : "No data yet",
    ),
    makeRow(
      "Best Strike Rate",
      "⚡",
      topSR,
      topSR ? `SR ${topSR.strikeRate.toFixed(1)}` : "No data yet",
    ),
    makeRow(
      "Top Century Scorer",
      "💯",
      topCenturies,
      topCenturies ? `${topCenturies.centuries ?? 0} tons` : "No data yet",
    ),
    makeRow(
      "Top Fifty Scorer",
      "🌟",
      topFifties,
      topFifties ? `${topFifties.halfCenturies ?? 0} fifties` : "No data yet",
    ),
    makeRow(
      "Best Economy",
      "🧊",
      bestEco,
      bestEco ? `${bestEco.economy.toFixed(2)} eco` : "No data yet",
    ),
  ];
}

export default function LeaderboardScreen({ gameState, onNavigate }: Props) {
  const [activeTab, setActiveTab] = useState<LeaderboardTab>("runs");
  const stats = getMockStats(gameState);

  const getRows = () => {
    switch (activeTab) {
      case "runs":
        return getTopBatsmen(stats);
      case "wickets":
        return getTopWicketTakers(stats);
      case "sixes":
        return getTopSixHitters(stats);
      case "fours":
        return getTopFourHitters(stats);
      case "sr":
        return getBestStrikeRate(stats);
      case "100s":
        return getTopCenturyScorers(stats);
      case "50s":
        return getTopFiftyScorers(stats);
      case "economy":
        return getBestEconomy(stats);
      case "pot": {
        const p = getPlayerOfTournament(stats);
        return p ? [p] : [];
      }
      default:
        return [];
    }
  };

  const rows = getRows();
  const pot = getPlayerOfTournament(stats);

  const getStatValue = (row: PlayerTournamentStats) => {
    switch (activeTab) {
      case "runs":
        return {
          main: row.runs,
          sub: `${row.balls} balls • ${row.sixes} sixes • SR: ${row.strikeRate.toFixed(1)}`,
        };
      case "wickets":
        return {
          main: row.wickets,
          sub: `${row.oversBowled.toFixed(1)} overs • Eco: ${row.economy.toFixed(2)}`,
        };
      case "sixes":
        return {
          main: row.sixes,
          sub: `${row.runs} runs • SR: ${row.strikeRate.toFixed(1)}`,
        };
      case "fours":
        return {
          main: row.fours,
          sub: `${row.runs} runs • ${row.balls} balls`,
        };
      case "sr":
        return {
          main: row.strikeRate.toFixed(1),
          sub: `${row.runs} runs • ${row.balls} balls`,
        };
      case "100s":
        return {
          main: row.centuries ?? 0,
          sub: `${row.runs} runs • ${row.innings} innings`,
        };
      case "50s":
        return {
          main: row.halfCenturies ?? 0,
          sub: `${row.runs} runs • ${row.innings} innings`,
        };
      case "economy":
        return {
          main: row.economy.toFixed(2),
          sub: `${row.oversBowled.toFixed(1)} overs • ${row.wickets} wkts`,
        };
      case "pot":
        return { main: "★ PoT", sub: `${row.runs} runs, ${row.wickets} wkts` };
      default:
        return { main: 0, sub: "" };
    }
  };

  const userTeam = gameState.teams.find((t) => t.isUserTeam);
  const userPlayerIds = userTeam?.squad ?? [];
  const userTeamId = userTeam?.id ?? -1;
  const myTeamRows = getMyTeamBest(stats, userTeamId, userPlayerIds);

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: "#070B14" }}>
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1
            className="text-2xl font-black uppercase"
            style={{
              color: "#E9EEF5",
              fontFamily: "'BricolageGrotesque', sans-serif",
            }}
          >
            <span className="text-gradient-orange">LEADERBOARD</span>
          </h1>
          <p className="text-sm" style={{ color: "#A7B3C2" }}>
            IPL 2026 • Season {gameState.season} Stats
          </p>
        </div>

        {/* Player of Tournament Feature */}
        {pot && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="panel-glow rounded-2xl p-5 mb-6 flex items-center gap-5"
            style={{ border: "1px solid rgba(255,154,61,0.3)" }}
            data-ocid="leaderboard.pot.card"
          >
            <div className="text-4xl">🏆</div>
            <div>
              <div
                className="text-xs uppercase tracking-widest mb-1"
                style={{ color: "#FF9A3D" }}
              >
                Player of the Tournament
              </div>
              <div
                className="text-xl font-black"
                style={{
                  color: "#E9EEF5",
                  fontFamily: "'BricolageGrotesque', sans-serif",
                }}
              >
                {pot.player.name}
              </div>
              <div className="text-sm" style={{ color: "#A7B3C2" }}>
                {pot.player.role} • {pot.player.country} • {pot.runs} runs,{" "}
                {pot.wickets} wkts, {pot.sixes} sixes
              </div>
            </div>
            <div className="ml-auto text-right">
              <div className="text-xs" style={{ color: "#A7B3C2" }}>
                Team
              </div>
              <div className="font-semibold" style={{ color: "#35E06F" }}>
                {
                  gameState.teams.find((t) => t.squad.includes(pot.playerId))
                    ?.name
                }
              </div>
            </div>
          </motion.div>
        )}

        {/* Main layout: leaderboard table + My Team sidebar */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left: Leaderboard (2/3 width) */}
          <div className="lg:col-span-2">
            {/* Tabs */}
            <div
              className="flex gap-1 overflow-x-auto pb-2 mb-4"
              data-ocid="leaderboard.tabs.list"
            >
              {TABS.map((tab) => (
                <button
                  type="button"
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  data-ocid={`leaderboard.${tab.key}.tab`}
                  className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap"
                  style={{
                    background:
                      activeTab === tab.key
                        ? "linear-gradient(135deg, #FF6A2A, #FF9A3D)"
                        : "rgba(15,34,51,0.6)",
                    color: activeTab === tab.key ? "#fff" : "#A7B3C2",
                    border:
                      activeTab === tab.key
                        ? "none"
                        : "1px solid rgba(30,58,74,0.5)",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Table */}
            <div
              className="panel-glow rounded-2xl p-5"
              data-ocid="leaderboard.stats.table"
            >
              {rows.length === 0 ? (
                <div
                  className="text-center py-12"
                  style={{ color: "#A7B3C2" }}
                  data-ocid="leaderboard.stats.empty_state"
                >
                  <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p>No stats yet. Play matches to see leaderboard!</p>
                  <button
                    type="button"
                    onClick={() => onNavigate("match")}
                    className="mt-3 text-sm"
                    style={{ color: "#FF7A2F" }}
                  >
                    Go to Match →
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {rows.map((row, i) => {
                    const team = gameState.teams.find((t) =>
                      t.squad.includes(row.playerId),
                    );
                    const isUserPlayer = userPlayerIds.includes(row.playerId);
                    const statVal = getStatValue(row);
                    return (
                      <motion.div
                        key={row.playerId}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.04 }}
                        className="flex items-center gap-4 p-3 rounded-xl"
                        style={{
                          background: isUserPlayer
                            ? "rgba(53,224,111,0.06)"
                            : "rgba(15,34,51,0.6)",
                          border: isUserPlayer
                            ? "1px solid rgba(53,224,111,0.25)"
                            : "1px solid rgba(30,58,74,0.4)",
                        }}
                        data-ocid={`leaderboard.stats.item.${i + 1}`}
                      >
                        <div
                          className="w-7 h-7 rounded flex items-center justify-center text-xs font-black"
                          style={{
                            background:
                              i === 0
                                ? "rgba(255,154,61,0.3)"
                                : i === 1
                                  ? "rgba(192,192,192,0.2)"
                                  : i === 2
                                    ? "rgba(205,127,50,0.2)"
                                    : "rgba(30,58,74,0.5)",
                            color:
                              i < 3
                                ? ["#FF9A3D", "#C0C0C0", "#CD7F32"][i]
                                : "#A7B3C2",
                          }}
                        >
                          {i + 1}
                        </div>
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                          style={{
                            background: `${ROLE_COLORS[row.player.role]}22`,
                            color: ROLE_COLORS[row.player.role],
                          }}
                        >
                          {row.player.name
                            .split(" ")
                            .map((n: string) => n[0])
                            .join("")}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div
                            className="text-sm font-semibold truncate"
                            style={{
                              color: isUserPlayer ? "#35E06F" : "#E9EEF5",
                            }}
                          >
                            {isUserPlayer ? "⭐ " : ""}
                            {row.player.name}
                          </div>
                          <div className="text-xs" style={{ color: "#A7B3C2" }}>
                            {row.player.role} • {team?.shortName}
                          </div>
                        </div>
                        <div className="text-right">
                          <div
                            className="text-lg font-black"
                            style={{
                              color: "#FF9A3D",
                              fontFamily: "'BricolageGrotesque', sans-serif",
                            }}
                          >
                            {statVal.main}
                          </div>
                          <div className="text-xs" style={{ color: "#A7B3C2" }}>
                            {statVal.sub}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right: My Team Stats Column (1/3 width) */}
          <div className="lg:col-span-1">
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="rounded-2xl overflow-hidden sticky top-4"
              style={{
                background: "rgba(7, 11, 20, 0.95)",
                border: "1px solid rgba(53,224,111,0.3)",
                boxShadow: "0 0 24px rgba(53,224,111,0.08)",
              }}
              data-ocid="leaderboard.my_team.panel"
            >
              {/* Panel header */}
              <div
                className="px-4 py-3 flex items-center gap-3"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(53,224,111,0.15), rgba(34,184,199,0.10))",
                  borderBottom: "1px solid rgba(53,224,111,0.2)",
                }}
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs shrink-0"
                  style={{
                    background: userTeam?.primaryColor ?? "#35E06F",
                    color: "#fff",
                    fontSize: "9px",
                    letterSpacing: "0.05em",
                  }}
                >
                  {userTeam?.shortName ?? "MY"}
                </div>
                <div className="min-w-0">
                  <div
                    className="text-xs font-black uppercase tracking-widest"
                    style={{ color: "#35E06F" }}
                  >
                    My Team Progress
                  </div>
                  <div
                    className="text-xs truncate"
                    style={{ color: "#A7B3C2" }}
                  >
                    {userTeam?.name ?? "Your Team"} • Season {gameState.season}
                  </div>
                </div>
              </div>

              {/* Stats rows */}
              <div className="p-3 space-y-2">
                {myTeamRows.map((row, i) => (
                  <motion.div
                    key={row.label}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 + i * 0.055 }}
                    className="rounded-xl p-2.5"
                    style={{
                      background: row.hasData
                        ? "rgba(15,34,51,0.8)"
                        : "rgba(10,20,34,0.6)",
                      border: row.hasData
                        ? "1px solid rgba(30,58,74,0.6)"
                        : "1px solid rgba(20,40,60,0.4)",
                    }}
                    data-ocid={`leaderboard.my_team.stat.${i + 1}`}
                  >
                    {/* Category label row */}
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className="text-xs font-medium flex items-center gap-1"
                        style={{ color: "#7A8FA8" }}
                      >
                        <span>{row.emoji}</span>
                        <span>{row.label}</span>
                      </span>
                      <span
                        className="text-xs font-black px-2 py-0.5 rounded-full"
                        style={{
                          background: row.hasData
                            ? "rgba(255,154,61,0.15)"
                            : "rgba(30,50,70,0.4)",
                          color: row.hasData ? "#FF9A3D" : "#4A5568",
                        }}
                      >
                        {row.value}
                      </span>
                    </div>
                    {/* Player name row */}
                    {row.hasData && row.playerName ? (
                      <div className="flex items-center gap-1.5 mt-1">
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                          style={{
                            background: "rgba(53,224,111,0.15)",
                            color: "#35E06F",
                            fontSize: "8px",
                          }}
                        >
                          {row.playerName
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .slice(0, 2)}
                        </div>
                        <div className="min-w-0">
                          <div
                            className="text-xs font-semibold truncate"
                            style={{ color: "#E9EEF5" }}
                          >
                            {row.playerName}
                          </div>
                          {row.playerRole && (
                            <div
                              className="text-xs leading-none"
                              style={{ color: "#4A5568", fontSize: "10px" }}
                            >
                              {row.playerRole}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div
                        className="text-xs mt-1"
                        style={{ color: "#3A4A5A" }}
                      >
                        No qualifying data yet
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>

              {/* Team record footer */}
              {userTeam && (
                <div
                  className="px-4 py-3 grid grid-cols-4 gap-1 text-center"
                  style={{ borderTop: "1px solid rgba(53,224,111,0.15)" }}
                >
                  <div>
                    <div
                      className="text-base font-black"
                      style={{ color: "#35E06F" }}
                    >
                      {userTeam.wins}
                    </div>
                    <div
                      className="text-xs"
                      style={{ color: "#A7B3C2", fontSize: "9px" }}
                    >
                      Wins
                    </div>
                  </div>
                  <div>
                    <div
                      className="text-base font-black"
                      style={{ color: "#E53935" }}
                    >
                      {userTeam.losses}
                    </div>
                    <div
                      className="text-xs"
                      style={{ color: "#A7B3C2", fontSize: "9px" }}
                    >
                      Losses
                    </div>
                  </div>
                  <div>
                    <div
                      className="text-base font-black"
                      style={{ color: "#FF9A3D" }}
                    >
                      {userTeam.points}
                    </div>
                    <div
                      className="text-xs"
                      style={{ color: "#A7B3C2", fontSize: "9px" }}
                    >
                      Points
                    </div>
                  </div>
                  <div>
                    <div
                      className="text-base font-black"
                      style={{ color: "#22B8C7" }}
                    >
                      {userTeam.nrr >= 0 ? "+" : ""}
                      {(userTeam.nrr ?? 0).toFixed(2)}
                    </div>
                    <div
                      className="text-xs"
                      style={{ color: "#A7B3C2", fontSize: "9px" }}
                    >
                      NRR
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        </div>

        {/* Teams leaderboard */}
        <div
          className="panel-glow rounded-2xl p-5 mt-6"
          data-ocid="leaderboard.teams.table"
        >
          <h2
            className="text-sm font-bold uppercase tracking-widest mb-4"
            style={{ color: "#A7B3C2" }}
          >
            Points Table
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ color: "#A7B3C2" }}>
                  <th className="text-left pb-2">#</th>
                  <th className="text-left pb-2">Team</th>
                  <th className="text-center pb-2">P</th>
                  <th className="text-center pb-2">W</th>
                  <th className="text-center pb-2">L</th>
                  <th className="text-center pb-2">NRR</th>
                  <th className="text-right pb-2">Pts</th>
                </tr>
              </thead>
              <tbody>
                {[...gameState.teams]
                  .sort(
                    (a, b) =>
                      b.points - a.points || (b.nrr ?? 0) - (a.nrr ?? 0),
                  )
                  .map((team, i) => (
                    <tr
                      key={team.id}
                      style={{ borderTop: "1px solid rgba(30,58,74,0.4)" }}
                      data-ocid={`leaderboard.team.row.${i + 1}`}
                    >
                      <td
                        className="py-2"
                        style={{ color: i < 4 ? "#35E06F" : "#A7B3C2" }}
                      >
                        {i + 1}
                      </td>
                      <td
                        className="py-2 font-semibold"
                        style={{
                          color: team.isUserTeam ? "#35E06F" : "#E9EEF5",
                        }}
                      >
                        {team.isUserTeam ? "⭐ " : ""}
                        {team.name}
                      </td>
                      <td
                        className="py-2 text-center"
                        style={{ color: "#A7B3C2" }}
                      >
                        {team.wins + team.losses}
                      </td>
                      <td
                        className="py-2 text-center"
                        style={{ color: "#35E06F" }}
                      >
                        {team.wins}
                      </td>
                      <td
                        className="py-2 text-center"
                        style={{ color: "#E53935" }}
                      >
                        {team.losses}
                      </td>
                      <td
                        className="py-2 text-center font-mono text-xs"
                        style={{
                          color: (team.nrr ?? 0) >= 0 ? "#35E06F" : "#E53935",
                        }}
                      >
                        {(team.nrr ?? 0) >= 0 ? "+" : ""}
                        {(team.nrr ?? 0).toFixed(3)}
                      </td>
                      <td
                        className="py-2 text-right font-bold"
                        style={{ color: "#FF9A3D" }}
                      >
                        {team.points}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
