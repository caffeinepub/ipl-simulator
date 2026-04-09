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

/** Returns the user team's best performer for a given stat category */
function getMyTeamBest(
  stats: PlayerTournamentStats[],
  userSquad: number[],
): {
  label: string;
  emoji: string;
  playerId: number | null;
  value: string;
}[] {
  const myStats = stats.filter((s) => userSquad.includes(s.playerId));

  const best = <K extends keyof PlayerTournamentStats>(
    arr: PlayerTournamentStats[],
    key: K,
    ascending = false,
    minFilter?: (s: PlayerTournamentStats) => boolean,
  ) => {
    const filtered = minFilter ? arr.filter(minFilter) : arr;
    if (!filtered.length) return null;
    return filtered.reduce((a, b) => {
      const av = a[key] as number;
      const bv = b[key] as number;
      return ascending ? (av < bv ? a : b) : av > bv ? a : b;
    });
  };

  const topRuns = best(myStats, "runs");
  const topWickets = best(myStats, "wickets");
  const topSixes = best(myStats, "sixes");
  const topFours = best(myStats, "fours");
  const topSR = best(myStats, "strikeRate", false, (s) => s.balls >= 20);
  const topCenturies = best(myStats, "centuries");
  const topFifties = best(myStats, "halfCenturies");
  const bestEco = best(myStats, "economy", true, (s) => s.oversBowled >= 1);

  const fmt = (
    s: PlayerTournamentStats | null,
    key: keyof PlayerTournamentStats,
    decimals = 0,
  ) => {
    if (!s) return "–";
    const v = s[key] as number;
    return decimals > 0 ? v.toFixed(decimals) : String(v ?? 0);
  };

  return [
    {
      label: "Top Run Scorer",
      emoji: "🏏",
      playerId: topRuns?.playerId ?? null,
      value: topRuns ? `${topRuns.runs} runs` : "–",
    },
    {
      label: "Top Wicket Taker",
      emoji: "🎯",
      playerId: topWickets?.playerId ?? null,
      value: topWickets ? `${topWickets.wickets} wkts` : "–",
    },
    {
      label: "Top Six Hitter",
      emoji: "💥",
      playerId: topSixes?.playerId ?? null,
      value: topSixes ? `${topSixes.sixes} sixes` : "–",
    },
    {
      label: "Top Four Hitter",
      emoji: "🔥",
      playerId: topFours?.playerId ?? null,
      value: topFours ? `${topFours.fours} fours` : "–",
    },
    {
      label: "Best Strike Rate",
      emoji: "⚡",
      playerId: topSR?.playerId ?? null,
      value:
        fmt(topSR, "strikeRate", 1) !== "–"
          ? `SR ${fmt(topSR, "strikeRate", 1)}`
          : "–",
    },
    {
      label: "Top Century Scorer",
      emoji: "💯",
      playerId: topCenturies?.playerId ?? null,
      value: topCenturies ? `${topCenturies.centuries ?? 0} tons` : "–",
    },
    {
      label: "Top Fifty Scorer",
      emoji: "🌟",
      playerId: topFifties?.playerId ?? null,
      value: topFifties ? `${topFifties.halfCenturies ?? 0} fifties` : "–",
    },
    {
      label: "Best Economy",
      emoji: "🧊",
      playerId: bestEco?.playerId ?? null,
      value: bestEco ? `${bestEco.economy.toFixed(2)} eco` : "–",
    },
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

  const getUserTeamIds = () => {
    const userTeam = gameState.teams.find((t) => t.isUserTeam);
    return userTeam?.squad ?? [];
  };

  const userPlayerIds = getUserTeamIds();
  const userTeam = gameState.teams.find((t) => t.isUserTeam);
  const myTeamRows = getMyTeamBest(stats, userPlayerIds);

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: "#070B14" }}>
      <div className="max-w-6xl mx-auto">
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
              className="rounded-2xl p-5 sticky top-4"
              style={{
                background:
                  "linear-gradient(135deg, rgba(53,224,111,0.04), rgba(34,184,199,0.04))",
                border: "1px solid rgba(53,224,111,0.2)",
              }}
              data-ocid="leaderboard.my_team.panel"
            >
              {/* Header */}
              <div className="flex items-center gap-2 mb-4">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs"
                  style={{
                    background: userTeam?.primaryColor ?? "#35E06F",
                    color: "#fff",
                  }}
                >
                  {userTeam?.shortName ?? "MY"}
                </div>
                <div>
                  <div
                    className="text-xs font-black uppercase tracking-widest"
                    style={{ color: "#35E06F" }}
                  >
                    My Team
                  </div>
                  <div className="text-xs" style={{ color: "#A7B3C2" }}>
                    {userTeam?.name ?? "Your Team"}
                  </div>
                </div>
              </div>

              {/* Stats rows */}
              <div className="space-y-2.5">
                {myTeamRows.map((row, i) => {
                  const player =
                    row.playerId !== null ? getPlayer(row.playerId) : null;
                  return (
                    <motion.div
                      key={row.label}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15 + i * 0.06 }}
                      className="rounded-xl p-3"
                      style={{
                        background: "rgba(15,34,51,0.7)",
                        border: "1px solid rgba(30,58,74,0.5)",
                      }}
                      data-ocid={`leaderboard.my_team.stat.${i + 1}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs" style={{ color: "#A7B3C2" }}>
                          {row.emoji} {row.label}
                        </span>
                        <span
                          className="text-xs font-black"
                          style={{ color: "#FF9A3D" }}
                        >
                          {row.value}
                        </span>
                      </div>
                      {player ? (
                        <div
                          className="text-sm font-semibold truncate"
                          style={{ color: "#E9EEF5" }}
                        >
                          {player.name}
                          <span
                            className="text-xs ml-1.5"
                            style={{ color: "#6B7A8F" }}
                          >
                            {player.role}
                          </span>
                        </div>
                      ) : (
                        <div className="text-xs" style={{ color: "#4A5568" }}>
                          No data yet
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>

              {/* Team record */}
              {userTeam && (
                <div
                  className="mt-4 pt-4 grid grid-cols-3 gap-2 text-center"
                  style={{ borderTop: "1px solid rgba(53,224,111,0.15)" }}
                >
                  <div>
                    <div
                      className="text-lg font-black"
                      style={{ color: "#35E06F" }}
                    >
                      {userTeam.wins}
                    </div>
                    <div className="text-xs" style={{ color: "#A7B3C2" }}>
                      Wins
                    </div>
                  </div>
                  <div>
                    <div
                      className="text-lg font-black"
                      style={{ color: "#E53935" }}
                    >
                      {userTeam.losses}
                    </div>
                    <div className="text-xs" style={{ color: "#A7B3C2" }}>
                      Losses
                    </div>
                  </div>
                  <div>
                    <div
                      className="text-lg font-black"
                      style={{ color: "#FF9A3D" }}
                    >
                      {userTeam.points}
                    </div>
                    <div className="text-xs" style={{ color: "#A7B3C2" }}>
                      Points
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
                  <th className="text-right pb-2">Pts</th>
                </tr>
              </thead>
              <tbody>
                {[...gameState.teams]
                  .sort((a, b) => b.points - a.points)
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
