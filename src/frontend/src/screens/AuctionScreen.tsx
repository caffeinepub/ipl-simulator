import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Gavel, Timer, Trophy } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PLAYERS, getPlayer } from "../data/players";
import { aiBid } from "../engine/gameEngine";
import { useActor } from "../hooks/useActor";
import type { AuctionPlayerState, GameState } from "../types/game";

interface Props {
  gameState: GameState;
  updateGameState: (updater: (prev: GameState) => GameState) => void;
  onNavigate: (phase: GameState["phase"]) => void;
}

const TIMER_SECONDS = 15;
const BID_INCREMENTS = [0.25, 0.5, 1, 2];

export default function AuctionScreen({
  gameState,
  updateGameState,
  onNavigate,
}: Props) {
  const { actor } = useActor();
  const [bidFeed, setBidFeed] = useState<{ text: string; color: string }[]>([]);
  const [customBid, setCustomBid] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const aiBidTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const userTeam = gameState.teams.find((t) => t.isUserTeam)!;
  const currentPlayer = gameState.currentAuctionPlayer
    ? getPlayer(gameState.currentAuctionPlayer.playerId)
    : null;

  const addToBidFeed = useCallback((text: string, color = "#A7B3C2") => {
    setBidFeed((prev) => [{ text, color }, ...prev].slice(0, 5));
  }, []);

  const advanceToNextPlayer = useCallback(() => {
    updateGameState((prev) => {
      const nextIndex = prev.auctionIndex + 1;
      if (
        nextIndex >= prev.auctionQueue.length ||
        prev.teams.every((t) => t.squad.length >= 15)
      ) {
        // Auction complete
        const updatedTeams = prev.teams.map((t) => ({
          ...t,
          playingXI: t.isUserTeam
            ? t.playingXI
            : t.squad.length >= 11
              ? t.playingXI.length > 0
                ? t.playingXI
                : t.squad.slice(0, 11)
              : t.squad.slice(0, Math.min(11, t.squad.length)),
        }));
        toast.success("Auction Complete! Set up your Playing XI.");
        return {
          ...prev,
          auctionComplete: true,
          auctionIndex: nextIndex,
          currentAuctionPlayer: undefined,
          teams: updatedTeams,
          phase: "team",
        };
      }

      const playerId = prev.auctionQueue[nextIndex];
      const player = getPlayer(playerId);
      if (!player) return { ...prev, auctionIndex: nextIndex };

      const newAuctionPlayer: AuctionPlayerState = {
        playerId,
        currentBid: player.basePrice,
        currentBidderTeamId: undefined,
        timerSeconds: TIMER_SECONDS,
        bids: [],
        status: "active",
      };
      return {
        ...prev,
        auctionIndex: nextIndex,
        currentAuctionPlayer: newAuctionPlayer,
      };
    });
  }, [updateGameState]);

  const sellCurrentPlayer = useCallback(() => {
    updateGameState((prev) => {
      if (!prev.currentAuctionPlayer) return prev;
      const { playerId, currentBid, currentBidderTeamId } =
        prev.currentAuctionPlayer;

      // FIX: use explicit undefined check -- team id 0 is falsy but valid
      if (currentBidderTeamId === undefined) {
        addToBidFeed("Player UNSOLD - back to pool", "#E53935");
        return {
          ...prev,
          currentAuctionPlayer: {
            ...prev.currentAuctionPlayer,
            status: "unsold",
          },
        };
      }

      const updatedTeams = prev.teams.map((t) => {
        if (t.id === currentBidderTeamId) {
          return {
            ...t,
            budget: Math.round((t.budget - currentBid) * 100) / 100,
            squad: [...t.squad, playerId],
          };
        }
        return t;
      });

      const buyer = prev.teams.find((t) => t.id === currentBidderTeamId);
      const player = getPlayer(playerId);
      const isUserBuyer = buyer?.isUserTeam;
      addToBidFeed(
        `🔨 ${player?.name} sold to ${buyer?.name} for ${currentBid} Cr!`,
        isUserBuyer ? "#35E06F" : "#FF9A3D",
      );
      if (isUserBuyer) {
        toast.success(
          `🎉 ${player?.name} joins your team for ₹${currentBid} Cr!`,
        );
      } else {
        toast.info(
          `${player?.name} sold to ${buyer?.name} for ₹${currentBid} Cr`,
        );
      }

      // Try to sync with backend
      if (actor && isUserBuyer) {
        actor
          .placeBid(BigInt(0), BigInt(Math.round(currentBid)))
          .catch(() => {});
      }

      return {
        ...prev,
        teams: updatedTeams,
        currentAuctionPlayer: { ...prev.currentAuctionPlayer, status: "sold" },
      };
    });
  }, [updateGameState, addToBidFeed, actor]);

  // Start auction
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    if (gameState.auctionComplete || gameState.phase !== "auction") return;

    if (
      !gameState.currentAuctionPlayer ||
      gameState.currentAuctionPlayer.status !== "active"
    ) {
      const playerId = gameState.auctionQueue[gameState.auctionIndex];
      const player = getPlayer(playerId);
      if (player) {
        updateGameState((prev) => ({
          ...prev,
          currentAuctionPlayer: {
            playerId,
            currentBid: player.basePrice,
            currentBidderTeamId: undefined,
            timerSeconds: TIMER_SECONDS,
            bids: [],
            status: "active",
          },
        }));
        if (actor) actor.startAuction().catch(() => {});
      }
    }
  }, [gameState.phase]);

  // Timer
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    if (
      !gameState.currentAuctionPlayer ||
      gameState.currentAuctionPlayer.status !== "active" ||
      gameState.auctionComplete
    )
      return;

    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      updateGameState((prev) => {
        if (
          !prev.currentAuctionPlayer ||
          prev.currentAuctionPlayer.status !== "active"
        )
          return prev;
        const newTimer = prev.currentAuctionPlayer.timerSeconds - 1;
        if (newTimer <= 0) {
          return {
            ...prev,
            currentAuctionPlayer: {
              ...prev.currentAuctionPlayer,
              timerSeconds: 0,
            },
          };
        }
        return {
          ...prev,
          currentAuctionPlayer: {
            ...prev.currentAuctionPlayer,
            timerSeconds: newTimer,
          },
        };
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [
    gameState.currentAuctionPlayer?.playerId,
    gameState.currentAuctionPlayer?.status,
  ]);

  // When timer hits 0, sell and advance
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    if (
      gameState.currentAuctionPlayer?.timerSeconds === 0 &&
      gameState.currentAuctionPlayer?.status === "active"
    ) {
      if (timerRef.current) clearInterval(timerRef.current);
      sellCurrentPlayer();
      setTimeout(advanceToNextPlayer, 1500);
    }
  }, [gameState.currentAuctionPlayer?.timerSeconds]);

  // AI bidding logic
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    if (
      !gameState.currentAuctionPlayer ||
      gameState.currentAuctionPlayer.status !== "active"
    )
      return;
    if (gameState.currentAuctionPlayer.timerSeconds <= 0) return;

    if (aiBidTimerRef.current) clearTimeout(aiBidTimerRef.current);

    aiBidTimerRef.current = setTimeout(
      () => {
        updateGameState((prev) => {
          if (
            !prev.currentAuctionPlayer ||
            prev.currentAuctionPlayer.status !== "active"
          )
            return prev;

          const player = getPlayer(prev.currentAuctionPlayer.playerId);
          if (!player) return prev;

          const aiTeams = prev.teams.filter(
            (t) => !t.isUserTeam && t.squad.length < 15,
          );
          let highestBid = prev.currentAuctionPlayer.currentBid;
          let highestBidderTeamId =
            prev.currentAuctionPlayer.currentBidderTeamId;
          let newBids = [...prev.currentAuctionPlayer.bids];

          for (const team of aiTeams) {
            const bid = aiBid(player, team, highestBid, prev.teams);
            if (bid !== null && bid > highestBid) {
              highestBid = bid;
              highestBidderTeamId = team.id;
              newBids = [
                ...newBids,
                { teamId: team.id, amount: bid, timestamp: Date.now() },
              ];
            }
          }

          if (
            highestBidderTeamId !==
            prev.currentAuctionPlayer.currentBidderTeamId
          ) {
            return {
              ...prev,
              currentAuctionPlayer: {
                ...prev.currentAuctionPlayer,
                currentBid: highestBid,
                currentBidderTeamId: highestBidderTeamId,
                timerSeconds: TIMER_SECONDS,
                bids: newBids,
              },
            };
          }
          return prev;
        });
      },
      1500 + Math.random() * 1000,
    );

    return () => {
      if (aiBidTimerRef.current) clearTimeout(aiBidTimerRef.current);
    };
  }, [
    gameState.currentAuctionPlayer?.currentBid,
    gameState.currentAuctionPlayer?.playerId,
  ]);

  const handleUserBid = (increment: number) => {
    if (
      !gameState.currentAuctionPlayer ||
      gameState.currentAuctionPlayer.status !== "active"
    )
      return;
    if (isProcessing) return;

    const newBid =
      Math.round(
        (gameState.currentAuctionPlayer.currentBid + increment) * 100,
      ) / 100;
    if (newBid > userTeam.budget) {
      toast.error("Insufficient budget!");
      return;
    }

    setIsProcessing(true);
    updateGameState((prev) => {
      if (!prev.currentAuctionPlayer) return prev;
      const bid =
        Math.round((prev.currentAuctionPlayer.currentBid + increment) * 100) /
        100;
      return {
        ...prev,
        currentAuctionPlayer: {
          ...prev.currentAuctionPlayer,
          currentBid: bid,
          currentBidderTeamId: userTeam.id, // use actual user team id
          timerSeconds: TIMER_SECONDS,
          bids: [
            ...prev.currentAuctionPlayer.bids,
            { teamId: userTeam.id, amount: bid, timestamp: Date.now() },
          ],
        },
      };
    });
    addToBidFeed(`✨ You bid ₹${newBid} Cr`, "#35E06F");
    setTimeout(() => setIsProcessing(false), 500);
  };

  const handleCustomBid = () => {
    const amount = Number.parseFloat(customBid);
    if (Number.isNaN(amount) || amount <= 0) {
      toast.error("Invalid bid amount");
      return;
    }
    const current = gameState.currentAuctionPlayer?.currentBid ?? 0;
    if (amount <= current) {
      toast.error("Bid must be higher than current bid");
      return;
    }
    if (amount > userTeam.budget) {
      toast.error("Insufficient budget!");
      return;
    }
    handleUserBid(amount - current);
    setCustomBid("");
  };

  const handlePass = () => {
    addToBidFeed(`You passed on ${currentPlayer?.name}`, "#A7B3C2");
    sellCurrentPlayer();
    setTimeout(advanceToNextPlayer, 1200);
  };

  const roleColor = (role: string) => {
    if (role === "Batsman") return "#35E06F";
    if (role === "Bowler") return "#22B8C7";
    if (role === "AllRounder") return "#FF9A3D";
    return "#FF7A2F";
  };

  if (gameState.auctionComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="panel-glass rounded-2xl p-8 text-center max-w-md">
          <Trophy
            className="w-12 h-12 mx-auto mb-4"
            style={{ color: "#FF9A3D" }}
          />
          <h2
            className="text-2xl font-black uppercase mb-2"
            style={{
              color: "#E9EEF5",
              fontFamily: "'BricolageGrotesque', sans-serif",
            }}
          >
            Auction Complete!
          </h2>
          <p className="mb-2" style={{ color: "#A7B3C2" }}>
            All players have been sold. Time to set your Playing XI!
          </p>
          <p className="text-sm mb-6" style={{ color: "#35E06F" }}>
            Your squad: {userTeam.squad.length} players • ₹
            {userTeam.budget.toFixed(2)} Cr remaining
          </p>
          <button
            type="button"
            onClick={() => onNavigate("team")}
            className="px-8 py-3 rounded-lg font-bold uppercase tracking-wider"
            style={{
              background: "linear-gradient(135deg, #FF6A2A, #FF9A3D)",
              color: "#fff",
            }}
            data-ocid="auction.team_setup.button"
          >
            Set Up Team
          </button>
        </div>
      </div>
    );
  }

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
            <span className="text-gradient-orange">LIVE AUCTION</span>
          </h1>
          <p className="text-sm" style={{ color: "#A7B3C2" }}>
            Player {gameState.auctionIndex + 1} of{" "}
            {gameState.auctionQueue.length} • Bidding as:{" "}
            <span style={{ color: "#35E06F" }}>{userTeam.name}</span> • Budget:{" "}
            <span style={{ color: "#35E06F" }}>
              ₹{userTeam.budget.toFixed(2)} Cr
            </span>
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Current Player Card */}
          <div className="lg:col-span-1">
            {currentPlayer && gameState.currentAuctionPlayer ? (
              <motion.div
                key={currentPlayer.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="panel-glow rounded-2xl p-6 text-center"
                data-ocid="auction.player.card"
              >
                <div
                  className="w-24 h-24 rounded-full mx-auto mb-4 flex items-center justify-center text-2xl font-black"
                  style={{
                    background: `${roleColor(currentPlayer.role)}22`,
                    border: `3px solid ${roleColor(currentPlayer.role)}`,
                    color: roleColor(currentPlayer.role),
                  }}
                >
                  {currentPlayer.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </div>

                <h2
                  className="text-xl font-black mb-1"
                  style={{
                    color: "#E9EEF5",
                    fontFamily: "'BricolageGrotesque', sans-serif",
                  }}
                >
                  {currentPlayer.name}
                </h2>
                <div className="flex items-center justify-center gap-2 mb-3">
                  <span
                    className="text-xs px-2 py-0.5 rounded font-semibold"
                    style={{
                      background: `${roleColor(currentPlayer.role)}22`,
                      color: roleColor(currentPlayer.role),
                    }}
                  >
                    {currentPlayer.role}
                  </span>
                  <span
                    className="text-xs px-2 py-0.5 rounded font-semibold"
                    style={{
                      background: currentPlayer.isCapped
                        ? "rgba(255,154,61,0.2)"
                        : "rgba(34,184,199,0.2)",
                      color: currentPlayer.isCapped ? "#FF9A3D" : "#22B8C7",
                    }}
                  >
                    {currentPlayer.isCapped ? "CAPPED" : "UNCAPPED"}
                  </span>
                  <span className="text-xs" style={{ color: "#A7B3C2" }}>
                    {currentPlayer.country}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-4 text-xs">
                  <div
                    className="rounded-lg p-2"
                    style={{ background: "rgba(15,34,51,0.8)" }}
                  >
                    <div style={{ color: "#A7B3C2" }}>Batting Avg</div>
                    <div className="font-bold" style={{ color: "#35E06F" }}>
                      {currentPlayer.battingAvg}
                    </div>
                  </div>
                  <div
                    className="rounded-lg p-2"
                    style={{ background: "rgba(15,34,51,0.8)" }}
                  >
                    <div style={{ color: "#A7B3C2" }}>Strike Rate</div>
                    <div className="font-bold" style={{ color: "#35E06F" }}>
                      {currentPlayer.strikeRate}
                    </div>
                  </div>
                  {currentPlayer.role !== "Batsman" &&
                    currentPlayer.role !== "WicketKeeper" && (
                      <>
                        <div
                          className="rounded-lg p-2"
                          style={{ background: "rgba(15,34,51,0.8)" }}
                        >
                          <div style={{ color: "#A7B3C2" }}>Bowl Avg</div>
                          <div
                            className="font-bold"
                            style={{ color: "#22B8C7" }}
                          >
                            {currentPlayer.bowlingAvg === 99
                              ? "-"
                              : currentPlayer.bowlingAvg}
                          </div>
                        </div>
                        <div
                          className="rounded-lg p-2"
                          style={{ background: "rgba(15,34,51,0.8)" }}
                        >
                          <div style={{ color: "#A7B3C2" }}>Economy</div>
                          <div
                            className="font-bold"
                            style={{ color: "#22B8C7" }}
                          >
                            {currentPlayer.bowlingAvg === 99
                              ? "-"
                              : currentPlayer.economy}
                          </div>
                        </div>
                      </>
                    )}
                </div>

                <div className="text-sm mb-2" style={{ color: "#A7B3C2" }}>
                  Base Price
                </div>
                <div
                  className="text-2xl font-black"
                  style={{
                    color: "#FF9A3D",
                    fontFamily: "'BricolageGrotesque', sans-serif",
                  }}
                >
                  ₹{currentPlayer.basePrice} Cr
                </div>
              </motion.div>
            ) : (
              <div className="panel-glow rounded-2xl p-6 text-center animate-pulse">
                <div
                  className="w-24 h-24 rounded-full mx-auto mb-4"
                  style={{ background: "rgba(30,58,74,0.5)" }}
                />
                <div
                  className="h-6 rounded mb-2"
                  style={{ background: "rgba(30,58,74,0.5)" }}
                />
                <div
                  className="h-4 rounded"
                  style={{ background: "rgba(30,58,74,0.3)" }}
                />
              </div>
            )}
          </div>

          {/* Bidding Panel */}
          <div className="lg:col-span-1 space-y-4">
            {gameState.currentAuctionPlayer && (
              <div
                className="panel-glow rounded-2xl p-5"
                data-ocid="auction.bid.panel"
              >
                <div className="text-center mb-4">
                  <div
                    className="text-xs uppercase tracking-widest mb-1"
                    style={{ color: "#A7B3C2" }}
                  >
                    Current Bid
                  </div>
                  <div
                    className="text-4xl font-black"
                    style={{
                      color: "#FF9A3D",
                      fontFamily: "'BricolageGrotesque', sans-serif",
                    }}
                  >
                    ₹{gameState.currentAuctionPlayer.currentBid.toFixed(2)} Cr
                  </div>
                  {gameState.currentAuctionPlayer.currentBidderTeamId !==
                    undefined && (
                    <div
                      className="text-sm mt-1"
                      style={{
                        color:
                          gameState.currentAuctionPlayer.currentBidderTeamId ===
                          userTeam.id
                            ? "#35E06F"
                            : "#A7B3C2",
                      }}
                    >
                      {gameState.currentAuctionPlayer.currentBidderTeamId ===
                      userTeam.id
                        ? "✓ YOU are leading"
                        : `${gameState.teams.find((t) => t.id === gameState.currentAuctionPlayer!.currentBidderTeamId)?.name} leading`}
                    </div>
                  )}
                </div>

                {/* Timer */}
                <div className="mb-4">
                  <div
                    className="flex justify-between text-xs mb-1"
                    style={{ color: "#A7B3C2" }}
                  >
                    <span>Time Remaining</span>
                    <span
                      style={{
                        color:
                          (gameState.currentAuctionPlayer.timerSeconds ?? 0) <=
                          5
                            ? "#E53935"
                            : "#35E06F",
                      }}
                    >
                      {gameState.currentAuctionPlayer.timerSeconds}s
                    </span>
                  </div>
                  <Progress
                    value={
                      (gameState.currentAuctionPlayer.timerSeconds /
                        TIMER_SECONDS) *
                      100
                    }
                    className="h-2"
                    style={{ background: "rgba(30,58,74,0.5)" }}
                  />
                </div>

                {/* Bid Increments */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {BID_INCREMENTS.map((inc) => (
                    <button
                      type="button"
                      key={inc}
                      onClick={() => handleUserBid(inc)}
                      data-ocid={`auction.bid_${inc}.button`}
                      disabled={
                        isProcessing ||
                        gameState.currentAuctionPlayer?.status !== "active"
                      }
                      className="py-2 rounded-lg text-sm font-bold transition-all border"
                      style={{
                        borderColor: "#FF7A2F",
                        color: "#FF7A2F",
                        background: "rgba(255,122,47,0.1)",
                      }}
                    >
                      +{inc} Cr
                    </button>
                  ))}
                </div>

                {/* Custom bid */}
                <div className="flex gap-2 mb-3">
                  <input
                    type="number"
                    placeholder="Custom bid (Cr)"
                    value={customBid}
                    onChange={(e) => setCustomBid(e.target.value)}
                    data-ocid="auction.custom_bid.input"
                    className="flex-1 rounded-lg px-3 py-2 text-sm"
                    style={{
                      background: "rgba(15,34,51,0.8)",
                      border: "1px solid rgba(30,58,74,0.8)",
                      color: "#E9EEF5",
                    }}
                    step="0.25"
                  />
                  <button
                    type="button"
                    onClick={handleCustomBid}
                    data-ocid="auction.custom_bid.submit_button"
                    className="px-4 py-2 rounded-lg text-sm font-bold"
                    style={{
                      background: "linear-gradient(135deg, #FF6A2A, #FF9A3D)",
                      color: "#fff",
                    }}
                  >
                    BID
                  </button>
                </div>

                {/* Pass */}
                <button
                  type="button"
                  onClick={handlePass}
                  data-ocid="auction.pass.button"
                  disabled={isProcessing}
                  className="w-full py-2 rounded-lg text-sm font-bold uppercase tracking-wider border transition-all"
                  style={{
                    borderColor: "rgba(167,179,194,0.3)",
                    color: "#A7B3C2",
                    background: "transparent",
                  }}
                >
                  PASS
                </button>
              </div>
            )}

            {/* Bid Feed */}
            <div className="panel-glass rounded-2xl p-4">
              <h3
                className="text-xs font-bold uppercase tracking-widest mb-3"
                style={{ color: "#A7B3C2" }}
              >
                Bid Activity
              </h3>
              <div className="space-y-1" data-ocid="auction.bid_feed.list">
                {bidFeed.length === 0 ? (
                  <p
                    className="text-xs text-center py-4"
                    style={{ color: "#A7B3C2" }}
                  >
                    Waiting for bids...
                  </p>
                ) : (
                  bidFeed.map((b, i) => (
                    <div
                      // biome-ignore lint/suspicious/noArrayIndexKey: feed
                      key={i}
                      className="text-xs py-1"
                      style={{ color: b.color }}
                    >
                      {b.text}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Teams Budget Panel */}
          <div className="lg:col-span-1">
            <div
              className="panel-glow rounded-2xl p-5"
              data-ocid="auction.teams.panel"
            >
              <h3
                className="text-xs font-bold uppercase tracking-widest mb-4"
                style={{ color: "#A7B3C2" }}
              >
                Teams
              </h3>
              <div className="space-y-3">
                {gameState.teams.map((team, i) => (
                  <div
                    key={team.id}
                    className="flex items-center gap-3"
                    data-ocid={`auction.team.item.${i + 1}`}
                  >
                    <div
                      className="w-7 h-7 rounded flex items-center justify-center text-xs font-bold shrink-0"
                      style={{ background: team.primaryColor, color: "#fff" }}
                    >
                      {team.shortName}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div
                        className="text-xs font-semibold truncate"
                        style={{
                          color: team.isUserTeam ? "#35E06F" : "#E9EEF5",
                        }}
                      >
                        {team.isUserTeam ? "⭐ " : ""}
                        {team.name}
                      </div>
                      <div className="text-xs" style={{ color: "#A7B3C2" }}>
                        {team.squad.length} players
                      </div>
                    </div>
                    <div
                      className="text-xs font-bold shrink-0"
                      style={{
                        color: team.budget < 10 ? "#E53935" : "#FF9A3D",
                      }}
                    >
                      ₹{team.budget.toFixed(0)}Cr
                    </div>
                    {gameState.currentAuctionPlayer?.currentBidderTeamId ===
                      team.id && (
                      <span className="text-xs" style={{ color: "#35E06F" }}>
                        ⬆️
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
