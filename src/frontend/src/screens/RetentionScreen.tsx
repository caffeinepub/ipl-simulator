import { Badge } from "@/components/ui/badge";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";
import { PLAYERS, createAuctionQueue, getPlayer } from "../data/players";
import type { GameState, RetentionEntry, TeamData } from "../types/game";

interface Props {
  gameState: GameState;
  updateGameState: (updater: (prev: GameState) => GameState) => void;
  onNavigate: (phase: GameState["phase"]) => void;
}

// Retention cost rules (IPL-like)
const RETENTION_COSTS = [18, 14, 11, 18, 14]; // first 3 capped, then 2 uncapped

const ROLE_COLORS: Record<string, string> = {
  Batsman: "#35E06F",
  Bowler: "#22B8C7",
  AllRounder: "#FF9A3D",
  WicketKeeper: "#FF7A2F",
};

export default function RetentionScreen({
  gameState,
  updateGameState,
  onNavigate,
}: Props) {
  const userTeam = gameState.teams.find((t) => t.isUserTeam)!;
  const [retainedIds, setRetainedIds] = useState<number[]>(
    gameState.retainedPlayers.length > 0 ? gameState.retainedPlayers : [],
  );
  const [useRTM, setUseRTM] = useState<number[]>([]);

  const MAX_RETENTION = 5;
  const MAX_RTM = 3;

  const squadPlayers = userTeam.squad
    .map((id) => getPlayer(id))
    .filter(Boolean)
    .sort((a, b) => b!.battingAvg - a!.battingAvg) as NonNullable<
    ReturnType<typeof getPlayer>
  >[];

  const toggleRetain = (playerId: number) => {
    setRetainedIds((prev) => {
      if (prev.includes(playerId)) {
        return prev.filter((id) => id !== playerId);
      }
      if (prev.length >= MAX_RETENTION) {
        toast.error(`You can only retain up to ${MAX_RETENTION} players!`);
        return prev;
      }
      // Remove from RTM if added to retention
      setUseRTM((r) => r.filter((id) => id !== playerId));
      return [...prev, playerId];
    });
  };

  const toggleRTM = (playerId: number) => {
    if (retainedIds.includes(playerId)) {
      toast.error("Player is already retained. Remove from retention first.");
      return;
    }
    setUseRTM((prev) => {
      if (prev.includes(playerId)) {
        return prev.filter((id) => id !== playerId);
      }
      if (prev.length >= MAX_RTM) {
        toast.error(`You can only use ${MAX_RTM} RTM cards!`);
        return prev;
      }
      return [...prev, playerId];
    });
  };

  const totalRetentionCost = retainedIds.reduce((sum, _, i) => {
    return sum + (RETENTION_COSTS[i] ?? 5);
  }, 0);

  const remainingBudget = 100 - totalRetentionCost;

  const handleConfirm = () => {
    if (remainingBudget < 20) {
      toast.error(
        "Retention cost too high! You need at least 20 Cr for the auction.",
      );
      return;
    }

    const retentionEntries: RetentionEntry[] = [
      ...retainedIds.map((playerId, i) => ({
        playerId,
        teamId: userTeam.id,
        retentionCost: RETENTION_COSTS[i] ?? 5,
        isRTM: false,
      })),
      ...useRTM.map((playerId) => ({
        playerId,
        teamId: userTeam.id,
        retentionCost: 10, // RTM base cost
        isRTM: true,
      })),
    ];

    const retainedCost = retentionEntries.reduce(
      (s, e) => s + e.retentionCost,
      0,
    );

    updateGameState((prev) => {
      // Reset teams for new season but keep retained players
      const allRetainedIds = [...retainedIds, ...useRTM];

      const newTeams: TeamData[] = prev.teams.map((t) => ({
        ...t,
        squad: t.isUserTeam ? allRetainedIds : [],
        playingXI: [],
        wins: 0,
        losses: 0,
        points: 0,
        nrr: 0,
        matchesPlayed: 0,
        budget: t.isUserTeam ? 100 - retainedCost : 100,
      }));

      return {
        ...prev,
        season: prev.season + 1,
        phase: "auction" as const,
        teams: newTeams,
        auctionQueue: createAuctionQueue(),
        auctionIndex: 0,
        auctionComplete: false,
        currentAuctionPlayer: undefined,
        currentMatch: undefined,
        tournamentMatches: [],
        tournamentPhase: "group" as const,
        playerStats: [],
        retainedPlayers: allRetainedIds,
        retentionEntries,
        trophy: undefined,
      };
    });

    toast.success(
      `Season ${gameState.season + 1} auction begins! Budget: ${100 - retainedCost} Cr`,
    );
    onNavigate("auction");
  };

  const skipToAuction = () => {
    updateGameState((prev) => ({
      ...prev,
      season: prev.season + 1,
      phase: "auction" as const,
      teams: prev.teams.map((t) => ({
        ...t,
        squad: [],
        playingXI: [],
        wins: 0,
        losses: 0,
        points: 0,
        nrr: 0,
        matchesPlayed: 0,
        budget: 100,
      })),
      auctionQueue: createAuctionQueue(),
      auctionIndex: 0,
      auctionComplete: false,
      currentAuctionPlayer: undefined,
      currentMatch: undefined,
      tournamentMatches: [],
      tournamentPhase: "group" as const,
      playerStats: [],
      retainedPlayers: [],
      retentionEntries: [],
      trophy: undefined,
    }));
    onNavigate("auction");
  };

  // Stats for squad players
  const getPlayerStats = (playerId: number) => {
    return gameState.playerStats.find((s) => s.playerId === playerId);
  };

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: "#070B14" }}>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-4 border"
            style={{
              borderColor: "rgba(255,154,61,0.4)",
              background: "rgba(255,154,61,0.08)",
            }}
          >
            <span
              className="text-xs font-bold tracking-widest uppercase"
              style={{ color: "#FF9A3D" }}
            >
              IPL 2026 • Season {gameState.season + 1}
            </span>
          </div>
          <h1
            className="text-4xl md:text-5xl font-black uppercase tracking-tight mb-3"
            style={{
              fontFamily: "'BricolageGrotesque', sans-serif",
              color: "#E9EEF5",
            }}
          >
            PLAYER{" "}
            <span
              style={{
                background: "linear-gradient(90deg, #FF6A2A, #FF9A3D)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              RETENTION
            </span>
          </h1>
          <p className="text-sm" style={{ color: "#A7B3C2" }}>
            Choose up to 5 players to retain before the Season{" "}
            {gameState.season + 1} auction. Retained players cost from your
            auction budget.
          </p>
        </motion.div>

        {/* Budget Bar */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="panel-glow rounded-2xl p-5 mb-6"
          data-ocid="retention.budget.panel"
        >
          <div className="flex items-center justify-between mb-3">
            <span
              className="text-sm font-bold uppercase tracking-widest"
              style={{ color: "#A7B3C2" }}
            >
              Auction Budget After Retention
            </span>
            <span
              className="text-2xl font-black"
              style={{
                color:
                  remainingBudget >= 40
                    ? "#35E06F"
                    : remainingBudget >= 20
                      ? "#FF9A3D"
                      : "#E53935",
              }}
            >
              ₹{remainingBudget} Cr
            </span>
          </div>
          <div
            className="w-full rounded-full h-3"
            style={{ background: "rgba(15,34,51,0.8)" }}
          >
            <div
              className="h-3 rounded-full transition-all duration-500"
              style={{
                width: `${Math.max(0, (remainingBudget / 100) * 100)}%`,
                background:
                  remainingBudget >= 40
                    ? "linear-gradient(90deg, #35E06F, #22B8C7)"
                    : remainingBudget >= 20
                      ? "linear-gradient(90deg, #FF9A3D, #FF6A2A)"
                      : "linear-gradient(90deg, #E53935, #FF6A2A)",
              }}
            />
          </div>
          <div
            className="flex items-center justify-between mt-2 text-xs"
            style={{ color: "#A7B3C2" }}
          >
            <span>Retention cost: ₹{totalRetentionCost} Cr</span>
            <span>
              {retainedIds.length}/{MAX_RETENTION} retained · {useRTM.length}/
              {MAX_RTM} RTM
            </span>
          </div>

          {/* Retention cost breakdown */}
          {retainedIds.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {retainedIds.map((id, i) => {
                const p = getPlayer(id);
                return (
                  <div
                    key={id}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs"
                    style={{
                      background: "rgba(255,154,61,0.15)",
                      border: "1px solid rgba(255,154,61,0.3)",
                    }}
                  >
                    <span style={{ color: "#FF9A3D" }}>
                      {p?.name?.split(" ").pop()}
                    </span>
                    <span style={{ color: "#6B7A8F" }}>
                      ₹{RETENTION_COSTS[i] ?? 5} Cr
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleRetain(id)}
                      className="text-xs"
                      style={{ color: "#E53935" }}
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>

        {/* RTM Rules Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="panel-glow rounded-2xl p-4 mb-6"
          style={{ borderColor: "rgba(34,184,199,0.2)" }}
        >
          <h2
            className="text-xs font-bold uppercase tracking-widest mb-2"
            style={{ color: "#22B8C7" }}
          >
            📋 Retention & RTM Rules
          </h2>
          <div
            className="grid sm:grid-cols-2 gap-3 text-xs"
            style={{ color: "#A7B3C2" }}
          >
            <div>
              <strong style={{ color: "#FF9A3D" }}>Retention:</strong>
              <ul className="mt-1 space-y-0.5">
                <li>Slot 1: ₹18 Cr | Slot 2: ₹14 Cr</li>
                <li>Slot 3: ₹11 Cr | Slot 4: ₹18 Cr</li>
                <li>Slot 5: ₹14 Cr (max 5 players)</li>
              </ul>
            </div>
            <div>
              <strong style={{ color: "#22B8C7" }}>
                RTM (Right to Match):
              </strong>
              <ul className="mt-1 space-y-0.5">
                <li>Use to match any bid during auction</li>
                <li>Up to 3 RTM cards per team</li>
                <li>Cost: ₹10 Cr per RTM used</li>
              </ul>
            </div>
          </div>
        </motion.div>

        {/* Player Grid */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="panel-glow rounded-2xl p-5 mb-6"
          data-ocid="retention.players.panel"
        >
          <h2
            className="text-sm font-bold uppercase tracking-widest mb-4"
            style={{
              color: "#E9EEF5",
              fontFamily: "'BricolageGrotesque', sans-serif",
            }}
          >
            {userTeam.name} Squad — Select Players to Retain
          </h2>
          <div className="grid gap-2">
            <AnimatePresence>
              {squadPlayers.map((player, i) => {
                const isRetained = retainedIds.includes(player.id);
                const isRTM = useRTM.includes(player.id);
                const stats = getPlayerStats(player.id);
                const retentionSlot = retainedIds.indexOf(player.id);

                return (
                  <motion.div
                    key={player.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.02 }}
                    className="flex items-center gap-3 p-3 rounded-xl transition-all"
                    style={{
                      background: isRetained
                        ? "rgba(255,154,61,0.1)"
                        : isRTM
                          ? "rgba(34,184,199,0.1)"
                          : "rgba(15,34,51,0.6)",
                      border: isRetained
                        ? "1px solid rgba(255,154,61,0.4)"
                        : isRTM
                          ? "1px solid rgba(34,184,199,0.4)"
                          : "1px solid rgba(30,58,74,0.4)",
                    }}
                    data-ocid={`retention.player.item.${i + 1}`}
                  >
                    {/* Jersey number */}
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-xs font-black shrink-0"
                      style={{
                        background: ROLE_COLORS[player.role],
                        color: "#fff",
                      }}
                    >
                      {player.jerseyNumber}
                    </div>

                    {/* Player info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="text-sm font-bold"
                          style={{ color: "#E9EEF5" }}
                        >
                          {player.name}
                        </span>
                        {player.isCapped && (
                          <Badge
                            className="text-xs px-1.5"
                            style={{
                              background: "rgba(255,154,61,0.15)",
                              color: "#FF9A3D",
                              border: "1px solid rgba(255,154,61,0.3)",
                            }}
                          >
                            CAPPED
                          </Badge>
                        )}
                        {isRetained && (
                          <Badge
                            className="text-xs px-1.5"
                            style={{
                              background: "rgba(255,154,61,0.2)",
                              color: "#FF9A3D",
                              border: "1px solid rgba(255,154,61,0.4)",
                            }}
                          >
                            RETAINED (Slot {retentionSlot + 1}) · ₹
                            {RETENTION_COSTS[retentionSlot] ?? 5} Cr
                          </Badge>
                        )}
                        {isRTM && (
                          <Badge
                            className="text-xs px-1.5"
                            style={{
                              background: "rgba(34,184,199,0.2)",
                              color: "#22B8C7",
                              border: "1px solid rgba(34,184,199,0.4)",
                            }}
                          >
                            RTM CARD · ₹10 Cr
                          </Badge>
                        )}
                      </div>
                      <div
                        className="flex gap-3 mt-0.5 text-xs"
                        style={{ color: "#A7B3C2" }}
                      >
                        <span style={{ color: ROLE_COLORS[player.role] }}>
                          {player.role}
                        </span>
                        <span>{player.country}</span>
                        {stats && stats.runs > 0 && (
                          <span>Runs: {stats.runs}</span>
                        )}
                        {stats && stats.wickets > 0 && (
                          <span>Wkts: {stats.wickets}</span>
                        )}
                        {!stats && <span>Base: ₹{player.basePrice} Cr</span>}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => toggleRetain(player.id)}
                        data-ocid={`retention.retain.button.${i + 1}`}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all"
                        style={{
                          background: isRetained
                            ? "rgba(229,57,53,0.2)"
                            : "rgba(255,154,61,0.2)",
                          color: isRetained ? "#E53935" : "#FF9A3D",
                          border: isRetained
                            ? "1px solid rgba(229,57,53,0.4)"
                            : "1px solid rgba(255,154,61,0.4)",
                        }}
                      >
                        {isRetained ? "RELEASE" : "RETAIN"}
                      </button>
                      {!isRetained && (
                        <button
                          type="button"
                          onClick={() => toggleRTM(player.id)}
                          data-ocid={`retention.rtm.button.${i + 1}`}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all"
                          style={{
                            background: isRTM
                              ? "rgba(229,57,53,0.2)"
                              : "rgba(34,184,199,0.1)",
                            color: isRTM ? "#E53935" : "#22B8C7",
                            border: isRTM
                              ? "1px solid rgba(229,57,53,0.4)"
                              : "1px solid rgba(34,184,199,0.3)",
                          }}
                        >
                          {isRTM ? "CANCEL RTM" : "USE RTM"}
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Action Buttons */}
        <div className="flex gap-4 justify-center flex-wrap">
          <button
            type="button"
            onClick={handleConfirm}
            data-ocid="retention.confirm.primary_button"
            className="px-8 py-3 rounded-lg font-bold uppercase tracking-wider transition-all"
            style={{
              background: "linear-gradient(135deg, #FF6A2A, #FF9A3D)",
              color: "#fff",
              boxShadow: "0 4px 20px rgba(255,106,42,0.35)",
            }}
          >
            ✅ Confirm & Start Season {gameState.season + 1} Auction
          </button>
          <button
            type="button"
            onClick={skipToAuction}
            data-ocid="retention.skip.secondary_button"
            className="px-8 py-3 rounded-lg font-bold uppercase tracking-wider border transition-all"
            style={{
              borderColor: "rgba(167,179,194,0.3)",
              color: "#A7B3C2",
            }}
          >
            Skip — Full Fresh Auction
          </button>
        </div>

        <p className="text-center text-xs mt-4" style={{ color: "#6B7A8F" }}>
          All teams start with ₹100 Cr budget. Your retained players will be in
          your squad automatically.
        </p>
      </div>
    </div>
  );
}
