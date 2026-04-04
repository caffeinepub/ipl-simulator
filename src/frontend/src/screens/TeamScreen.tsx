import { Check, Star, Users, X } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";
import { PLAYERS, getPlayer } from "../data/players";
import { useActor } from "../hooks/useActor";
import type { GameState } from "../types/game";

interface Props {
  gameState: GameState;
  updateGameState: (updater: (prev: GameState) => GameState) => void;
  onNavigate: (phase: GameState["phase"]) => void;
}

const ROLE_COLORS: Record<string, string> = {
  Batsman: "#35E06F",
  Bowler: "#22B8C7",
  AllRounder: "#FF9A3D",
  WicketKeeper: "#FF7A2F",
};

export default function TeamScreen({
  gameState,
  updateGameState,
  onNavigate,
}: Props) {
  const { actor } = useActor();
  const userTeam = gameState.teams.find((t) => t.isUserTeam)!;
  const squad = userTeam.squad.map((id) => getPlayer(id)!).filter(Boolean);
  const [playingXI, setPlayingXI] = useState<number[]>(
    userTeam.playingXI.length === 11
      ? [...userTeam.playingXI]
      : squad.slice(0, 11).map((p) => p.id),
  );
  const [impactPlayer, setImpactPlayer] = useState<number | undefined>(
    userTeam.impactPlayerId,
  );

  const togglePlayer = (playerId: number) => {
    setPlayingXI((prev) => {
      if (prev.includes(playerId)) {
        if (impactPlayer === playerId) setImpactPlayer(undefined);
        return prev.filter((id) => id !== playerId);
      }
      if (prev.length >= 11) {
        toast.error("Playing XI is full! Remove a player first.");
        return prev;
      }
      return [...prev, playerId];
    });
  };

  const toggleImpact = (playerId: number) => {
    if (!playingXI.includes(playerId)) {
      toast.error("Impact player must be in the Playing XI");
      return;
    }
    setImpactPlayer((prev) => (prev === playerId ? undefined : playerId));
  };

  const validateAndSave = () => {
    const selectedPlayers = playingXI
      .map((id) => getPlayer(id)!)
      .filter(Boolean);
    const wks = selectedPlayers.filter((p) => p.role === "WicketKeeper");
    const batsmen = selectedPlayers.filter(
      (p) => p.role === "Batsman" || p.role === "WicketKeeper",
    );
    const bowlers = selectedPlayers.filter(
      (p) => p.role === "Bowler" || p.role === "AllRounder",
    );

    if (playingXI.length < 11) {
      toast.error(`Select ${11 - playingXI.length} more players`);
      return;
    }
    if (wks.length < 1) {
      toast.error("Need at least 1 Wicket Keeper");
      return;
    }
    if (batsmen.length < 3) {
      toast.error("Need at least 3 batsmen");
      return;
    }
    if (bowlers.length < 3) {
      toast.error("Need at least 3 bowlers/all-rounders");
      return;
    }

    updateGameState((prev) => ({
      ...prev,
      teams: prev.teams.map((t) =>
        t.isUserTeam ? { ...t, playingXI, impactPlayerId: impactPlayer } : t,
      ),
    }));

    // Sync to backend
    if (actor) {
      actor.setPlayingXI(BigInt(0), playingXI.map(BigInt)).catch(() => {});
      if (impactPlayer)
        actor.setImpactPlayer(BigInt(0), BigInt(impactPlayer)).catch(() => {});
    }

    toast.success("Team saved!");
    onNavigate("tournament");
  };

  const getRoleCount = (role: string) =>
    playingXI.filter((id) => {
      const p = getPlayer(id);
      return p?.role === role;
    }).length;

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
            <span className="text-gradient-orange">TEAM MANAGEMENT</span>
          </h1>
          <p className="text-sm" style={{ color: "#A7B3C2" }}>
            {userTeam.name} • Squad: {squad.length} players • Budget Used: ₹
            {(100 - userTeam.budget).toFixed(2)} Cr
          </p>
        </div>

        {/* Validation bar */}
        <div
          className="panel-glass rounded-xl p-4 mb-6 grid grid-cols-2 md:grid-cols-4 gap-3"
          data-ocid="team.validation.panel"
        >
          {[
            {
              label: "WK",
              count: getRoleCount("WicketKeeper"),
              min: 1,
              color: "#FF7A2F",
            },
            {
              label: "Batsmen",
              count: getRoleCount("Batsman"),
              min: 3,
              color: "#35E06F",
            },
            {
              label: "All-Rounders",
              count: getRoleCount("AllRounder"),
              min: 1,
              color: "#FF9A3D",
            },
            {
              label: "Bowlers",
              count: getRoleCount("Bowler"),
              min: 3,
              color: "#22B8C7",
            },
          ].map((item) => (
            <div key={item.label} className="text-center">
              <div className="text-xs mb-1" style={{ color: "#A7B3C2" }}>
                {item.label}
              </div>
              <div
                className="text-xl font-black"
                style={{
                  color: item.count >= item.min ? item.color : "#E53935",
                  fontFamily: "'BricolageGrotesque', sans-serif",
                }}
              >
                {item.count}
              </div>
              <div className="text-xs" style={{ color: "#A7B3C2" }}>
                min {item.min}
              </div>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Squad */}
          <div className="panel-glow rounded-2xl p-5">
            <h2
              className="text-sm font-bold uppercase tracking-widest mb-4"
              style={{
                color: "#E9EEF5",
                fontFamily: "'BricolageGrotesque', sans-serif",
              }}
            >
              Your Squad ({squad.length})
            </h2>
            <div
              className="space-y-2 overflow-y-auto max-h-96 pr-1 scrollbar-dark"
              data-ocid="team.squad.list"
            >
              {squad.length === 0 ? (
                <div
                  className="text-center py-8"
                  style={{ color: "#A7B3C2" }}
                  data-ocid="team.squad.empty_state"
                >
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No players in squad. Complete the auction first!</p>
                  <button
                    type="button"
                    onClick={() => onNavigate("auction")}
                    className="mt-3 text-sm"
                    style={{ color: "#FF7A2F" }}
                  >
                    Go to Auction →
                  </button>
                </div>
              ) : (
                squad.map((player, i) => (
                  <motion.div
                    key={player.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.02 }}
                    onClick={() => togglePlayer(player.id)}
                    data-ocid={`team.squad.item.${i + 1}`}
                    className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all"
                    style={{
                      background: playingXI.includes(player.id)
                        ? "rgba(53,224,111,0.08)"
                        : "rgba(15,34,51,0.6)",
                      border: `1px solid ${playingXI.includes(player.id) ? "rgba(53,224,111,0.3)" : "rgba(30,58,74,0.4)"}`,
                    }}
                  >
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                      style={{
                        background: `${ROLE_COLORS[player.role]}22`,
                        color: ROLE_COLORS[player.role],
                      }}
                    >
                      {player.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div
                        className="text-sm font-semibold truncate"
                        style={{ color: "#E9EEF5" }}
                      >
                        {player.name}
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className="text-xs"
                          style={{ color: ROLE_COLORS[player.role] }}
                        >
                          {player.role}
                        </span>
                        <span className="text-xs" style={{ color: "#A7B3C2" }}>
                          {player.country}
                        </span>
                        {!player.isCapped && (
                          <span
                            className="text-xs px-1 rounded"
                            style={{
                              background: "rgba(34,184,199,0.1)",
                              color: "#22B8C7",
                            }}
                          >
                            UC
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {playingXI.includes(player.id) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleImpact(player.id);
                          }}
                          data-ocid={`team.impact.toggle.${i + 1}`}
                          className="text-xs px-2 py-0.5 rounded font-bold transition-all"
                          style={{
                            background:
                              impactPlayer === player.id
                                ? "rgba(255,154,61,0.3)"
                                : "rgba(30,58,74,0.5)",
                            color:
                              impactPlayer === player.id
                                ? "#FF9A3D"
                                : "#A7B3C2",
                            border:
                              impactPlayer === player.id
                                ? "1px solid #FF9A3D"
                                : "1px solid transparent",
                          }}
                          title="Set as Impact Player"
                        >
                          ⚡
                        </button>
                      )}
                      <div
                        className="w-6 h-6 rounded flex items-center justify-center"
                        style={{
                          background: playingXI.includes(player.id)
                            ? "rgba(53,224,111,0.2)"
                            : "rgba(30,58,74,0.5)",
                        }}
                      >
                        {playingXI.includes(player.id) ? (
                          <Check
                            className="w-3 h-3"
                            style={{ color: "#35E06F" }}
                          />
                        ) : (
                          <span
                            className="text-xs"
                            style={{ color: "#A7B3C2" }}
                          >
                            +
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </div>

          {/* Playing XI */}
          <div className="panel-glow rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2
                className="text-sm font-bold uppercase tracking-widest"
                style={{
                  color: "#E9EEF5",
                  fontFamily: "'BricolageGrotesque', sans-serif",
                }}
              >
                Playing XI ({playingXI.length}/11)
              </h2>
              {impactPlayer && (
                <span
                  className="text-xs px-2 py-0.5 rounded font-bold"
                  style={{
                    background: "rgba(255,154,61,0.2)",
                    color: "#FF9A3D",
                  }}
                >
                  ⚡ Impact Player Set
                </span>
              )}
            </div>

            <div
              className="space-y-2 overflow-y-auto max-h-96 pr-1 scrollbar-dark"
              data-ocid="team.playing11.list"
            >
              {playingXI.length === 0 ? (
                <div
                  className="text-center py-8"
                  style={{ color: "#A7B3C2" }}
                  data-ocid="team.playing11.empty_state"
                >
                  <p>Click players from your squad to add them</p>
                </div>
              ) : (
                playingXI.map((id, i) => {
                  const player = getPlayer(id);
                  if (!player) return null;
                  return (
                    <motion.div
                      key={id}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                      data-ocid={`team.xi.item.${i + 1}`}
                      className="flex items-center gap-3 p-3 rounded-xl"
                      style={{
                        background: "rgba(15,34,51,0.7)",
                        border: "1px solid rgba(30,58,74,0.5)",
                      }}
                    >
                      <span
                        className="text-xs font-bold w-5 shrink-0"
                        style={{ color: "#A7B3C2" }}
                      >
                        #{i + 1}
                      </span>
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                        style={{
                          background: `${ROLE_COLORS[player.role]}22`,
                          color: ROLE_COLORS[player.role],
                        }}
                      >
                        {player.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div
                          className="text-sm font-semibold truncate"
                          style={{ color: "#E9EEF5" }}
                        >
                          {player.name}
                        </div>
                        <div
                          className="text-xs"
                          style={{ color: ROLE_COLORS[player.role] }}
                        >
                          {player.role}
                        </div>
                      </div>
                      {impactPlayer === id && (
                        <span
                          className="text-xs px-1.5 py-0.5 rounded font-bold"
                          style={{
                            background: "rgba(255,154,61,0.2)",
                            color: "#FF9A3D",
                          }}
                        >
                          ⚡
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => togglePlayer(id)}
                        data-ocid={`team.remove.button.${i + 1}`}
                        className="p-1 rounded"
                        style={{ color: "#E53935" }}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </motion.div>
                  );
                })
              )}
            </div>

            <button
              type="button"
              onClick={validateAndSave}
              data-ocid="team.save.submit_button"
              disabled={playingXI.length !== 11}
              className="w-full mt-4 py-3 rounded-lg font-bold uppercase tracking-wider transition-all"
              style={{
                background:
                  playingXI.length === 11
                    ? "linear-gradient(135deg, #FF6A2A, #FF9A3D)"
                    : "rgba(30,58,74,0.5)",
                color: playingXI.length === 11 ? "#fff" : "#A7B3C2",
              }}
            >
              {playingXI.length === 11
                ? "CONFIRM & GO TO TOURNAMENT"
                : `Need ${11 - playingXI.length} more players`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
