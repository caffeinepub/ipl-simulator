import { Toaster } from "@/components/ui/sonner";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  INITIAL_TEAMS,
  PLAYERS,
  createAuctionQueue,
  getPlayer,
  shuffleArray,
} from "./data/players";
import { aiPickPlayingXI, generateLeagueFixtures } from "./engine/gameEngine";
import AuctionScreen from "./screens/AuctionScreen";
import FranchiseSelectScreen from "./screens/FranchiseSelectScreen";
import HomeScreen from "./screens/HomeScreen";
import LeaderboardScreen from "./screens/LeaderboardScreen";
import MatchScreen from "./screens/MatchScreen";
import TeamScreen from "./screens/TeamScreen";
import TournamentScreen from "./screens/TournamentScreen";
import type { GameState, TeamData } from "./types/game";

const STORAGE_KEY = "ipl-simulator-state";

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
    rtmCards: [],
    trophy: undefined,
  };
}

function loadGameState(): GameState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as GameState;
      // Validate it has a valid phase
      if (parsed?.teams && parsed.phase) {
        return parsed;
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
 * Auto-simulate a full IPL auction.
 * Distributes PLAYERS across all 8 teams fairly,
 * weighting by team budget (all equal = random fair split).
 */
function simulateQuickPlayAuction(teams: TeamData[]): TeamData[] {
  const allPlayerIds = shuffleArray(PLAYERS.map((p) => p.id));
  const updated = teams.map((t) => ({
    ...t,
    squad: [] as number[],
    budget: 100,
  }));
  let teamIdx = 0;
  for (const playerId of allPlayerIds) {
    // Round-robin distribution, skip teams that hit 15
    let tries = 0;
    while (updated[teamIdx].squad.length >= 15 && tries < updated.length) {
      teamIdx = (teamIdx + 1) % updated.length;
      tries++;
    }
    if (tries < updated.length) {
      updated[teamIdx].squad.push(playerId);
      teamIdx = (teamIdx + 1) % updated.length;
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
        // Mark chosen team as user's
        const teamsWithUser = prev.teams.map((t) => ({
          ...t,
          isUserTeam: t.id === franchiseId,
        }));

        if (mode === "quickplay") {
          // Auto-simulate the auction, then send user to team setup
          const teamsAfterAuction = simulateQuickPlayAuction(teamsWithUser);
          // Give user team a full squad but clear playingXI so they can set it
          const finalTeams = teamsAfterAuction.map((t) =>
            t.isUserTeam ? { ...t, playingXI: [] } : t,
          );
          toast.success(
            "Auction simulated! Now set your Playing XI to start the tournament.",
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
              IPL CRICKET
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
                  (item.key === "franchise" && phase === "auction")
                    ? "#35E06F"
                    : "#A7B3C2",
                borderBottom:
                  phase === item.key ||
                  (item.key === "franchise" && phase === "auction")
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
