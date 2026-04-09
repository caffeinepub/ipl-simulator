import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PLAYERS, getPlayer } from "../data/players";
import { aiPickPlayingXI } from "../engine/gameEngine";
import { simulateAIBall, simulateBall } from "../engine/matchEngine";
import type {
  BallOutcome,
  BallType,
  BatterStats,
  BowlingSpeed,
  GameState,
  InningsState,
  MatchState,
  ShotDirection,
  ShotType,
} from "../types/game";

interface Props {
  gameState: GameState;
  updateGameState: (updater: (prev: GameState) => GameState) => void;
  onNavigate: (phase: GameState["phase"]) => void;
}

type ExtendedMatch = Omit<MatchState, "phase"> & {
  phase:
    | "setup"
    | "innings1"
    | "innings2"
    | "superOver"
    | "so_innings1"
    | "so_innings2"
    | "result";
  currentMatch_userBatting: boolean;
};

function createEmptyInnings(
  battingTeamId: number,
  bowlingTeamId: number,
): InningsState {
  return {
    battingTeamId,
    bowlingTeamId,
    totalRuns: 0,
    wickets: 0,
    balls: 0,
    overs: 0,
    extras: 0,
    batterStats: [],
    bowlerStats: [],
    currentBatterIds: [-1, -1],
    currentBowlerId: -1,
    fallOfWickets: [],
  };
}

function initInnings(
  innings: InningsState,
  battingPlayers: number[],
  customBattingOrder?: number[],
  bowlingPlayers?: number[],
): InningsState {
  // Use custom order if provided for batting team
  const orderedBatters = customBattingOrder ?? battingPlayers;
  const openingBat = orderedBatters.slice(0, 2);

  // Bowling stats are initialized for the BOWLING team, not the batting team
  const bowlTeamPlayers = bowlingPlayers ?? battingPlayers;
  const bowlerCandidates = bowlTeamPlayers.filter((id) => {
    const p = getPlayer(id);
    return p && (p.role === "Bowler" || p.role === "AllRounder");
  });
  const firstBowler =
    bowlerCandidates[0] ?? bowlTeamPlayers[10] ?? bowlTeamPlayers[0];

  const batStats: BatterStats[] = orderedBatters.map((id) => ({
    playerId: id,
    runs: 0,
    balls: 0,
    fours: 0,
    sixes: 0,
    isOut: false,
  }));
  const bowlStats = bowlTeamPlayers.map((id) => ({
    playerId: id,
    overs: 0,
    balls: 0,
    runs: 0,
    wickets: 0,
    wides: 0,
    noBalls: 0,
  }));

  return {
    ...innings,
    currentBatterIds: [openingBat[0] ?? -1, openingBat[1] ?? -1] as [
      number,
      number,
    ],
    currentBowlerId: firstBowler,
    batterStats: batStats,
    bowlerStats: bowlStats,
  };
}

const SHOT_TYPES: ShotType[] = ["DEFENSIVE", "NORMAL", "AGGRESSIVE"];
const DIRECTIONS: ShotDirection[] = ["GROUNDED", "LOFTED"];

// Pace deliveries
const PACE_BALL_TYPES: { key: BallType; label: string }[] = [
  { key: "INSWING", label: "INSWING" },
  { key: "OUTSWING", label: "OUTSWING" },
  { key: "LEG_CUTTER", label: "LEG CUT" },
  { key: "OFF_CUTTER", label: "OFF CUT" },
  { key: "BOUNCER", label: "BOUNCER" },
  { key: "SLIDER", label: "SLIDER" },
  { key: "YORKER", label: "YORKER" },
];

// Spin deliveries
const SPIN_BALL_TYPES: { key: BallType; label: string }[] = [
  { key: "OFF_SPIN", label: "OFF SPIN" },
  { key: "LEG_SPIN", label: "LEG SPIN" },
  { key: "ARM_BALL", label: "ARM BALL" },
  { key: "CARROM_BALL", label: "CARROM" },
  { key: "GOOGLY", label: "GOOGLY" },
  { key: "SLIDER", label: "SLIDER" },
  { key: "YORKER", label: "YORKER" },
];

const SPEEDS: BowlingSpeed[] = ["SLOW", "MEDIUM", "FAST"];

function isBowlerSpin(bowlerId: number): boolean {
  const p = getPlayer(bowlerId);
  return p?.bowlingStyle === "Spin";
}

export default function MatchScreen({
  gameState,
  updateGameState,
  onNavigate,
}: Props) {
  const userTeam = gameState.teams.find((t) => t.isUserTeam)!;
  const [selectedShot, setSelectedShot] = useState<ShotType>("NORMAL");
  const [selectedDir, setSelectedDir] = useState<ShotDirection>("GROUNDED");
  const [selectedBall, setSelectedBall] = useState<BallType>("YORKER");
  const [selectedSpeed, setSelectedSpeed] = useState<BowlingSpeed>("MEDIUM");
  const [commentary, setCommentary] = useState<
    { text: string; color: string }[]
  >([]);
  const [ballResultAnim, setBallResultAnim] = useState("");

  // Impact Player state
  const [showImpactModal, setShowImpactModal] = useState(false);
  const [impactPlayerIds, setImpactPlayerIds] = useState<{
    innings1?: number;
    innings2?: number;
  }>({});

  // ===== TOSS MODAL STATE =====
  const [showTossModal, setShowTossModal] = useState(false);
  const [pendingOpponentId, setPendingOpponentId] = useState<number | null>(
    null,
  );
  const [tossStep, setTossStep] = useState<"call" | "result" | "choice">(
    "call",
  );
  const [_userTossCall, setUserTossCall] = useState<"heads" | "tails" | null>(
    null,
  );
  const [tossResult, setTossResult] = useState<"heads" | "tails" | null>(null);
  const [userWonToss, setUserWonToss] = useState(false);
  const [aiTossDecision, setAiTossDecision] = useState<"bat" | "bowl">("bat");
  const [_userBatBowlChoice, setUserBatBowlChoice] = useState<
    "bat" | "bowl" | null
  >(null);

  // ===== BATTING ORDER STATE =====
  const [customBattingOrder, setCustomBattingOrder] = useState<number[]>([]);
  const [showBattingOrderModal, setShowBattingOrderModal] = useState(false);

  // ===== BOWLER PICKER STATE =====
  const [showBowlerPicker, setShowBowlerPicker] = useState(false);
  const [_pendingBowlerOverStart, setPendingBowlerOverStart] = useState(false);
  const [autoSimBalls, setAutoSimBalls] = useState(0);

  const getUserTeamPlayers = useCallback(() => {
    const xi =
      userTeam.playingXI.length === 11
        ? userTeam.playingXI
        : userTeam.squad.slice(0, 11);
    return xi;
  }, [userTeam.playingXI, userTeam.squad]);

  const getOpponentPlayers = useCallback(
    (oppId: number) => {
      const opp = gameState.teams.find((t) => t.id === oppId)!;
      if (!opp) return [];
      return opp.playingXI.length >= 11
        ? opp.playingXI
        : opp.squad.length >= 11
          ? opp.squad.slice(0, 11)
          : aiPickPlayingXI(opp.squad, PLAYERS);
    },
    [gameState.teams],
  );

  // ===== TOSS FLOW =====
  const openTossModal = useCallback((opponentId: number) => {
    setPendingOpponentId(opponentId);
    setTossStep("call");
    setUserTossCall(null);
    setTossResult(null);
    setUserWonToss(false);
    setUserBatBowlChoice(null);
    setShowTossModal(true);
  }, []);

  const handleTossCall = useCallback((call: "heads" | "tails") => {
    setUserTossCall(call);
    const result: "heads" | "tails" = Math.random() > 0.5 ? "heads" : "tails";
    setTossResult(result);
    const won = result === call;
    setUserWonToss(won);
    // Pre-decide AI's bat/bowl choice so it's set before the modal renders
    if (!won) {
      setAiTossDecision(Math.random() > 0.5 ? "bat" : "bowl");
    }
    setTossStep("result");
  }, []);

  const handleTossChoice = useCallback(
    (choice: "bat" | "bowl") => {
      setUserBatBowlChoice(choice);
      setShowTossModal(false);
      // Proceed to start match with toss result
      if (pendingOpponentId === null) return;
      const opponentId = pendingOpponentId;

      const tossWinnerId = userWonToss ? userTeam.id : opponentId;
      // When AI wins, use the pre-decided aiTossDecision (set in handleTossCall)
      const tossChoice: "bat" | "bowl" = userWonToss ? choice : aiTossDecision;

      // Initialize batting order
      const userPlayers = getUserTeamPlayers();
      const effectiveBattingOrder =
        customBattingOrder.length === userPlayers.length
          ? customBattingOrder
          : userPlayers;

      const userBatsFirst =
        (tossWinnerId === userTeam.id && tossChoice === "bat") ||
        (tossWinnerId === opponentId && tossChoice === "bowl");
      const battingFirst = userBatsFirst ? userTeam.id : opponentId;
      const bowlingFirst = userBatsFirst ? opponentId : userTeam.id;

      const innings1 = initInnings(
        createEmptyInnings(battingFirst, bowlingFirst),
        battingFirst === userTeam.id
          ? userPlayers
          : getOpponentPlayers(opponentId),
        battingFirst === userTeam.id ? effectiveBattingOrder : undefined,
        battingFirst === userTeam.id
          ? getOpponentPlayers(opponentId)
          : userPlayers,
      );
      const innings2 = createEmptyInnings(bowlingFirst, battingFirst);

      const tournamentMatch = gameState.tournamentMatches.find(
        (m) =>
          !m.completed &&
          ((m.team1Id === userTeam.id && m.team2Id === opponentId) ||
            (m.team2Id === userTeam.id && m.team1Id === opponentId)),
      );

      const newMatch: ExtendedMatch = {
        id: Date.now(),
        team1Id: userTeam.id,
        team2Id: opponentId,
        tossWinner: tossWinnerId,
        tossChoice,
        phase: "innings1",
        innings1,
        innings2,
        matchType: "league",
        impactPlayerUsed1: false,
        impactPlayerUsed2: false,
        currentMatch_userBatting: battingFirst === userTeam.id,
        matchId: tournamentMatch?.id,
        venue: tournamentMatch?.venue ?? gameState.currentMatch?.venue,
      };

      updateGameState((prev) => ({ ...prev, currentMatch: newMatch as any }));

      const tossWinnerName =
        tossWinnerId === userTeam.id
          ? userTeam.name
          : gameState.teams.find((t) => t.id === opponentId)?.name;
      const aiChoice = !userWonToss ? tossChoice : null;
      const displayChoice = userWonToss ? choice : (aiChoice ?? tossChoice);
      toast.success(
        `${tossWinnerName} won the toss and chose to ${displayChoice}!`,
      );
      setCommentary([
        {
          text: `🪙 ${tossWinnerName} won the toss and chose to ${displayChoice}.`,
          color: "#22B8C7",
        },
      ]);
      setImpactPlayerIds({});
    },
    [
      pendingOpponentId,
      userWonToss,
      userTeam,
      getUserTeamPlayers,
      getOpponentPlayers,
      customBattingOrder,
      updateGameState,
      gameState.teams,
      gameState.tournamentMatches,
      gameState.currentMatch,
      aiTossDecision,
    ],
  );

  const startMatch = useCallback(
    (opponentId: number) => {
      // Initialize custom batting order to default if not set
      const userPlayers = getUserTeamPlayers();
      if (customBattingOrder.length !== userPlayers.length) {
        setCustomBattingOrder(userPlayers);
      }
      openTossModal(opponentId);
    },
    [getUserTeamPlayers, customBattingOrder, openTossModal],
  );

  const addCommentary = useCallback(
    (text: string, color = "#E9EEF5", result?: string) => {
      setCommentary((prev) => [{ text, color }, ...prev].slice(0, 20));
      if (result) {
        setBallResultAnim(result);
        setTimeout(() => setBallResultAnim(""), 2000);
      }
    },
    [],
  );

  const applyBallOutcome = useCallback(
    (
      outcome: BallOutcome,
      inningsKey: "innings1" | "innings2" | "superOver1" | "superOver2",
    ) => {
      updateGameState((prev) => {
        if (!prev.currentMatch) return prev;
        const match = prev.currentMatch as ExtendedMatch;

        // Determine which innings object to update
        let innings: InningsState;
        if (inningsKey === "superOver1") {
          innings = match.superOverInnings1 ?? createEmptyInnings(0, 0);
        } else if (inningsKey === "superOver2") {
          innings = match.superOverInnings2 ?? createEmptyInnings(0, 0);
        } else {
          innings = inningsKey === "innings1" ? match.innings1 : match.innings2;
        }

        const strikerId = innings.currentBatterIds[0];
        const newBatterStats = innings.batterStats.map((bs) => {
          if (bs.playerId === strikerId && !outcome.isWide) {
            return {
              ...bs,
              runs: bs.runs + outcome.runs,
              balls: outcome.isNoBall ? bs.balls : bs.balls + 1,
              fours: bs.fours + (outcome.isFour ? 1 : 0),
              sixes: bs.sixes + (outcome.isSix ? 1 : 0),
              isOut: outcome.isWicket,
              dismissal: outcome.isWicket ? outcome.wicketType : bs.dismissal,
            };
          }
          return bs;
        });

        const bowlerId = innings.currentBowlerId;
        const newBowlerStats = innings.bowlerStats.map((bws) => {
          if (bws.playerId === bowlerId) {
            const newBalls =
              outcome.isWide || outcome.isNoBall ? bws.balls : bws.balls + 1;
            return {
              ...bws,
              runs: bws.runs + outcome.runs,
              balls: newBalls,
              overs: newBalls / 6,
              wickets: bws.wickets + (outcome.isWicket ? 1 : 0),
              wides: bws.wides + (outcome.isWide ? 1 : 0),
              noBalls: bws.noBalls + (outcome.isNoBall ? 1 : 0),
            };
          }
          return bws;
        });

        const newBalls =
          outcome.isWide || outcome.isNoBall
            ? innings.balls
            : innings.balls + 1;
        const newWickets = innings.wickets + (outcome.isWicket ? 1 : 0);
        const newRuns = innings.totalRuns + outcome.runs;
        const newExtras =
          innings.extras +
          (outcome.isWide || outcome.isNoBall ? outcome.runs : 0);

        let newBatterIds: [number, number] = [...innings.currentBatterIds] as [
          number,
          number,
        ];
        if (!outcome.isWicket && !outcome.isWide && outcome.runs % 2 === 1) {
          newBatterIds = [newBatterIds[1], newBatterIds[0]];
        }

        if (outcome.isWicket) {
          const battingTeamPlayers =
            innings.battingTeamId === userTeam.id
              ? getUserTeamPlayers()
              : getOpponentPlayers(match.team2Id);
          // Also include any impact player added to batterStats but not in the XI
          const impactBatIds = innings.batterStats
            .map((b) => b.playerId)
            .filter((id) => !battingTeamPlayers.includes(id));
          const allBattingPlayers = [...battingTeamPlayers, ...impactBatIds];
          const batted = innings.batterStats
            .filter((bs) => bs.balls > 0 || bs.isOut)
            .map((bs) => bs.playerId);
          const nextBatter =
            allBattingPlayers.find(
              (id) => !batted.includes(id) && id !== newBatterIds[1],
            ) ?? -1;
          if (nextBatter !== -1) {
            newBatterIds = [nextBatter, newBatterIds[1]] as [number, number];
          }
        }

        // ===== SUPER OVER LOGIC =====
        if (inningsKey === "superOver1" || inningsKey === "superOver2") {
          // Super over ends at 6 balls or 2 wickets
          const soOver = newBalls >= 6 || newWickets >= 2;

          // Rotate strike on end of over
          let soNextBowlerId = innings.currentBowlerId;
          if (
            newBalls > 0 &&
            newBalls % 6 === 0 &&
            !outcome.isWide &&
            !outcome.isNoBall
          ) {
            newBatterIds = [newBatterIds[1], newBatterIds[0]];
          }

          const updatedSoInnings = {
            ...innings,
            totalRuns: newRuns,
            wickets: newWickets,
            balls: newBalls,
            extras: newExtras,
            batterStats: newBatterStats,
            bowlerStats: newBowlerStats,
            currentBatterIds: newBatterIds,
            currentBowlerId: soNextBowlerId,
            overs: newBalls / 6,
          };

          if (inningsKey === "superOver1") {
            if (soOver) {
              // Start super over innings 2
              const soTarget = newRuns + 1;
              const bat2TeamId = innings.bowlingTeamId;
              const bowl2TeamId = innings.battingTeamId;
              const bat2Players =
                bat2TeamId === userTeam.id
                  ? getUserTeamPlayers()
                  : getOpponentPlayers(match.team2Id);
              const soInnings2 = initInnings(
                createEmptyInnings(bat2TeamId, bowl2TeamId),
                bat2Players,
                undefined,
                bowl2TeamId === userTeam.id
                  ? getUserTeamPlayers()
                  : getOpponentPlayers(match.team2Id),
              );
              return {
                ...prev,
                currentMatch: {
                  ...match,
                  superOverPhase: "so_innings2",
                  superOverInnings1: updatedSoInnings,
                  superOverInnings2: soInnings2,
                  superOverTarget: soTarget,
                  currentMatch_userBatting: bat2TeamId === userTeam.id,
                } as any,
              };
            }
            return {
              ...prev,
              currentMatch: {
                ...match,
                superOverInnings1: updatedSoInnings,
              } as any,
            };
          }

          // inningsKey === "superOver2"
          if (soOver) {
            const soTarget2 = match.superOverTarget ?? 0;
            let soWinner: number | undefined;
            let soResult: string;
            if (newRuns >= soTarget2) {
              soWinner = innings.battingTeamId;
              const wkts = 2 - newWickets;
              soResult = `SUPER OVER: ${prev.teams.find((t) => t.id === innings.battingTeamId)?.name} won by ${wkts} wicket${wkts !== 1 ? "s" : ""}`;
            } else {
              soWinner = innings.bowlingTeamId;
              const deficit = soTarget2 - 1 - newRuns;
              soResult = `SUPER OVER: ${prev.teams.find((t) => t.id === innings.bowlingTeamId)?.name} won by ${deficit} run${deficit !== 1 ? "s" : ""}`;
            }

            // Find player of match from super over
            const allBatStats = [
              ...(match.innings1?.batterStats ?? []),
              ...(match.innings2?.batterStats ?? []),
            ];
            const topBatter = allBatStats.sort((a, b) => b.runs - a.runs)[0];

            return {
              ...prev,
              currentMatch: {
                ...match,
                phase: "result",
                superOverPhase: "so_result",
                superOverInnings2: updatedSoInnings,
                superOverResult: soResult,
                superOverWinner: soWinner,
                result: soResult,
                winner: soWinner,
                playerOfMatch: topBatter?.playerId,
              } as any,
            };
          }

          // Check if target reached mid-over in super over innings 2
          const soTarget2 = match.superOverTarget ?? 0;
          const soTargetReached = newRuns >= soTarget2;
          if (soTargetReached) {
            const wkts = 2 - newWickets;
            const soResult = `SUPER OVER: ${prev.teams.find((t) => t.id === innings.battingTeamId)?.name} won by ${wkts} wicket${wkts !== 1 ? "s" : ""}`;
            const allBatStats = [
              ...(match.innings1?.batterStats ?? []),
              ...(match.innings2?.batterStats ?? []),
            ];
            const topBatter = allBatStats.sort((a, b) => b.runs - a.runs)[0];
            return {
              ...prev,
              currentMatch: {
                ...match,
                phase: "result",
                superOverPhase: "so_result",
                superOverInnings2: updatedSoInnings,
                superOverResult: soResult,
                superOverWinner: innings.battingTeamId,
                result: soResult,
                winner: innings.battingTeamId,
                playerOfMatch: topBatter?.playerId,
              } as any,
            };
          }

          return {
            ...prev,
            currentMatch: {
              ...match,
              superOverInnings2: updatedSoInnings,
            } as any,
          };
        }

        // ===== NORMAL INNINGS LOGIC =====
        let nextBowlerId = innings.currentBowlerId;
        let needsBowlerPick = false;
        if (
          newBalls > 0 &&
          newBalls % 6 === 0 &&
          !outcome.isWide &&
          !outcome.isNoBall
        ) {
          newBatterIds = [newBatterIds[1], newBatterIds[0]];
          const bowlingTeamIsUser = innings.bowlingTeamId === userTeam.id;
          if (bowlingTeamIsUser) {
            // User bowler: we'll pick via modal; keep current bowler for now
            needsBowlerPick = true;
          } else {
            const bowlingTeamPlayers = getOpponentPlayers(match.team2Id);
            const bowlers = bowlingTeamPlayers.filter((id) => {
              const p = getPlayer(id);
              return p && (p.role === "Bowler" || p.role === "AllRounder");
            });
            const bowlerOverCounts: Record<number, number> = {};
            for (const bws of innings.bowlerStats) {
              bowlerOverCounts[bws.playerId] = Math.floor(bws.balls / 6);
            }
            // Update for current ball
            const currentBowlerBalls =
              (innings.bowlerStats.find((b) => b.playerId === bowlerId)
                ?.balls ?? 0) + 1;
            bowlerOverCounts[bowlerId] = Math.floor(currentBowlerBalls / 6);
            const eligible = bowlers.filter(
              (id) =>
                (bowlerOverCounts[id] ?? 0) < 4 &&
                id !== innings.currentBowlerId,
            );
            const pool = eligible.length > 0 ? eligible : bowlers;
            nextBowlerId =
              pool[Math.floor(Math.random() * pool.length)] ?? nextBowlerId;
          }
        }

        // Check if target reached in innings2 (CRITICAL BUG FIX)
        const targetReached =
          inningsKey === "innings2" &&
          match.target !== undefined &&
          newRuns >= match.target;

        const inningsOver =
          newBalls >= 120 || newWickets >= 10 || targetReached;
        let newPhase = match.phase;
        let target = match.target;
        let result = match.result;
        let winner = match.winner;
        let playerOfMatch = match.playerOfMatch;

        if (inningsOver) {
          if (match.phase === "innings1") {
            newPhase = "innings2";
            target = newRuns + 1;
            const bat2TeamId = innings.bowlingTeamId;
            const bowl2TeamId = innings.battingTeamId;
            const bat2Players =
              bat2TeamId === userTeam.id
                ? getUserTeamPlayers()
                : getOpponentPlayers(match.team2Id);

            // Use custom batting order for user team in innings 2
            const userPlayers = getUserTeamPlayers();
            const effectiveBat2Order =
              bat2TeamId === userTeam.id
                ? customBattingOrder.length === userPlayers.length
                  ? customBattingOrder
                  : bat2Players
                : bat2Players;

            const newInnings2 = initInnings(
              createEmptyInnings(bat2TeamId, bowl2TeamId),
              bat2TeamId === userTeam.id ? userPlayers : bat2Players,
              bat2TeamId === userTeam.id ? effectiveBat2Order : undefined,
              bowl2TeamId === userTeam.id ? userPlayers : bat2Players,
            );

            const updatedInnings1 = {
              ...innings,
              totalRuns: newRuns,
              wickets: newWickets,
              balls: newBalls,
              extras: newExtras,
              batterStats: newBatterStats,
              bowlerStats: newBowlerStats,
              currentBatterIds: newBatterIds,
              currentBowlerId: nextBowlerId,
              overs: newBalls / 6,
            };

            return {
              ...prev,
              currentMatch: {
                ...match,
                phase: "innings2",
                target,
                innings1: updatedInnings1,
                innings2: newInnings2,
                currentMatch_userBatting: bat2TeamId === userTeam.id,
              } as any,
            };
          }

          // Match over — check for tie -> super over
          const target2 = match.target ?? 0;
          if (targetReached || newRuns >= target2) {
            winner = innings.battingTeamId;
            const wkts = 10 - newWickets;
            result = `${
              prev.teams.find((t) => t.id === innings.battingTeamId)?.name
            } won by ${wkts} wicket${wkts !== 1 ? "s" : ""}`;
            newPhase = "result";
          } else if (newWickets >= 10 || newBalls >= 120) {
            if (newRuns + 1 < target2) {
              // Lost
              winner = innings.bowlingTeamId;
              const margin = target2 - 1 - newRuns;
              result = `${
                prev.teams.find((t) => t.id === innings.bowlingTeamId)?.name
              } won by ${margin} run${margin !== 1 ? "s" : ""}`;
              newPhase = "result";
            } else if (newRuns + 1 === target2 || newRuns === target2 - 1) {
              // Tie — trigger Super Over
              const soTeam1 = innings.battingTeamId; // team that batted 2nd bats first in SO
              const soTeam2 = innings.bowlingTeamId;
              const so1Players =
                soTeam1 === userTeam.id
                  ? getUserTeamPlayers()
                  : getOpponentPlayers(match.team2Id);
              const soInnings1 = initInnings(
                createEmptyInnings(soTeam1, soTeam2),
                so1Players,
                undefined,
                soTeam2 === userTeam.id
                  ? getUserTeamPlayers()
                  : getOpponentPlayers(match.team2Id),
              );
              const updatedInnings2Final = {
                ...innings,
                totalRuns: newRuns,
                wickets: newWickets,
                balls: newBalls,
                extras: newExtras,
                batterStats: newBatterStats,
                bowlerStats: newBowlerStats,
                currentBatterIds: newBatterIds,
                currentBowlerId: nextBowlerId,
                overs: newBalls / 6,
              };
              return {
                ...prev,
                currentMatch: {
                  ...match,
                  phase: "innings2",
                  innings2: updatedInnings2Final,
                  isSuperOver: true,
                  superOverPhase: "so_innings1",
                  superOverInnings1: soInnings1,
                  currentMatch_userBatting: soTeam1 === userTeam.id,
                } as any,
              };
            } else {
              result = "Match tied! Super Over starts...";
              newPhase = "result";
            }
          }

          if (newPhase === "result") {
            const allBatStats = [
              ...match.innings1.batterStats,
              ...newBatterStats,
            ];
            const topBatter = allBatStats.sort((a, b) => b.runs - a.runs)[0];
            playerOfMatch = topBatter?.playerId;
          }
        }

        const updatedInnings = {
          ...innings,
          totalRuns: newRuns,
          wickets: newWickets,
          balls: newBalls,
          extras: newExtras,
          batterStats: newBatterStats,
          bowlerStats: newBowlerStats,
          currentBatterIds: newBatterIds,
          currentBowlerId: nextBowlerId,
          overs: newBalls / 6,
        };

        return {
          ...prev,
          currentMatch: {
            ...match,
            phase: newPhase,
            target,
            result,
            winner,
            playerOfMatch,
            [inningsKey]: updatedInnings,
            // Signal that bowler pick is needed (handled via side-effect)
            _needsBowlerPick: needsBowlerPick && !inningsOver,
          } as any,
        };
      });
    },
    [
      updateGameState,
      getUserTeamPlayers,
      getOpponentPlayers,
      userTeam.id,
      customBattingOrder,
    ],
  );

  const match = gameState.currentMatch as ExtendedMatch | undefined;

  // Detect when user bowler pick is needed
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional flag check
  useEffect(() => {
    if (!match) return;
    const m = match as any;
    if (m._needsBowlerPick) {
      setPendingBowlerOverStart(true);
      setShowBowlerPicker(true);
      // Clear the flag
      updateGameState((prev) => ({
        ...prev,
        currentMatch: {
          ...(prev.currentMatch as any),
          _needsBowlerPick: false,
        },
      }));
    }
  }, [(match as any)?._needsBowlerPick, match, updateGameState]);

  const handleSelectBowler = useCallback(
    (bowlerId: number) => {
      if (!match) return;
      updateGameState((prev) => {
        if (!prev.currentMatch) return prev;
        const m = prev.currentMatch as ExtendedMatch;
        const inningsKey =
          m.superOverPhase === "so_innings1" ||
          m.superOverPhase === "so_innings2"
            ? m.superOverPhase === "so_innings1"
              ? "superOverInnings1"
              : "superOverInnings2"
            : m.phase === "innings1"
              ? "innings1"
              : "innings2";
        const innings =
          inningsKey === "innings1"
            ? m.innings1
            : inningsKey === "innings2"
              ? m.innings2
              : inningsKey === "superOverInnings1"
                ? (m.superOverInnings1 ?? m.innings2)
                : (m.superOverInnings2 ?? m.innings2);
        return {
          ...prev,
          currentMatch: {
            ...m,
            [inningsKey]: { ...innings, currentBowlerId: bowlerId },
          } as any,
        };
      });
      setPendingBowlerOverStart(false);
      setShowBowlerPicker(false);
      const p = getPlayer(bowlerId);
      toast.success(`${p?.name ?? "Bowler"} will bowl the next over!`);
    },
    [match, updateGameState],
  );

  const currentInnings = !match
    ? null
    : match.isSuperOver && match.superOverPhase === "so_innings1"
      ? (match.superOverInnings1 ?? null)
      : match.isSuperOver && match.superOverPhase === "so_innings2"
        ? (match.superOverInnings2 ?? null)
        : match.phase === "innings1"
          ? match.innings1
          : match.phase === "innings2"
            ? match.innings2
            : null;

  const inningsKey: "innings1" | "innings2" | "superOver1" | "superOver2" =
    match?.isSuperOver && match?.superOverPhase === "so_innings1"
      ? "superOver1"
      : match?.isSuperOver && match?.superOverPhase === "so_innings2"
        ? "superOver2"
        : match?.phase === "innings1"
          ? "innings1"
          : "innings2";

  const userBatting = currentInnings?.battingTeamId === userTeam.id;
  const userBowling = currentInnings?.bowlingTeamId === userTeam.id;

  const oversNum = currentInnings ? Math.floor(currentInnings.balls / 6) : 0;
  const ballsNum = currentInnings ? currentInnings.balls % 6 : 0;
  const overStr = `${oversNum}.${ballsNum}`;

  // Current bowler's ball type (pace vs spin)
  const currentBowlerId = currentInnings?.currentBowlerId ?? -1;
  const isSpinBowler = isBowlerSpin(currentBowlerId);
  const BALL_TYPES = isSpinBowler ? SPIN_BALL_TYPES : PACE_BALL_TYPES;

  // Impact Player logic
  const canUseImpactPlayer =
    match &&
    !match.isSuperOver &&
    (match.phase === "innings1" || match.phase === "innings2") &&
    (userBatting || userBowling) &&
    (match.phase === "innings1"
      ? !match.impactPlayerUsed1
      : !match.impactPlayerUsed2);

  // Bench players = squad members NOT in playing XI
  const benchPlayers = userTeam.squad.filter(
    (id) => !userTeam.playingXI.includes(id),
  );

  const activeImpactPlayerId =
    match?.phase === "innings1"
      ? impactPlayerIds.innings1
      : impactPlayerIds.innings2;

  const handleSelectImpactPlayer = useCallback(
    (playerId: number) => {
      if (!match) return;
      const inningsKey2 = match.phase as "innings1" | "innings2";

      updateGameState((prev) => {
        if (!prev.currentMatch) return prev;
        const m = prev.currentMatch as ExtendedMatch;
        const innings = inningsKey2 === "innings1" ? m.innings1 : m.innings2;

        const alreadyInBatter = innings.batterStats.some(
          (b) => b.playerId === playerId,
        );
        const alreadyInBowler = innings.bowlerStats.some(
          (b) => b.playerId === playerId,
        );

        const newBatterStats = alreadyInBatter
          ? innings.batterStats
          : [
              ...innings.batterStats,
              {
                playerId,
                runs: 0,
                balls: 0,
                fours: 0,
                sixes: 0,
                isOut: false,
              },
            ];

        const newBowlerStats = alreadyInBowler
          ? innings.bowlerStats
          : [
              ...innings.bowlerStats,
              {
                playerId,
                overs: 0,
                balls: 0,
                runs: 0,
                wickets: 0,
                wides: 0,
                noBalls: 0,
              },
            ];

        const updatedInnings = {
          ...innings,
          batterStats: newBatterStats,
          bowlerStats: newBowlerStats,
        };

        return {
          ...prev,
          currentMatch: {
            ...m,
            [inningsKey2]: updatedInnings,
            impactPlayerUsed1:
              inningsKey2 === "innings1" ? true : m.impactPlayerUsed1,
            impactPlayerUsed2:
              inningsKey2 === "innings2" ? true : m.impactPlayerUsed2,
          } as any,
        };
      });

      setImpactPlayerIds((prev) => ({
        ...prev,
        [match.phase === "innings1" ? "innings1" : "innings2"]: playerId,
      }));

      const player = getPlayer(playerId);
      // Determine if user is bowling in this innings to give better feedback
      const currentInn =
        match.phase === "innings1" ? match.innings1 : match.innings2;
      const isUserBowling = currentInn?.bowlingTeamId === userTeam.id;
      const phaseMsg = isUserBowling
        ? "can now bowl this innings!"
        : "can now bat this innings!";
      toast.success(
        `⚡ ${player?.name ?? "Player"} brought on as Impact Player — ${phaseMsg}`,
      );
      addCommentary(
        `⚡ IMPACT PLAYER: ${player?.name} has come in as the Impact Player!`,
        "#FF9A3D",
      );
      setShowImpactModal(false);
    },
    [match, updateGameState, addCommentary, userTeam.id],
  );

  const handlePlayBall = useCallback(() => {
    if (!match) return;
    const isMainInnings =
      match.phase === "innings1" || match.phase === "innings2";
    const isSoInnings =
      match.isSuperOver &&
      (match.superOverPhase === "so_innings1" ||
        match.superOverPhase === "so_innings2");
    if (!isMainInnings && !isSoInnings) return;
    if (!currentInnings) return;
    if (!userBatting) return;

    const striker = getPlayer(currentInnings.currentBatterIds[0]);
    const bowler = getPlayer(currentInnings.currentBowlerId);
    if (!striker || !bowler) return;

    const maxBalls = isSoInnings ? 6 : 120;
    const isLastOver = currentInnings.balls >= maxBalls - 6;
    const outcome = simulateBall(
      selectedShot,
      selectedDir,
      selectedBall,
      selectedSpeed,
      striker,
      bowler,
      currentInnings.balls % 6,
      isLastOver,
    );

    const resultText = outcome.isWicket
      ? "OUT!"
      : outcome.isSix
        ? "SIX!"
        : outcome.isFour
          ? "FOUR!"
          : outcome.isWide
            ? "WIDE"
            : outcome.isNoBall
              ? "NO BALL"
              : outcome.runs === 0
                ? "DOT"
                : `${outcome.runs} RUN${outcome.runs > 1 ? "S" : ""}`;
    const resultColor = outcome.isWicket
      ? "#E53935"
      : outcome.isSix
        ? "#FF9A3D"
        : outcome.isFour
          ? "#35E06F"
          : outcome.isWide || outcome.isNoBall
            ? "#22B8C7"
            : "#A7B3C2";

    addCommentary(`${overStr} ${outcome.commentary}`, resultColor, resultText);
    applyBallOutcome(outcome, inningsKey);
  }, [
    match,
    currentInnings,
    userBatting,
    selectedShot,
    selectedDir,
    selectedBall,
    selectedSpeed,
    overStr,
    addCommentary,
    applyBallOutcome,
    inningsKey,
  ]);

  const handleBowl = useCallback(() => {
    if (!match) return;
    const isMainInnings =
      match.phase === "innings1" || match.phase === "innings2";
    const isSoInnings =
      match.isSuperOver &&
      (match.superOverPhase === "so_innings1" ||
        match.superOverPhase === "so_innings2");
    if (!isMainInnings && !isSoInnings) return;
    if (!currentInnings) return;
    if (!userBowling) return;
    if (showBowlerPicker) return; // Pause: waiting for bowler selection

    const striker = getPlayer(currentInnings.currentBatterIds[0]);
    const bowler = getPlayer(currentInnings.currentBowlerId);
    if (!striker || !bowler) return;

    const maxBalls = isSoInnings ? 6 : 120;
    const isLastOver = currentInnings.balls >= maxBalls - 6;
    const aiShots: ShotType[] = ["NORMAL", "AGGRESSIVE", "DEFENSIVE"];
    const aiDirs: ShotDirection[] = ["GROUNDED", "LOFTED"];
    const outcome = simulateBall(
      aiShots[Math.floor(Math.random() * 3)],
      aiDirs[Math.floor(Math.random() * 2)],
      selectedBall,
      selectedSpeed,
      striker,
      bowler,
      currentInnings.balls % 6,
      isLastOver,
    );

    const resultText = outcome.isWicket
      ? "WICKET!"
      : outcome.isSix
        ? "SIX!"
        : outcome.isFour
          ? "FOUR!"
          : outcome.runs === 0
            ? "DOT"
            : `${outcome.runs} RUN${outcome.runs > 1 ? "S" : ""}`;
    const resultColor = outcome.isWicket
      ? "#35E06F"
      : outcome.isSix
        ? "#E53935"
        : outcome.isFour
          ? "#FF7A2F"
          : "#A7B3C2";

    addCommentary(`${overStr} ${outcome.commentary}`, resultColor, resultText);
    applyBallOutcome(outcome, inningsKey);
  }, [
    match,
    currentInnings,
    userBowling,
    selectedBall,
    selectedSpeed,
    overStr,
    addCommentary,
    applyBallOutcome,
    inningsKey,
    showBowlerPicker,
  ]);

  // ===== AUTO SIMULATE =====
  const handleAutoSimulate = useCallback(
    (numOvers: number) => {
      if (!match || match.phase === "result") return;
      if (showBowlerPicker) {
        toast.error("Select your bowler first before simulating!");
        return;
      }
      setAutoSimBalls(numOvers * 6);
    },
    [match, showBowlerPicker],
  );

  // Keep fresh refs so auto-sim always calls latest handlers
  const handlePlayBallRef = useRef(handlePlayBall);
  const handleBowlRef = useRef(handleBowl);
  useEffect(() => {
    handlePlayBallRef.current = handlePlayBall;
  }, [handlePlayBall]);
  useEffect(() => {
    handleBowlRef.current = handleBowl;
  }, [handleBowl]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional auto-sim
  useEffect(() => {
    if (autoSimBalls <= 0) return;
    if (!match || match.phase === "result") {
      setAutoSimBalls(0);
      return;
    }
    if (showBowlerPicker) {
      // Pause sim while waiting for bowler selection, but don't reset counter
      return;
    }
    const timer = setTimeout(() => {
      if (userBatting) handlePlayBallRef.current();
      else if (userBowling) handleBowlRef.current();
      setAutoSimBalls((prev) => Math.max(0, prev - 1));
    }, 50);
    return () => clearTimeout(timer);
  }, [autoSimBalls, match?.phase, showBowlerPicker, userBatting, userBowling]);

  // AI auto-simulation when AI is batting
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    if (!match) return;
    if (match.phase === "result") return;
    if (showBowlerPicker) return; // paused waiting for bowler pick
    if (!currentInnings) return;
    if (currentInnings.battingTeamId === userTeam.id) return; // user batting
    if (userBowling && !showBowlerPicker) return; // user bowling - manual

    const timer = setTimeout(() => {
      if (!currentInnings) return;
      const striker = getPlayer(currentInnings.currentBatterIds[0]);
      const bowler = getPlayer(currentInnings.currentBowlerId);
      if (!striker || !bowler) return;

      const isSoInnings = match.isSuperOver;
      const maxBalls = isSoInnings ? 6 : 120;
      const isLastOver = currentInnings.balls >= maxBalls - 6;
      const outcome = simulateAIBall(
        striker,
        bowler,
        currentInnings.balls % 6,
        isLastOver,
        match.isSuperOver ? match.superOverTarget : match.target,
        currentInnings.totalRuns,
        (isSoInnings ? 6 : 120) - currentInnings.balls,
      );
      applyBallOutcome(outcome, inningsKey);
    }, 1200);

    return () => clearTimeout(timer);
  }, [
    match?.innings1?.balls,
    match?.innings2?.balls,
    match?.superOverInnings1?.balls,
    match?.superOverInnings2?.balls,
    match?.phase,
    match?.superOverPhase,
    showBowlerPicker,
  ]);

  const finishMatch = useCallback(() => {
    if (!match || match.phase !== "result") return;

    updateGameState((prev) => {
      const m = prev.currentMatch as ExtendedMatch;
      if (!m) return prev;

      const overs1 = m.innings1.balls / 6;
      const overs2 = m.innings2.balls / 6;
      const nrr1Delta =
        overs1 > 0 && overs2 > 0
          ? m.innings1.totalRuns / overs1 - m.innings2.totalRuns / overs2
          : 0;
      const nrr2Delta = -nrr1Delta;

      const updatedTeams = prev.teams.map((t) => {
        if (t.id === m.team1Id || t.id === m.team2Id) {
          const isWinner = t.id === (m.superOverWinner ?? m.winner);
          const nrrDelta = t.id === m.team1Id ? nrr1Delta : nrr2Delta;
          return {
            ...t,
            wins: isWinner ? t.wins + 1 : t.wins,
            losses: isWinner ? t.losses : t.losses + 1,
            points: isWinner ? t.points + 2 : t.points,
            matchesPlayed: t.matchesPlayed + 1,
            nrr: (t.nrr ?? 0) + nrrDelta,
          };
        }
        return t;
      });

      let updatedTournamentMatches = prev.tournamentMatches;
      if (m.matchId !== undefined) {
        updatedTournamentMatches = prev.tournamentMatches.map((tm) => {
          if (tm.id === m.matchId) {
            return {
              ...tm,
              completed: true,
              winner: m.superOverWinner ?? m.winner,
              result: m.superOverResult ?? m.result,
              score1: `${m.innings1.totalRuns}/${m.innings1.wickets} (${Math.floor(m.innings1.balls / 6)}.${m.innings1.balls % 6})`,
              score2: `${m.innings2.totalRuns}/${m.innings2.wickets} (${Math.floor(m.innings2.balls / 6)}.${m.innings2.balls % 6})`,
            };
          }
          return tm;
        });
      }

      // Update player stats from both innings — ALL batters and bowlers
      const allBatterStats = [
        ...m.innings1.batterStats,
        ...m.innings2.batterStats,
      ];

      // Bowler stats: innings1 bowlers are bowling team of innings1
      const allBowlerStats = [
        ...m.innings1.bowlerStats.map((b) => ({
          ...b,
          teamId: m.innings1.bowlingTeamId,
        })),
        ...m.innings2.bowlerStats.map((b) => ({
          ...b,
          teamId: m.innings2.bowlingTeamId,
        })),
      ];

      // Determine team ids for each batter
      const inningsTeamMap: Record<number, number> = {
        ...Object.fromEntries(
          m.innings1.batterStats.map((b) => [
            b.playerId,
            m.innings1.battingTeamId,
          ]),
        ),
        ...Object.fromEntries(
          m.innings2.batterStats.map((b) => [
            b.playerId,
            m.innings2.battingTeamId,
          ]),
        ),
      };

      let updatedPlayerStats = [...prev.playerStats];

      // Update batting stats for ALL batters who faced at least 1 ball or got out
      for (const bstat of allBatterStats) {
        if (bstat.balls === 0 && !bstat.isOut) continue;
        const isCentury = bstat.runs >= 100;
        const isHalfCentury = bstat.runs >= 50 && bstat.runs < 100;
        const teamId = inningsTeamMap[bstat.playerId] ?? -1;
        const existingIdx = updatedPlayerStats.findIndex(
          (s) => s.playerId === bstat.playerId,
        );
        if (existingIdx === -1) {
          updatedPlayerStats = [
            ...updatedPlayerStats,
            {
              playerId: bstat.playerId,
              teamId,
              runs: bstat.runs,
              balls: bstat.balls,
              fours: bstat.fours,
              sixes: bstat.sixes,
              wickets: 0,
              oversBowled: 0,
              runsConceded: 0,
              innings: 1,
              matchesPlayed: 1,
              strikeRate:
                bstat.balls > 0 ? (bstat.runs / bstat.balls) * 100 : 0,
              economy: 0,
              playerOfMatchCount: 0,
              centuries: isCentury ? 1 : 0,
              halfCenturies: isHalfCentury ? 1 : 0,
            },
          ];
        } else {
          const existing = updatedPlayerStats[existingIdx];
          updatedPlayerStats = updatedPlayerStats.map((s, idx) =>
            idx === existingIdx
              ? {
                  ...s,
                  centuries: (s.centuries ?? 0) + (isCentury ? 1 : 0),
                  halfCenturies:
                    (s.halfCenturies ?? 0) + (isHalfCentury ? 1 : 0),
                  runs: s.runs + bstat.runs,
                  balls: s.balls + bstat.balls,
                  fours: s.fours + bstat.fours,
                  sixes: s.sixes + bstat.sixes,
                  innings: s.innings + 1,
                  matchesPlayed: s.matchesPlayed,
                  strikeRate:
                    s.balls + bstat.balls > 0
                      ? ((s.runs + bstat.runs) / (s.balls + bstat.balls)) * 100
                      : s.strikeRate,
                  teamId: existing.teamId !== -1 ? existing.teamId : teamId,
                }
              : s,
          );
        }
      }

      // Update bowling stats for ALL bowlers who bowled at least 1 ball
      for (const bwstat of allBowlerStats) {
        if (bwstat.balls === 0) continue;
        const oversBowled = bwstat.balls / 6;
        const existingIdx = updatedPlayerStats.findIndex(
          (s) => s.playerId === bwstat.playerId,
        );
        if (existingIdx === -1) {
          updatedPlayerStats = [
            ...updatedPlayerStats,
            {
              playerId: bwstat.playerId,
              teamId: bwstat.teamId,
              runs: 0,
              balls: 0,
              fours: 0,
              sixes: 0,
              wickets: bwstat.wickets,
              oversBowled,
              runsConceded: bwstat.runs,
              innings: 0,
              matchesPlayed: 1,
              strikeRate: 0,
              economy: oversBowled > 0 ? bwstat.runs / oversBowled : 0,
              playerOfMatchCount: 0,
              centuries: 0,
              halfCenturies: 0,
            },
          ];
        } else {
          updatedPlayerStats = updatedPlayerStats.map((s, idx) => {
            if (idx !== existingIdx) return s;
            const newOvers = s.oversBowled + oversBowled;
            const newRunsConceded = s.runsConceded + bwstat.runs;
            return {
              ...s,
              wickets: s.wickets + bwstat.wickets,
              oversBowled: newOvers,
              runsConceded: newRunsConceded,
              economy: newOvers > 0 ? newRunsConceded / newOvers : 0,
              teamId: s.teamId !== -1 ? s.teamId : bwstat.teamId,
            };
          });
        }
      }

      return {
        ...prev,
        teams: updatedTeams,
        tournamentMatches: updatedTournamentMatches,
        playerStats: updatedPlayerStats,
        currentMatch: undefined,
      };
    });

    onNavigate("tournament");
  }, [match, updateGameState, onNavigate]);

  const opponents = gameState.teams.filter(
    (t) => !t.isUserTeam && (t.playingXI.length > 0 || t.squad.length > 0),
  );

  // ===== SETUP SCREEN =====
  if (!match || match.phase === "setup" || match.phase === undefined) {
    const presetMatch = gameState.currentMatch as ExtendedMatch | undefined;
    const presetOpponent =
      presetMatch?.team2Id !== undefined
        ? gameState.teams.find((t) => t.id === presetMatch.team2Id)
        : undefined;

    // Init batting order from user players on first load
    const userPlayers = getUserTeamPlayers();
    const battingOrderToShow =
      customBattingOrder.length === userPlayers.length
        ? customBattingOrder
        : userPlayers;

    const moveBatter = (index: number, dir: "up" | "down") => {
      const arr = [...battingOrderToShow];
      const target2 = dir === "up" ? index - 1 : index + 1;
      if (target2 < 0 || target2 >= arr.length) return;
      [arr[index], arr[target2]] = [arr[target2], arr[index]];
      setCustomBattingOrder(arr);
    };

    return (
      <div
        className="min-h-screen p-4 md:p-6"
        style={{ background: "#070B14" }}
      >
        <div className="max-w-3xl mx-auto">
          <h1
            className="text-2xl font-black uppercase mb-6"
            style={{
              color: "#E9EEF5",
              fontFamily: "'BricolageGrotesque', sans-serif",
            }}
          >
            <span className="text-gradient-orange">MATCH SETUP</span>
          </h1>

          {presetMatch?.venue && (
            <div
              className="mb-4 px-4 py-2 rounded-lg text-sm"
              style={{ background: "rgba(15,34,51,0.6)", color: "#A7B3C2" }}
            >
              📍 {presetMatch.venue}
            </div>
          )}

          {/* Batting Order Section */}
          <div
            className="panel-glow rounded-2xl p-4 mb-4"
            data-ocid="match.batting_order.panel"
          >
            <div className="flex items-center justify-between mb-3">
              <h2
                className="text-sm font-bold uppercase tracking-widest"
                style={{ color: "#FF9A3D" }}
              >
                🏏 Set Batting Order
              </h2>
              <button
                type="button"
                onClick={() => setShowBattingOrderModal(!showBattingOrderModal)}
                data-ocid="match.batting_order.toggle"
                className="text-xs px-3 py-1.5 rounded-lg font-bold uppercase"
                style={{
                  background: showBattingOrderModal
                    ? "rgba(255,154,61,0.2)"
                    : "rgba(15,34,51,0.6)",
                  color: "#FF9A3D",
                  border: "1px solid rgba(255,154,61,0.4)",
                }}
              >
                {showBattingOrderModal ? "Done" : "Edit"}
              </button>
            </div>

            {showBattingOrderModal && (
              <div className="space-y-1.5">
                {battingOrderToShow.map((id, index) => {
                  const p = getPlayer(id);
                  return (
                    <div
                      key={id}
                      className="flex items-center gap-2 p-2 rounded-lg"
                      style={{ background: "rgba(15,34,51,0.6)" }}
                      data-ocid={`match.batting_order.item.${index + 1}`}
                    >
                      <span
                        className="text-xs font-black w-5 text-center"
                        style={{ color: "#FF9A3D" }}
                      >
                        {index + 1}
                      </span>
                      <span
                        className="flex-1 text-sm font-semibold"
                        style={{ color: "#E9EEF5" }}
                      >
                        {p?.name ?? "Unknown"}
                        <span
                          className="text-xs ml-2"
                          style={{ color: "#A7B3C2" }}
                        >
                          ({p?.role})
                        </span>
                      </span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => moveBatter(index, "up")}
                          disabled={index === 0}
                          className="w-7 h-7 rounded flex items-center justify-center text-xs disabled:opacity-30"
                          style={{
                            background: "rgba(34,184,199,0.15)",
                            color: "#22B8C7",
                          }}
                          data-ocid={`match.batting_order_up.button.${index + 1}`}
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          onClick={() => moveBatter(index, "down")}
                          disabled={index === battingOrderToShow.length - 1}
                          className="w-7 h-7 rounded flex items-center justify-center text-xs disabled:opacity-30"
                          style={{
                            background: "rgba(34,184,199,0.15)",
                            color: "#22B8C7",
                          }}
                          data-ocid={`match.batting_order_down.button.${index + 1}`}
                        >
                          ▼
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {!showBattingOrderModal && (
              <div className="flex flex-wrap gap-1.5">
                {battingOrderToShow.slice(0, 4).map((id, i) => {
                  const p = getPlayer(id);
                  return (
                    <span
                      key={id}
                      className="text-xs px-2 py-1 rounded"
                      style={{
                        background: "rgba(255,154,61,0.1)",
                        color: "#FF9A3D",
                        border: "1px solid rgba(255,154,61,0.2)",
                      }}
                    >
                      {i + 1}. {p?.name?.split(" ").pop()}
                    </span>
                  );
                })}
                {battingOrderToShow.length > 4 && (
                  <span
                    className="text-xs px-2 py-1 rounded"
                    style={{ color: "#A7B3C2" }}
                  >
                    +{battingOrderToShow.length - 4} more
                  </span>
                )}
              </div>
            )}
          </div>

          <div
            className="panel-glow rounded-2xl p-6"
            data-ocid="match.setup.panel"
          >
            <h2
              className="text-sm font-bold uppercase tracking-widest mb-4"
              style={{ color: "#A7B3C2" }}
            >
              {presetOpponent ? `vs ${presetOpponent.name}` : "Select Opponent"}
            </h2>
            {presetOpponent ? (
              <div className="text-center">
                <div
                  className="w-20 h-20 rounded-xl flex items-center justify-center font-black text-xl mx-auto mb-4"
                  style={{
                    background: presetOpponent.primaryColor,
                    color: "#fff",
                  }}
                >
                  {presetOpponent.shortName}
                </div>
                <div
                  className="text-lg font-bold mb-1"
                  style={{ color: "#E9EEF5" }}
                >
                  {presetOpponent.name}
                </div>
                <div className="text-sm mb-6" style={{ color: "#A7B3C2" }}>
                  W: {presetOpponent.wins} L: {presetOpponent.losses}
                </div>
                <button
                  type="button"
                  onClick={() => startMatch(presetOpponent.id)}
                  data-ocid="match.start.primary_button"
                  className="px-8 py-3 rounded-lg font-bold uppercase tracking-wider"
                  style={{
                    background: "linear-gradient(135deg, #FF6A2A, #FF9A3D)",
                    color: "#fff",
                  }}
                >
                  🏸 Start Match
                </button>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {opponents.length === 0 ? (
                  <div
                    className="col-span-2"
                    data-ocid="match.opponents.empty_state"
                  >
                    <p style={{ color: "#A7B3C2" }}>
                      Complete the auction first to play matches.
                    </p>
                    <button
                      type="button"
                      onClick={() => onNavigate("auction")}
                      className="mt-2 text-sm"
                      style={{ color: "#FF7A2F" }}
                    >
                      Go to Auction →
                    </button>
                  </div>
                ) : (
                  opponents.map((opp, i) => (
                    <button
                      type="button"
                      key={opp.id}
                      onClick={() => startMatch(opp.id)}
                      data-ocid={`match.opponent.item.${i + 1}`}
                      className="flex items-center gap-3 p-4 rounded-xl border transition-all text-left"
                      style={{
                        background: "rgba(15,34,51,0.6)",
                        borderColor: "rgba(30,58,74,0.6)",
                      }}
                    >
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm"
                        style={{ background: opp.primaryColor, color: "#fff" }}
                      >
                        {opp.shortName}
                      </div>
                      <div>
                        <div
                          className="font-semibold text-sm"
                          style={{ color: "#E9EEF5" }}
                        >
                          {opp.name}
                        </div>
                        <div className="text-xs" style={{ color: "#A7B3C2" }}>
                          W: {opp.wins} L: {opp.losses}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* ===== TOSS MODAL ===== */}
        <Dialog open={showTossModal} onOpenChange={setShowTossModal}>
          <DialogContent
            className="max-w-sm"
            style={{
              background: "#070B14",
              border: "1px solid rgba(34,184,199,0.3)",
            }}
            data-ocid="match.toss.dialog"
          >
            <DialogHeader>
              <DialogTitle
                className="text-xl font-black uppercase tracking-wide text-center"
                style={{ color: "#E9EEF5" }}
              >
                🪙 TOSS
              </DialogTitle>
            </DialogHeader>

            {tossStep === "call" && (
              <div className="text-center">
                <p className="text-sm mb-6" style={{ color: "#A7B3C2" }}>
                  Call the toss!
                </p>
                <div className="flex gap-4 justify-center">
                  <button
                    type="button"
                    onClick={() => handleTossCall("heads")}
                    data-ocid="match.toss_heads.button"
                    className="w-24 h-24 rounded-full font-black text-lg flex flex-col items-center justify-center gap-1 transition-all"
                    style={{
                      background: "linear-gradient(135deg, #FFD700, #FFA500)",
                      color: "#1a1a1a",
                      boxShadow: "0 4px 20px rgba(255,215,0,0.3)",
                    }}
                  >
                    <span className="text-2xl">👑</span>
                    HEADS
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTossCall("tails")}
                    data-ocid="match.toss_tails.button"
                    className="w-24 h-24 rounded-full font-black text-lg flex flex-col items-center justify-center gap-1 transition-all"
                    style={{
                      background: "linear-gradient(135deg, #C0C0C0, #808080)",
                      color: "#fff",
                      boxShadow: "0 4px 20px rgba(192,192,192,0.3)",
                    }}
                  >
                    <span className="text-2xl">🦁</span>
                    TAILS
                  </button>
                </div>
              </div>
            )}

            {tossStep === "result" && (
              <div className="text-center">
                <motion.div
                  initial={{ rotateY: 0 }}
                  animate={{ rotateY: 720 }}
                  transition={{ duration: 1, ease: "easeOut" }}
                  className="text-6xl mb-4"
                >
                  🪙
                </motion.div>
                <p
                  className="text-2xl font-black mb-2"
                  style={{
                    color: tossResult === "heads" ? "#FFD700" : "#C0C0C0",
                  }}
                >
                  {tossResult?.toUpperCase()}!
                </p>
                <p
                  className="text-lg font-bold mb-1"
                  style={{ color: userWonToss ? "#35E06F" : "#E53935" }}
                >
                  {userWonToss ? "You won the toss!" : "You lost the toss!"}
                </p>
                {!userWonToss && (
                  <p className="text-sm mb-4" style={{ color: "#A7B3C2" }}>
                    Opponent will decide...
                  </p>
                )}
                {userWonToss ? (
                  <div className="mt-4">
                    <p
                      className="text-sm font-semibold mb-3"
                      style={{ color: "#E9EEF5" }}
                    >
                      Choose to:
                    </p>
                    <div className="flex gap-3 justify-center">
                      <button
                        type="button"
                        onClick={() => handleTossChoice("bat")}
                        data-ocid="match.toss_bat.button"
                        className="px-6 py-3 rounded-xl font-black uppercase tracking-wide"
                        style={{
                          background:
                            "linear-gradient(135deg, #FF6A2A, #FF9A3D)",
                          color: "#fff",
                          boxShadow: "0 4px 15px rgba(255,106,42,0.3)",
                        }}
                      >
                        🏏 BAT
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTossChoice("bowl")}
                        data-ocid="match.toss_bowl.button"
                        className="px-6 py-3 rounded-xl font-black uppercase tracking-wide"
                        style={{
                          background:
                            "linear-gradient(135deg, #22B8C7, #35E06F)",
                          color: "#fff",
                          boxShadow: "0 4px 15px rgba(34,184,199,0.3)",
                        }}
                      >
                        ⚽ BOWL
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 text-center">
                    <p className="text-sm mb-3" style={{ color: "#A7B3C2" }}>
                      Opponent chose to{" "}
                      <span style={{ color: "#FFD700", fontWeight: "bold" }}>
                        {aiTossDecision === "bat" ? "🏏 BAT" : "⚽ BOWL"}
                      </span>
                    </p>
                    <button
                      type="button"
                      onClick={() => handleTossChoice(aiTossDecision)}
                      data-ocid="match.toss_continue.button"
                      className="px-6 py-3 rounded-xl font-bold uppercase tracking-wide"
                      style={{
                        background: "linear-gradient(135deg, #22B8C7, #35E06F)",
                        color: "#fff",
                      }}
                    >
                      Continue →
                    </button>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  const innings =
    match.isSuperOver && match.superOverPhase === "so_innings1"
      ? (match.superOverInnings1 ?? match.innings2)
      : match.isSuperOver && match.superOverPhase === "so_innings2"
        ? (match.superOverInnings2 ?? match.innings2)
        : match.phase === "innings1"
          ? match.innings1
          : match.innings2;
  const striker = innings ? getPlayer(innings.currentBatterIds[0]) : null;
  const nonStriker = innings ? getPlayer(innings.currentBatterIds[1]) : null;
  const bowler = innings ? getPlayer(innings.currentBowlerId) : null;
  const strikerStats = innings?.batterStats.find(
    (b) => b.playerId === innings.currentBatterIds[0],
  );
  const nonStrikerStats = innings?.batterStats.find(
    (b) => b.playerId === innings.currentBatterIds[1],
  );
  const bowlerStatsCurrent = innings?.bowlerStats.find(
    (b) => b.playerId === innings.currentBowlerId,
  );
  const battingTeam = gameState.teams.find(
    (t) => t.id === innings?.battingTeamId,
  );

  const currentRunRate =
    innings && innings.balls > 0
      ? ((innings.totalRuns / innings.balls) * 6).toFixed(2)
      : "0.00";

  const activeTarget = match.isSuperOver ? match.superOverTarget : match.target;
  const reqRunRate =
    (match.phase === "innings2" || match.isSuperOver) && activeTarget && innings
      ? (
          ((activeTarget - innings.totalRuns) /
            Math.max(1, (match.isSuperOver ? 6 : 120) - innings.balls)) *
          6
        ).toFixed(2)
      : null;

  // Bowler picker candidates — Bowlers + AllRounders first, fallback to anyone who can bowl
  // Also includes any impact player from bench already added to bowlerStats
  const bowlerPickerCandidates = (() => {
    const players = getUserTeamPlayers();
    const primary = players.filter((id) => {
      const p = getPlayer(id);
      return p && (p.role === "Bowler" || p.role === "AllRounder");
    });
    const secondary = players.filter((id) => {
      const p = getPlayer(id);
      return (
        p &&
        p.role !== "Bowler" &&
        p.role !== "AllRounder" &&
        p.bowlingStyle !== "None"
      );
    });
    const base = primary.length >= 5 ? primary : [...primary, ...secondary];
    // Add any impact players from bench who were added to bowlerStats
    const impactBowlerIds = (innings?.bowlerStats ?? [])
      .map((b) => b.playerId)
      .filter((id) => !base.includes(id));
    return [...base, ...impactBowlerIds];
  })();
  const getBowlerOverCount = (pid: number) => {
    const bws = innings?.bowlerStats.find((b) => b.playerId === pid);
    return bws ? Math.floor(bws.balls / 6) : 0;
  };

  if (match.phase === "result") {
    const finalWinner = match.superOverWinner ?? match.winner;
    const finalResult = match.superOverResult ?? match.result;
    return (
      <div
        className="min-h-screen p-4 md:p-6"
        style={{ background: "#070B14" }}
      >
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <div className="text-6xl mb-4">
              {finalWinner === userTeam.id ? "🏆" : "💫"}
            </div>
            <h1
              className="text-3xl font-black uppercase mb-2"
              style={{
                color: "#E9EEF5",
                fontFamily: "'BricolageGrotesque', sans-serif",
              }}
            >
              {finalResult}
            </h1>
            {match.isSuperOver && (
              <div
                className="inline-block px-4 py-1 rounded-full text-sm font-bold uppercase tracking-wider mb-2"
                style={{
                  background: "rgba(255,215,0,0.15)",
                  color: "#FFD700",
                  border: "1px solid rgba(255,215,0,0.3)",
                }}
              >
                ⚡ SUPER OVER FINISH
              </div>
            )}
            {match.venue && (
              <p className="text-sm mb-1" style={{ color: "#6B7A8F" }}>
                📍 {match.venue}
              </p>
            )}
            {match.playerOfMatch && (
              <p className="text-sm" style={{ color: "#FF9A3D" }}>
                ⭐ Player of the Match: {getPlayer(match.playerOfMatch)?.name}
              </p>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <ScoreCard
              innings={match.innings1}
              teams={gameState.teams}
              label="1st Innings"
              impactPlayerId={impactPlayerIds.innings1}
            />
            <ScoreCard
              innings={match.innings2}
              teams={gameState.teams}
              label="2nd Innings"
              impactPlayerId={impactPlayerIds.innings2}
            />
          </div>

          {match.isSuperOver &&
            match.superOverInnings1 &&
            match.superOverInnings2 && (
              <div className="grid md:grid-cols-2 gap-6 mb-6">
                <ScoreCard
                  innings={match.superOverInnings1}
                  teams={gameState.teams}
                  label="Super Over - 1st"
                />
                <ScoreCard
                  innings={match.superOverInnings2}
                  teams={gameState.teams}
                  label="Super Over - 2nd"
                />
              </div>
            )}

          <button
            type="button"
            onClick={finishMatch}
            data-ocid="match.finish.button"
            className="w-full py-3 rounded-lg font-bold uppercase tracking-wider"
            style={{
              background: "linear-gradient(135deg, #FF6A2A, #FF9A3D)",
              color: "#fff",
            }}
          >
            Back to Tournament
          </button>
        </div>
      </div>
    );
  }

  // Super Over in progress banner
  const isSuperOverInProgress =
    match.isSuperOver &&
    (match.superOverPhase === "so_innings1" ||
      match.superOverPhase === "so_innings2");

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: "#070B14" }}>
      <div className="max-w-6xl mx-auto">
        {/* Super Over Banner */}
        {isSuperOverInProgress && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-3 py-2 px-4 rounded-xl text-center font-black uppercase tracking-widest text-sm"
            style={{
              background:
                "linear-gradient(135deg, rgba(255,215,0,0.15), rgba(255,106,42,0.15))",
              border: "1px solid rgba(255,215,0,0.4)",
              color: "#FFD700",
            }}
          >
            ⚡ SUPER OVER —{" "}
            {match.superOverPhase === "so_innings1"
              ? "1st Innings"
              : "2nd Innings"}
          </motion.div>
        )}

        {/* Scoreboard */}
        <div
          className="panel-glass rounded-2xl p-4 mb-4"
          data-ocid="match.scoreboard.panel"
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div
                className="text-xs uppercase tracking-widest mb-1"
                style={{ color: "#A7B3C2" }}
              >
                {battingTeam?.name} BATTING
                {match.venue && (
                  <span className="ml-3" style={{ color: "#6B7A8F" }}>
                    📍 {match.venue}
                  </span>
                )}
              </div>
              <div
                className="text-4xl font-black"
                style={{
                  color: "#E9EEF5",
                  fontFamily: "'BricolageGrotesque', sans-serif",
                }}
              >
                {innings?.totalRuns}/{innings?.wickets}
                <span className="text-lg ml-2" style={{ color: "#A7B3C2" }}>
                  ({overStr})
                </span>
              </div>
              {(match.phase === "innings2" || isSuperOverInProgress) &&
                activeTarget && (
                  <div className="text-sm" style={{ color: "#FF9A3D" }}>
                    Target: {activeTarget} | Need:{" "}
                    {Math.max(0, activeTarget - (innings?.totalRuns ?? 0))} from{" "}
                    {Math.max(
                      0,
                      (isSuperOverInProgress ? 6 : 120) - (innings?.balls ?? 0),
                    )}{" "}
                    balls
                  </div>
                )}
            </div>
            <div className="flex gap-4 text-center">
              <div>
                <div className="text-xs" style={{ color: "#A7B3C2" }}>
                  CRR
                </div>
                <div className="font-bold" style={{ color: "#35E06F" }}>
                  {currentRunRate}
                </div>
              </div>
              {reqRunRate && (
                <div>
                  <div className="text-xs" style={{ color: "#A7B3C2" }}>
                    RRR
                  </div>
                  <div
                    className="font-bold"
                    style={{
                      color:
                        Number.parseFloat(reqRunRate) > 12
                          ? "#E53935"
                          : "#FF9A3D",
                    }}
                  >
                    {reqRunRate}
                  </div>
                </div>
              )}
              <div>
                <div className="text-xs" style={{ color: "#A7B3C2" }}>
                  INNINGS
                </div>
                <div className="font-bold" style={{ color: "#22B8C7" }}>
                  {isSuperOverInProgress
                    ? `SO ${match.superOverPhase === "so_innings1" ? "1" : "2"}`
                    : match.phase === "innings1"
                      ? "1st"
                      : "2nd"}
                </div>
              </div>
              {activeImpactPlayerId && (
                <div>
                  <div className="text-xs" style={{ color: "#A7B3C2" }}>
                    IMPACT
                  </div>
                  <div
                    className="font-bold text-xs"
                    style={{ color: "#FF9A3D" }}
                  >
                    ⚡ {getPlayer(activeImpactPlayerId)?.name?.split(" ").pop()}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          {/* Commentary + Current Players */}
          <div className="lg:col-span-2 space-y-4">
            {/* Current Batters */}
            <div className="panel-glow rounded-xl p-4 grid grid-cols-2 gap-3">
              {[
                { player: striker, stats: strikerStats, label: "STRIKER ★" },
                {
                  player: nonStriker,
                  stats: nonStrikerStats,
                  label: "NON-STRIKER",
                },
              ].map((b, i) => {
                const isImpact = b.player?.id === activeImpactPlayerId;
                return (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: static
                    key={i}
                    className="rounded-lg p-3"
                    style={{ background: "rgba(15,34,51,0.6)" }}
                    data-ocid={`match.batter.item.${i + 1}`}
                  >
                    <div
                      className="text-xs mb-1 font-bold uppercase"
                      style={{ color: i === 0 ? "#FF9A3D" : "#A7B3C2" }}
                    >
                      {b.label}
                    </div>
                    <div
                      className="font-semibold text-sm flex items-center gap-1"
                      style={{ color: "#E9EEF5" }}
                    >
                      {b.player?.name ?? "-"}
                      {isImpact && (
                        <span
                          className="text-xs font-black px-1 rounded"
                          style={{
                            background: "rgba(255,154,61,0.2)",
                            color: "#FF9A3D",
                            border: "1px solid rgba(255,154,61,0.4)",
                          }}
                        >
                          ⚡ IP
                        </span>
                      )}
                    </div>
                    <div className="text-xs mt-1" style={{ color: "#35E06F" }}>
                      {b.stats?.runs ?? 0}({b.stats?.balls ?? 0}) 4s:
                      {b.stats?.fours ?? 0} 6s:{b.stats?.sixes ?? 0}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bowler */}
            <div
              className="panel-glow rounded-xl p-3 flex items-center gap-3"
              data-ocid="match.bowler.panel"
            >
              <div
                className="text-xs font-bold uppercase"
                style={{ color: "#22B8C7" }}
              >
                BOWLING:
              </div>
              <div
                className="font-semibold text-sm flex items-center gap-1"
                style={{ color: "#E9EEF5" }}
              >
                {bowler?.name}
                {bowler?.id === activeImpactPlayerId && (
                  <span
                    className="text-xs font-black px-1 rounded"
                    style={{
                      background: "rgba(255,154,61,0.2)",
                      color: "#FF9A3D",
                      border: "1px solid rgba(255,154,61,0.4)",
                    }}
                  >
                    ⚡ IP
                  </span>
                )}
              </div>
              <div className="text-xs ml-2" style={{ color: "#A7B3C2" }}>
                {bowler?.bowlingStyle === "Spin" ? "🌀 Spin" : "💨 Pace"}
              </div>
              <div className="text-xs ml-auto" style={{ color: "#A7B3C2" }}>
                {Math.floor((bowlerStatsCurrent?.balls ?? 0) / 6)}.
                {(bowlerStatsCurrent?.balls ?? 0) % 6} ov •{" "}
                {bowlerStatsCurrent?.runs ?? 0} runs •{" "}
                {bowlerStatsCurrent?.wickets ?? 0} wkts
              </div>
            </div>

            {/* Bowling Figures */}
            {innings &&
              innings.bowlerStats.filter((b) => b.balls > 0).length > 0 && (
                <div
                  className="panel-glow rounded-xl p-3"
                  data-ocid="match.bowling_figures.panel"
                >
                  <h3
                    className="text-xs font-bold uppercase tracking-widest mb-2"
                    style={{ color: "#22B8C7" }}
                  >
                    🎯 Bowling Figures
                  </h3>
                  <div className="space-y-1">
                    {innings.bowlerStats
                      .filter((b) => b.balls > 0)
                      .map((bws, i) => {
                        const bp = getPlayer(bws.playerId);
                        const overs = Math.floor(bws.balls / 6);
                        const balls = bws.balls % 6;
                        const maxed = overs >= 4;
                        const isCurrent =
                          bws.playerId === innings.currentBowlerId;
                        return (
                          <div
                            key={bws.playerId}
                            className="flex items-center justify-between text-xs rounded px-2 py-1"
                            style={{
                              background: isCurrent
                                ? "rgba(34,184,199,0.1)"
                                : "rgba(15,34,51,0.4)",
                              border: isCurrent
                                ? "1px solid rgba(34,184,199,0.3)"
                                : "1px solid transparent",
                            }}
                            data-ocid={`match.bowling_figures.item.${i + 1}`}
                          >
                            <span
                              style={{
                                color: isCurrent ? "#22B8C7" : "#E9EEF5",
                                fontWeight: isCurrent ? 700 : 400,
                              }}
                            >
                              {isCurrent ? "▶ " : ""}
                              {bp?.name ?? "?"}
                            </span>
                            <span style={{ color: "#A7B3C2" }}>
                              {bp?.bowlingStyle === "Spin" ? "🌀" : "💨"}
                            </span>
                            <span
                              style={{
                                color: maxed ? "#E53935" : "#35E06F",
                                fontWeight: 600,
                              }}
                            >
                              {overs}.{balls} ov
                            </span>
                            <span style={{ color: "#FF9A3D" }}>
                              {bws.runs}R {bws.wickets}W
                            </span>
                            <span
                              style={{
                                color: "#A7B3C2",
                                fontSize: "10px",
                              }}
                            >
                              Eco:{" "}
                              {overs > 0
                                ? (bws.runs / (overs + balls / 6)).toFixed(1)
                                : "-"}
                            </span>
                            <span
                              style={{
                                color: maxed ? "#E53935" : "#6B7A8F",
                                fontSize: "10px",
                              }}
                            >
                              {overs}/4
                            </span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

            {/* Ball result animation */}
            <AnimatePresence>
              {ballResultAnim && (
                <motion.div
                  key={ballResultAnim}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1.1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.3 }}
                  className="text-center py-3"
                >
                  <span
                    className="text-3xl font-black"
                    style={{
                      color:
                        ballResultAnim === "SIX!" ||
                        ballResultAnim === "WICKET!"
                          ? "#FF9A3D"
                          : ballResultAnim === "FOUR!"
                            ? "#35E06F"
                            : ballResultAnim === "OUT!" ||
                                ballResultAnim === "OUT"
                              ? "#E53935"
                              : "#E9EEF5",
                      fontFamily: "'BricolageGrotesque', sans-serif",
                    }}
                  >
                    {ballResultAnim}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Commentary */}
            <div className="panel-glow rounded-xl p-4">
              <h3
                className="text-xs font-bold uppercase tracking-widest mb-3"
                style={{ color: "#A7B3C2" }}
              >
                Commentary
              </h3>
              <div
                className="space-y-1.5 max-h-40 overflow-y-auto scrollbar-dark"
                data-ocid="match.commentary.list"
              >
                {commentary.map((c, i) => (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: commentary
                    key={i}
                    className="text-xs"
                    style={{ color: c.color }}
                  >
                    {c.text}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="space-y-4">
            {/* Impact Player Button */}
            {canUseImpactPlayer && (
              <motion.button
                type="button"
                onClick={() => setShowImpactModal(true)}
                data-ocid="match.impact_player.open_modal_button"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full py-2.5 rounded-xl font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(255,154,61,0.15), rgba(255,106,42,0.2))",
                  border: "1px solid rgba(255,154,61,0.5)",
                  color: "#FF9A3D",
                  boxShadow: "0 0 12px rgba(255,154,61,0.15)",
                }}
              >
                <span className="text-lg">⚡</span> USE IMPACT PLAYER
              </motion.button>
            )}

            {/* Bowler Picker Prompt */}
            {showBowlerPicker && userBowling && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="panel-glow rounded-xl p-4"
                style={{ border: "1px solid rgba(34,184,199,0.5)" }}
                data-ocid="match.bowler_picker.panel"
              >
                <h3
                  className="text-xs font-bold uppercase tracking-widest mb-3"
                  style={{ color: "#22B8C7" }}
                >
                  🎯 Select Bowler for Next Over
                </h3>
                <div className="space-y-1.5">
                  {[...bowlerPickerCandidates]
                    .sort((a, b) => {
                      const pa = getPlayer(a);
                      const pb = getPlayer(b);
                      // Bowlers first, AllRounders second, others last
                      const order = (r: string | undefined) =>
                        r === "Bowler" ? 0 : r === "AllRounder" ? 1 : 2;
                      return order(pa?.role) - order(pb?.role);
                    })
                    .map((id, i) => {
                      const p = getPlayer(id);
                      const overs = getBowlerOverCount(id);
                      const maxed = overs >= 4;
                      const isCurrent = id === currentInnings?.currentBowlerId;
                      const styleLabel =
                        p?.bowlingStyle === "Spin"
                          ? "🌀 Spin"
                          : p?.bowlingStyle === "Fast"
                            ? "💨 Fast"
                            : p?.bowlingStyle === "Medium"
                              ? "💨 Med"
                              : "—";
                      return (
                        <button
                          type="button"
                          key={id}
                          onClick={() =>
                            !maxed && !isCurrent && handleSelectBowler(id)
                          }
                          disabled={maxed || isCurrent}
                          data-ocid={`match.bowler_picker.item.${i + 1}`}
                          className="w-full flex items-center justify-between p-2.5 rounded-lg transition-all text-left disabled:opacity-40"
                          style={{
                            background: isCurrent
                              ? "rgba(255,154,61,0.07)"
                              : "rgba(15,34,51,0.6)",
                            border: isCurrent
                              ? "1px solid rgba(255,154,61,0.4)"
                              : maxed
                                ? "1px solid rgba(229,57,53,0.3)"
                                : "1px solid rgba(30,58,74,0.5)",
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="text-sm font-semibold"
                              style={{ color: maxed ? "#6B7A8F" : "#E9EEF5" }}
                            >
                              {p?.name}
                            </span>
                            <span
                              className="text-xs"
                              style={{ color: "#6B7A8F" }}
                            >
                              {styleLabel}
                            </span>
                            {isCurrent && (
                              <span
                                className="text-xs px-1 rounded"
                                style={{
                                  background: "rgba(255,154,61,0.15)",
                                  color: "#FF9A3D",
                                }}
                              >
                                just bowled
                              </span>
                            )}
                            {maxed && (
                              <span
                                className="text-xs px-1 rounded"
                                style={{
                                  background: "rgba(229,57,53,0.15)",
                                  color: "#E53935",
                                }}
                              >
                                quota full
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className="text-xs"
                              style={{ color: "#A7B3C2" }}
                            >
                              {p?.role === "Bowler"
                                ? "Bowl"
                                : p?.role === "AllRounder"
                                  ? "AR"
                                  : p?.role}
                            </span>
                            <span
                              className="text-xs font-bold min-w-[40px] text-right"
                              style={{
                                color: maxed
                                  ? "#E53935"
                                  : overs >= 3
                                    ? "#FF9A3D"
                                    : "#35E06F",
                              }}
                            >
                              {overs}/4 ov
                            </span>
                          </div>
                        </button>
                      );
                    })}
                </div>
              </motion.div>
            )}

            {userBatting && (
              <div
                className="panel-glow rounded-xl p-4"
                data-ocid="match.batting.controls"
              >
                <h3
                  className="text-xs font-bold uppercase tracking-widest mb-3"
                  style={{ color: "#35E06F" }}
                >
                  🏏 BATTING CONTROLS
                </h3>

                <div className="mb-3">
                  <div className="text-xs mb-2" style={{ color: "#A7B3C2" }}>
                    Shot Type
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {SHOT_TYPES.map((s) => (
                      <button
                        type="button"
                        key={s}
                        onClick={() => setSelectedShot(s)}
                        data-ocid={`match.shot_${s.toLowerCase()}.toggle`}
                        className="py-1.5 rounded text-xs font-bold transition-all"
                        style={{
                          background:
                            selectedShot === s
                              ? "rgba(53,224,111,0.2)"
                              : "rgba(15,34,51,0.6)",
                          color: selectedShot === s ? "#35E06F" : "#A7B3C2",
                          border:
                            selectedShot === s
                              ? "1px solid #35E06F"
                              : "1px solid rgba(30,58,74,0.5)",
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-3">
                  <div className="text-xs mb-2" style={{ color: "#A7B3C2" }}>
                    Direction
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {DIRECTIONS.map((d) => (
                      <button
                        type="button"
                        key={d}
                        onClick={() => setSelectedDir(d)}
                        data-ocid={`match.dir_${d.toLowerCase()}.toggle`}
                        className="py-1.5 rounded text-xs font-bold transition-all"
                        style={{
                          background:
                            selectedDir === d
                              ? "rgba(53,224,111,0.2)"
                              : "rgba(15,34,51,0.6)",
                          color: selectedDir === d ? "#35E06F" : "#A7B3C2",
                          border:
                            selectedDir === d
                              ? "1px solid #35E06F"
                              : "1px solid rgba(30,58,74,0.5)",
                        }}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handlePlayBall}
                  disabled={(match.phase as string) === "result"}
                  data-ocid="match.play_ball.button"
                  className="w-full py-3 rounded-lg font-black uppercase tracking-wider text-sm transition-all"
                  style={{
                    background: "linear-gradient(135deg, #FF6A2A, #FF9A3D)",
                    color: "#fff",
                    boxShadow: "0 4px 15px rgba(255,106,42,0.3)",
                  }}
                >
                  ▶ PLAY BALL
                </button>
                {/* Auto Simulate row - batting */}
                <div className="grid grid-cols-4 gap-1 mt-2">
                  {([1, 5, 10, 20] as number[]).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => handleAutoSimulate(n)}
                      disabled={
                        (match.phase as string) === "result" || autoSimBalls > 0
                      }
                      data-ocid={`match.autosim_bat_${n}.button`}
                      className="py-2 rounded text-xs font-bold uppercase transition-all disabled:opacity-40"
                      style={{
                        background: "rgba(34,184,199,0.1)",
                        color: autoSimBalls > 0 ? "#FF9A3D" : "#22B8C7",
                        border: "1px solid rgba(34,184,199,0.4)",
                      }}
                    >
                      {autoSimBalls > 0 ? "..." : `SIM ${n}`}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {userBowling && (
              <div
                className="panel-glow rounded-xl p-4"
                data-ocid="match.bowling.controls"
              >
                <h3
                  className="text-xs font-bold uppercase tracking-widest mb-3"
                  style={{ color: "#22B8C7" }}
                >
                  ⚽ BOWLING CONTROLS
                  {isSpinBowler && (
                    <span
                      className="ml-2 text-xs font-bold px-2 py-0.5 rounded"
                      style={{
                        background: "rgba(255,154,61,0.1)",
                        color: "#FF9A3D",
                        border: "1px solid rgba(255,154,61,0.3)",
                      }}
                    >
                      🌀 SPINNER
                    </span>
                  )}
                </h3>

                <div className="mb-3">
                  <div className="text-xs mb-2" style={{ color: "#A7B3C2" }}>
                    Ball Type
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {BALL_TYPES.map((b) => (
                      <button
                        type="button"
                        key={b.key}
                        onClick={() => setSelectedBall(b.key)}
                        data-ocid={`match.ball_${b.key.toLowerCase()}.toggle`}
                        className="py-1.5 rounded text-xs font-bold transition-all"
                        style={{
                          background:
                            selectedBall === b.key
                              ? "rgba(34,184,199,0.2)"
                              : "rgba(15,34,51,0.6)",
                          color: selectedBall === b.key ? "#22B8C7" : "#A7B3C2",
                          border:
                            selectedBall === b.key
                              ? "1px solid #22B8C7"
                              : "1px solid rgba(30,58,74,0.5)",
                        }}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-3">
                  <div className="text-xs mb-2" style={{ color: "#A7B3C2" }}>
                    Speed
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {SPEEDS.map((s) => (
                      <button
                        type="button"
                        key={s}
                        onClick={() => setSelectedSpeed(s)}
                        data-ocid={`match.speed_${s.toLowerCase()}.toggle`}
                        className="py-1.5 rounded text-xs font-bold transition-all"
                        style={{
                          background:
                            selectedSpeed === s
                              ? "rgba(34,184,199,0.2)"
                              : "rgba(15,34,51,0.6)",
                          color: selectedSpeed === s ? "#22B8C7" : "#A7B3C2",
                          border:
                            selectedSpeed === s
                              ? "1px solid #22B8C7"
                              : "1px solid rgba(30,58,74,0.5)",
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleBowl}
                  disabled={
                    (match.phase as string) === "result" || showBowlerPicker
                  }
                  data-ocid="match.bowl.button"
                  className="w-full py-3 rounded-lg font-black uppercase tracking-wider text-sm transition-all disabled:opacity-50"
                  style={{
                    background: showBowlerPicker
                      ? "rgba(34,184,199,0.3)"
                      : "linear-gradient(135deg, #22B8C7, #35E06F)",
                    color: "#fff",
                    boxShadow: showBowlerPicker
                      ? "none"
                      : "0 4px 15px rgba(34,184,199,0.3)",
                  }}
                >
                  {showBowlerPicker ? "⏳ Select Bowler First" : "⚽ BOWL"}
                </button>
                {/* Auto Simulate row - bowling */}
                <div className="grid grid-cols-4 gap-1 mt-2">
                  {([1, 5, 10, 20] as number[]).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => handleAutoSimulate(n)}
                      disabled={
                        (match.phase as string) === "result" ||
                        showBowlerPicker ||
                        autoSimBalls > 0
                      }
                      data-ocid={`match.autosim_bowl_${n}.button`}
                      className="py-2 rounded text-xs font-bold uppercase transition-all disabled:opacity-40"
                      style={{
                        background: "rgba(34,184,199,0.1)",
                        color: autoSimBalls > 0 ? "#FF9A3D" : "#22B8C7",
                        border: "1px solid rgba(34,184,199,0.4)",
                      }}
                    >
                      {autoSimBalls > 0 ? "..." : `SIM ${n}`}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Mini scorecard */}
            <div className="panel-glass rounded-xl p-4">
              <h3
                className="text-xs font-bold uppercase tracking-widest mb-3"
                style={{ color: "#A7B3C2" }}
              >
                Batting
              </h3>
              <div
                className="space-y-1 text-xs"
                data-ocid="match.batting_stats.list"
              >
                {innings?.batterStats
                  .filter(
                    (b) =>
                      b.balls > 0 ||
                      b.isOut ||
                      innings.currentBatterIds.includes(b.playerId),
                  )
                  .slice(0, 5)
                  .map((b, i) => {
                    const isImpact = b.playerId === activeImpactPlayerId;
                    return (
                      <div
                        key={b.playerId}
                        className="flex justify-between items-center"
                        data-ocid={`match.batter_stat.item.${i + 1}`}
                      >
                        <span
                          className="flex items-center gap-1"
                          style={{
                            color:
                              innings.currentBatterIds[0] === b.playerId
                                ? "#FF9A3D"
                                : b.isOut
                                  ? "#A7B3C2"
                                  : "#E9EEF5",
                          }}
                        >
                          {innings.currentBatterIds[0] === b.playerId
                            ? "* "
                            : ""}
                          {getPlayer(b.playerId)?.name?.split(" ")[1] ?? "?"}
                          {isImpact && (
                            <span
                              style={{ color: "#FF9A3D", fontSize: "10px" }}
                            >
                              ⚡
                            </span>
                          )}
                        </span>
                        <span style={{ color: "#35E06F" }}>
                          {b.runs}({b.balls})
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Impact Player Modal */}
      <Dialog open={showImpactModal} onOpenChange={setShowImpactModal}>
        <DialogContent
          className="max-w-sm"
          style={{
            background: "#070B14",
            border: "1px solid rgba(255,154,61,0.3)",
          }}
          data-ocid="match.impact_player.dialog"
        >
          <DialogHeader>
            <DialogTitle
              className="text-lg font-black uppercase tracking-wide flex items-center gap-2"
              style={{ color: "#E9EEF5" }}
            >
              <span style={{ color: "#FF9A3D" }}>⚡</span> Impact Player
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs mb-3" style={{ color: "#A7B3C2" }}>
            {userBowling
              ? "Bring in a bowler from the bench. They will be added to your bowling lineup this innings. You can only use this once per innings."
              : "Bring in a batter from the bench. They will be added to your batting lineup this innings. You can only use this once per innings."}
          </p>
          {benchPlayers.length === 0 ? (
            <div
              className="text-center py-6 text-sm"
              style={{ color: "#A7B3C2" }}
              data-ocid="match.impact_player.empty_state"
            >
              No bench players available.
            </div>
          ) : (
            <ScrollArea className="max-h-72">
              <div className="space-y-2">
                {benchPlayers.map((id, i) => {
                  const p = getPlayer(id);
                  if (!p) return null;
                  return (
                    <button
                      type="button"
                      key={id}
                      onClick={() => handleSelectImpactPlayer(id)}
                      data-ocid={`match.impact_player.item.${i + 1}`}
                      className="w-full flex items-center justify-between p-3 rounded-lg transition-all text-left"
                      style={{
                        background: "rgba(15,34,51,0.6)",
                        border: "1px solid rgba(30,58,74,0.5)",
                      }}
                      onMouseEnter={(e) => {
                        (
                          e.currentTarget as HTMLButtonElement
                        ).style.borderColor = "rgba(255,154,61,0.5)";
                        (
                          e.currentTarget as HTMLButtonElement
                        ).style.background = "rgba(255,154,61,0.08)";
                      }}
                      onMouseLeave={(e) => {
                        (
                          e.currentTarget as HTMLButtonElement
                        ).style.borderColor = "rgba(30,58,74,0.5)";
                        (
                          e.currentTarget as HTMLButtonElement
                        ).style.background = "rgba(15,34,51,0.6)";
                      }}
                    >
                      <div>
                        <div
                          className="font-semibold text-sm"
                          style={{ color: "#E9EEF5" }}
                        >
                          {p.name}
                        </div>
                        <div
                          className="text-xs mt-0.5"
                          style={{ color: "#A7B3C2" }}
                        >
                          {p.role} • {p.country === "India" ? "🇮🇳" : "🌍"}{" "}
                          {p.country}
                        </div>
                      </div>
                      <div className="text-right">
                        {(p.role === "Batsman" ||
                          p.role === "WicketKeeper" ||
                          p.role === "AllRounder") && (
                          <div className="text-xs" style={{ color: "#35E06F" }}>
                            Bat avg: {p.battingAvg}
                          </div>
                        )}
                        {(p.role === "Bowler" || p.role === "AllRounder") && (
                          <div className="text-xs" style={{ color: "#22B8C7" }}>
                            Bowl avg: {p.bowlingAvg}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          )}
          <div className="flex justify-end mt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowImpactModal(false)}
              data-ocid="match.impact_player.cancel_button"
              style={{ color: "#A7B3C2" }}
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ScoreCard({
  innings,
  teams,
  label,
  impactPlayerId,
}: {
  innings: InningsState;
  teams: any[];
  label: string;
  impactPlayerId?: number;
}) {
  const team = teams.find((t: any) => t.id === innings.battingTeamId);
  return (
    <div className="panel-glow rounded-2xl p-4">
      <h3
        className="text-xs font-bold uppercase tracking-widest mb-3"
        style={{ color: "#A7B3C2" }}
      >
        {label} - {team?.name}
      </h3>
      <div
        className="text-2xl font-black mb-3"
        style={{
          color: "#E9EEF5",
          fontFamily: "'BricolageGrotesque', sans-serif",
        }}
      >
        {innings.totalRuns}/{innings.wickets}
        <span className="text-sm ml-2" style={{ color: "#A7B3C2" }}>
          ({Math.floor(innings.balls / 6)}.{innings.balls % 6} ov)
        </span>
      </div>

      {/* Batting figures */}
      <div className="space-y-1 text-xs mb-3">
        {innings.batterStats
          .filter((b) => b.balls > 0 || b.isOut)
          .map((b, i) => (
            <div
              key={b.playerId}
              className="flex justify-between items-center"
              data-ocid={`scorecard.batter.item.${i + 1}`}
            >
              <span
                className="flex items-center gap-1"
                style={{ color: b.isOut ? "#A7B3C2" : "#E9EEF5" }}
              >
                {getPlayer(b.playerId)?.name}
                {b.playerId === impactPlayerId && (
                  <span style={{ color: "#FF9A3D", fontSize: "10px" }}>⚡</span>
                )}
              </span>
              <span style={{ color: b.isOut ? "#A7B3C2" : "#35E06F" }}>
                {b.runs}({b.balls}){b.fours > 0 ? ` 4s:${b.fours}` : ""}
                {b.sixes > 0 ? ` 6s:${b.sixes}` : ""}
              </span>
            </div>
          ))}
      </div>

      {/* Bowling figures */}
      {innings.bowlerStats.filter((bw) => bw.balls > 0).length > 0 && (
        <>
          <div
            className="text-xs font-bold uppercase tracking-widest mb-1.5 pt-2"
            style={{
              color: "#22B8C7",
              borderTop: "1px solid rgba(34,184,199,0.2)",
            }}
          >
            🎯 Bowling
          </div>
          <div className="space-y-1 text-xs">
            {innings.bowlerStats
              .filter((bw) => bw.balls > 0)
              .map((bw, i) => {
                const bp = getPlayer(bw.playerId);
                const ovs = Math.floor(bw.balls / 6);
                const bls = bw.balls % 6;
                return (
                  <div
                    key={bw.playerId}
                    className="flex justify-between items-center"
                    data-ocid={`scorecard.bowler.item.${i + 1}`}
                  >
                    <span
                      className="flex items-center gap-1"
                      style={{ color: "#E9EEF5" }}
                    >
                      {bp?.bowlingStyle === "Spin" ? "🌀" : "💨"}
                      {bp?.name ?? "?"}
                    </span>
                    <span style={{ color: "#FF9A3D" }}>
                      {ovs}.{bls}-{bw.runs}-{bw.wickets}W{" "}
                      <span style={{ color: "#A7B3C2" }}>
                        (Eco:{" "}
                        {ovs > 0 ? (bw.runs / (ovs + bls / 6)).toFixed(1) : "-"}
                        )
                      </span>
                    </span>
                  </div>
                );
              })}
          </div>
        </>
      )}
    </div>
  );
}
