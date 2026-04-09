import { Toaster } from "@/components/ui/sonner";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  INITIAL_TEAMS,
  PLAYERS,
  createAuctionQueue,
  shuffleArray,
} from "./data/players";
import { aiPickPlayingXI } from "./engine/gameEngine";
import AuctionScreen from "./screens/AuctionScreen";
import FranchiseSelectScreen from "./screens/FranchiseSelectScreen";
import HomeScreen from "./screens/HomeScreen";
import LeaderboardScreen from "./screens/LeaderboardScreen";
import MatchScreen from "./screens/MatchScreen";
import RetentionScreen from "./screens/RetentionScreen";
import TeamScreen from "./screens/TeamScreen";
import TournamentScreen from "./screens/TournamentScreen";
import type { GameState, TeamData } from "./types/game";

const STORAGE_KEY = "ipl-simulator-state-v4";

function createInitialGameState(): GameState {
  return {
    season: 1,
    phase: "home",
    teams: INITIAL_TEAMS.map((t) => ({ ...t })),
    auctionQueue: createAuctionQueue(),
    auctionIndex: 0,
    auctionComplete: false,
    currentAuctionPlayer: undefined,
    currentMatch: undefined,
    tournamentMatches: [],
    tournamentPhase: "group",
    playerStats: [],
    retainedPlayers: [],
    retentionEntries: [],
    rtmCards: [],
    trophy: undefined,
  };
}

function loadGameState(): GameState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as GameState;
      if (parsed?.teams && parsed.phase) {
        // Ensure matchesPlayed exists on all teams (migration)
        const teams = parsed.teams.map((t: TeamData) => ({
          ...t,
          matchesPlayed: t.matchesPlayed ?? 0,
          homeVenue: t.homeVenue ?? "",
        }));
        return { ...parsed, teams };
      }
    }
  } catch {
    /* ignore */
  }
  return createInitialGameState();
}

function saveGameState(state: GameState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

/**
 * Auto-simulate Quick Play auction for 10 teams × 18 players each.
 * Guarantees iconic franchise players are assigned first, then fills
 * each team with balanced role-based composition:
 *   3 WicketKeepers + 5 Batsmen + 4 AllRounders + 5 Bowlers (2 Spin + 3 Pace)
 *   = 17 players, with 1 flex slot filled from best available.
 */
function simulateQuickPlayAuction(teams: TeamData[]): TeamData[] {
  // Iconic player guarantees: { teamId -> [playerIds] }
  // Team IDs match INITIAL_TEAMS ordering (0-indexed array position as id)
  const iconicAssignments: Record<number, number[]> = {
    0: [2, 3], // MI: Rohit Sharma, Jasprit Bumrah
    1: [5, 4, 192], // CSK: MS Dhoni, Ravindra Jadeja, Dewald Brevis
    2: [10], // DC: Rishabh Pant
    3: [60], // KKR: Sunil Narine
    4: [16], // RR: Ravichandran Ashwin
    5: [8], // PBKS: Shreyas Iyer
    6: [51], // SRH: David Warner
    7: [1], // RCB: Virat Kohli
    8: [31], // GT: Shubman Gill
    9: [7], // LSG: KL Rahul
  };

  const iconicPlayerIds = new Set(Object.values(iconicAssignments).flat());

  // Target squad composition per team (total 17, +1 flex = 18)
  const TARGET_WK = 3;
  const TARGET_BAT = 5;
  const TARGET_AR = 4;
  const TARGET_BOWL_SPIN = 2;
  const TARGET_BOWL_PACE = 3; // Fast or Medium

  // Build shuffled role pools (excluding iconics)
  const availableWK = shuffleArray(
    PLAYERS.filter(
      (p) => p.role === "WicketKeeper" && !iconicPlayerIds.has(p.id),
    ),
  );
  const availableBAT = shuffleArray(
    PLAYERS.filter((p) => p.role === "Batsman" && !iconicPlayerIds.has(p.id)),
  );
  const availableAR = shuffleArray(
    PLAYERS.filter(
      (p) => p.role === "AllRounder" && !iconicPlayerIds.has(p.id),
    ),
  );
  const availableSpin = shuffleArray(
    PLAYERS.filter(
      (p) =>
        p.role === "Bowler" &&
        p.bowlingStyle === "Spin" &&
        !iconicPlayerIds.has(p.id),
    ),
  );
  const availablePace = shuffleArray(
    PLAYERS.filter(
      (p) =>
        p.role === "Bowler" &&
        (p.bowlingStyle === "Fast" || p.bowlingStyle === "Medium") &&
        !iconicPlayerIds.has(p.id),
    ),
  );

  let wkIdx = 0;
  let batIdx = 0;
  let arIdx = 0;
  let spinIdx = 0;
  let paceIdx = 0;

  const updated = teams.map((t) => {
    const iconic = iconicAssignments[t.id] ?? [];
    const squad: number[] = [...iconic];

    const iconicPlayers = iconic
      .map((id) => PLAYERS.find((p) => p.id === id)!)
      .filter(Boolean);

    let wkCount = iconicPlayers.filter((p) => p.role === "WicketKeeper").length;
    let batCount = iconicPlayers.filter((p) => p.role === "Batsman").length;
    let arCount = iconicPlayers.filter((p) => p.role === "AllRounder").length;
    let spinCount = iconicPlayers.filter(
      (p) => p.role === "Bowler" && p.bowlingStyle === "Spin",
    ).length;
    let paceCount = iconicPlayers.filter(
      (p) =>
        p.role === "Bowler" &&
        (p.bowlingStyle === "Fast" || p.bowlingStyle === "Medium"),
    ).length;

    // Fill WK slots
    while (wkCount < TARGET_WK && wkIdx < availableWK.length) {
      squad.push(availableWK[wkIdx].id);
      wkIdx++;
      wkCount++;
    }
    // Fill Batsman slots
    while (batCount < TARGET_BAT && batIdx < availableBAT.length) {
      squad.push(availableBAT[batIdx].id);
      batIdx++;
      batCount++;
    }
    // Fill AllRounder slots
    while (arCount < TARGET_AR && arIdx < availableAR.length) {
      squad.push(availableAR[arIdx].id);
      arIdx++;
      arCount++;
    }
    // Fill Spin Bowler slots
    while (spinCount < TARGET_BOWL_SPIN && spinIdx < availableSpin.length) {
      squad.push(availableSpin[spinIdx].id);
      spinIdx++;
      spinCount++;
    }
    // Fill Pace Bowler slots
    while (paceCount < TARGET_BOWL_PACE && paceIdx < availablePace.length) {
      squad.push(availablePace[paceIdx].id);
      paceIdx++;
      paceCount++;
    }

    return { ...t, squad, budget: 100 };
  });

  // Fill any remaining gaps (up to 18) with overflow from all remaining players
  const allUsed = new Set(updated.flatMap((t) => t.squad));
  const overflow = shuffleArray(
    PLAYERS.filter((p) => !allUsed.has(p.id)).map((p) => p.id),
  );
  let overflowIdx = 0;
  for (const team of updated) {
    while (team.squad.length < 18 && overflowIdx < overflow.length) {
      team.squad.push(overflow[overflowIdx++]);
    }
  }

  // Auto-assign playingXI for all teams
  return updated.map((t) => ({
    ...t,
    playingXI: aiPickPlayingXI(t.squad, PLAYERS),
  }));
}

export default function App() {
  const [gameState, setGameState] = useState<GameState>(() => loadGameState());

  useEffect(() => {
    saveGameState(gameState);
  }, [gameState]);

  const updateGameState = useCallback(
    (updater: (prev: GameState) => GameState) => {
      setGameState((prev) => {
        const next = updater(prev);
        return next;
      });
    },
    [],
  );

  const navigateTo = useCallback(
    (phase: GameState["phase"]) => {
      updateGameState((prev) => ({ ...prev, phase }));
    },
    [updateGameState],
  );

  const resetGame = useCallback(() => {
    const fresh = createInitialGameState();
    setGameState(fresh);
    toast.success("New game started!");
  }, []);

  /** Called from FranchiseSelectScreen when user picks team + mode */
  const handleFranchiseSelect = useCallback(
    (franchiseId: number, mode: "auction" | "quickplay") => {
      setGameState((prev) => {
        // Mark chosen team as user's -- use id comparison, never rely on id===0
        const teamsWithUser = prev.teams.map((t) => ({
          ...t,
          isUserTeam: t.id === franchiseId,
        }));

        if (mode === "quickplay") {
          const teamsAfterAuction = simulateQuickPlayAuction(teamsWithUser);
          // Clear user team's playingXI so they can pick manually
          const finalTeams = teamsAfterAuction.map((t) =>
            t.isUserTeam ? { ...t, playingXI: [] } : t,
          );
          toast.success(
            "Auction simulated! Each team has 18 players. Now set your Playing XI.",
          );
          return {
            ...prev,
            teams: finalTeams,
            auctionComplete: true,
            phase: "team",
          };
        }

        // Live auction mode
        return {
          ...prev,
          teams: teamsWithUser,
          phase: "auction",
        };
      });
    },
    [],
  );

  return (
    <div
      className="min-h-screen"
      style={{ background: "#070B14", fontFamily: "'Figtree', sans-serif" }}
    >
      <Toaster position="top-right" theme="dark" />

      {/* Navigation */}
      <NavBar
        phase={gameState.phase}
        onNavigate={navigateTo}
        onReset={resetGame}
        season={gameState.season}
      />

      {/* Main Content */}
      <main>
        <AnimatePresence mode="wait">
          {gameState.phase === "home" && (
            <motion.div
              key="home"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <HomeScreen
                gameState={gameState}
                onNavigate={navigateTo}
                onReset={resetGame}
              />
            </motion.div>
          )}
          {gameState.phase === "franchise" && (
            <motion.div
              key="franchise"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <FranchiseSelectScreen onSelect={handleFranchiseSelect} />
            </motion.div>
          )}
          {gameState.phase === "auction" && (
            <motion.div
              key="auction"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <AuctionScreen
                gameState={gameState}
                updateGameState={updateGameState}
                onNavigate={navigateTo}
              />
            </motion.div>
          )}
          {gameState.phase === "team" && (
            <motion.div
              key="team"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <TeamScreen
                gameState={gameState}
                updateGameState={updateGameState}
                onNavigate={navigateTo}
              />
            </motion.div>
          )}
          {gameState.phase === "match" && (
            <motion.div
              key="match"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <MatchScreen
                gameState={gameState}
                updateGameState={updateGameState}
                onNavigate={navigateTo}
              />
            </motion.div>
          )}
          {gameState.phase === "tournament" && (
            <motion.div
              key="tournament"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <TournamentScreen
                gameState={gameState}
                updateGameState={updateGameState}
                onNavigate={navigateTo}
                onReset={resetGame}
              />
            </motion.div>
          )}
          {gameState.phase === "leaderboard" && (
            <motion.div
              key="leaderboard"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <LeaderboardScreen
                gameState={gameState}
                onNavigate={navigateTo}
              />
            </motion.div>
          )}
          {gameState.phase === "retention" && (
            <motion.div
              key="retention"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <RetentionScreen
                gameState={gameState}
                updateGameState={updateGameState}
                onNavigate={navigateTo}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer
        className="text-center py-6 border-t"
        style={{
          borderColor: "rgba(30,58,74,0.4)",
          background: "rgba(7,11,20,0.95)",
        }}
      >
        <p className="text-sm" style={{ color: "#A7B3C2" }}>
          © {new Date().getFullYear()}. Built with ❤️ using{" "}
          <a
            href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
            style={{ color: "#FF7A2F" }}
          >
            caffeine.ai
          </a>
        </p>
      </footer>
    </div>
  );
}

function NavBar({
  phase,
  onNavigate,
  onReset,
  season,
}: {
  phase: GameState["phase"];
  onNavigate: (p: GameState["phase"]) => void;
  onReset: () => void;
  season: number;
}) {
  const navItems: { label: string; key: GameState["phase"] }[] = [
    { label: "Home", key: "home" },
    { label: "Auction", key: "franchise" },
    { label: "Teams", key: "team" },
    { label: "Match", key: "match" },
    { label: "Tournament", key: "tournament" },
    { label: "Leaderboard", key: "leaderboard" },
  ];

  return (
    <header
      className="sticky top-0 z-50 border-b"
      style={{
        background: "rgba(7,11,20,0.95)",
        borderColor: "rgba(30,58,74,0.6)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        {/* Logo */}
        <button
          type="button"
          onClick={() => onNavigate("home")}
          className="flex items-center gap-2 shrink-0"
          data-ocid="nav.home.link"
        >
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #FF6A2A, #FF9A3D)" }}
          >
            <span className="text-white text-xs font-bold font-display">
              🏑
            </span>
          </div>
          <div className="hidden sm:block">
            <div
              className="text-xs font-bold tracking-widest uppercase"
              style={{
                color: "#FF7A2F",
                fontFamily: "'BricolageGrotesque', sans-serif",
                lineHeight: 1,
              }}
            >
              IPL 2026
            </div>
            <div
              className="text-xs tracking-wider"
              style={{ color: "#A7B3C2", lineHeight: 1 }}
            >
              SIMULATOR
            </div>
          </div>
        </button>

        {/* Nav Links */}
        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item) => (
            <button
              type="button"
              key={item.key}
              onClick={() => onNavigate(item.key)}
              data-ocid={`nav.${item.key}.link`}
              className="px-3 py-1.5 text-xs font-semibold tracking-wider uppercase transition-all duration-200 rounded"
              style={{
                color:
                  phase === item.key ||
                  (item.key === "franchise" && phase === "auction") ||
                  (item.key === "franchise" && phase === "retention")
                    ? "#35E06F"
                    : "#A7B3C2",
                borderBottom:
                  phase === item.key ||
                  (item.key === "franchise" && phase === "auction") ||
                  (item.key === "franchise" && phase === "retention")
                    ? "2px solid #35E06F"
                    : "2px solid transparent",
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Right */}
        <div className="flex items-center gap-2">
          <span
            className="text-xs hidden sm:block"
            style={{ color: "#A7B3C2" }}
          >
            Season {season}
          </span>
          <button
            type="button"
            onClick={onReset}
            data-ocid="nav.reset.button"
            className="px-3 py-1.5 text-xs font-bold tracking-wider uppercase rounded transition-all"
            style={{
              background: "linear-gradient(135deg, #FF6A2A, #FF9A3D)",
              color: "#fff",
            }}
          >
            NEW GAME
          </button>
        </div>
      </div>
    </header>
  );
}
