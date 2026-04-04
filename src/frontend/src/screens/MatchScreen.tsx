import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
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
  phase: "setup" | "innings1" | "innings2" | "result";
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
  teamPlayers: number[],
): InningsState {
  const openingBat = teamPlayers.slice(0, 2);
  const bowlerCandidates = teamPlayers.filter((id) => {
    const p = getPlayer(id);
    return p && (p.role === "Bowler" || p.role === "AllRounder");
  });
  const firstBowler = bowlerCandidates[0] ?? teamPlayers[10] ?? teamPlayers[0];

  const batStats: BatterStats[] = teamPlayers.map((id) => ({
    playerId: id,
    runs: 0,
    balls: 0,
    fours: 0,
    sixes: 0,
    isOut: false,
  }));
  const bowlStats = teamPlayers.map((id) => ({
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
const BALL_TYPES: { key: BallType; label: string }[] = [
  { key: "INSWING", label: "INSWING" },
  { key: "OUTSWING", label: "OUTSWING" },
  { key: "LEG_CUTTER", label: "LEG CUT" },
  { key: "OFF_CUTTER", label: "OFF CUT" },
  { key: "BOUNCER", label: "BOUNCER" },
  { key: "SLIDER", label: "SLIDER" },
  { key: "YORKER", label: "YORKER" },
];
const SPEEDS: BowlingSpeed[] = ["SLOW", "MEDIUM", "FAST"];

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

  const startMatch = useCallback(
    (opponentId: number) => {
      const tossWinner = Math.random() > 0.5 ? 0 : opponentId;
      const tossChoice: "bat" | "bowl" = Math.random() > 0.5 ? "bat" : "bowl";

      const userBatsFirst =
        (tossWinner === 0 && tossChoice === "bat") ||
        (tossWinner === opponentId && tossChoice === "bowl");
      const battingFirst = userBatsFirst ? 0 : opponentId;
      const bowlingFirst = userBatsFirst ? opponentId : 0;

      const battingPlayers =
        battingFirst === 0
          ? getUserTeamPlayers()
          : getOpponentPlayers(opponentId);
      const innings1 = initInnings(
        createEmptyInnings(battingFirst, bowlingFirst),
        battingPlayers,
      );
      const innings2 = createEmptyInnings(bowlingFirst, battingFirst);

      const newMatch: ExtendedMatch = {
        id: Date.now(),
        team1Id: 0,
        team2Id: opponentId,
        tossWinner,
        tossChoice,
        phase: "innings1",
        innings1,
        innings2,
        matchType: "league",
        impactPlayerUsed1: false,
        impactPlayerUsed2: false,
        currentMatch_userBatting: battingFirst === 0,
      };

      updateGameState((prev) => ({ ...prev, currentMatch: newMatch as any }));

      const tossWinnerName =
        tossWinner === 0
          ? userTeam.name
          : gameState.teams.find((t) => t.id === opponentId)?.name;
      toast.success(
        `${tossWinnerName} won the toss and chose to ${tossChoice}!`,
      );
      setCommentary([
        {
          text: `🏏 Match started! ${tossWinnerName} won the toss and chose to ${tossChoice}.`,
          color: "#22B8C7",
        },
      ]);
    },
    [
      getUserTeamPlayers,
      getOpponentPlayers,
      updateGameState,
      userTeam.name,
      gameState.teams,
    ],
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
    (outcome: BallOutcome, inningsKey: "innings1" | "innings2") => {
      updateGameState((prev) => {
        if (!prev.currentMatch) return prev;
        const match = prev.currentMatch as ExtendedMatch;
        const innings =
          inningsKey === "innings1" ? match.innings1 : match.innings2;

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
            innings.battingTeamId === 0
              ? getUserTeamPlayers()
              : getOpponentPlayers(match.team2Id);
          const batted = innings.batterStats
            .filter((bs) => bs.balls > 0 || bs.isOut)
            .map((bs) => bs.playerId);
          const nextBatter =
            battingTeamPlayers.find(
              (id) => !batted.includes(id) && id !== newBatterIds[1],
            ) ?? -1;
          if (nextBatter !== -1) {
            newBatterIds = [nextBatter, newBatterIds[1]] as [number, number];
          }
        }

        let nextBowlerId = innings.currentBowlerId;
        if (
          newBalls > 0 &&
          newBalls % 6 === 0 &&
          !outcome.isWide &&
          !outcome.isNoBall
        ) {
          newBatterIds = [newBatterIds[1], newBatterIds[0]];
          const bowlingTeamPlayers =
            innings.bowlingTeamId === 0
              ? getUserTeamPlayers()
              : getOpponentPlayers(match.team2Id);
          const bowlers = bowlingTeamPlayers.filter((id) => {
            const p = getPlayer(id);
            return p && (p.role === "Bowler" || p.role === "AllRounder");
          });
          const currentBowlerIdx = bowlers.indexOf(innings.currentBowlerId);
          nextBowlerId =
            bowlers[(currentBowlerIdx + 1) % Math.max(bowlers.length, 1)] ??
            bowlingTeamPlayers[bowlingTeamPlayers.length - 1];
        }

        const inningsOver = newBalls >= 120 || newWickets >= 10;
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
              bat2TeamId === 0
                ? getUserTeamPlayers()
                : getOpponentPlayers(match.team2Id);

            const newInnings2 = initInnings(
              createEmptyInnings(bat2TeamId, bowl2TeamId),
              bat2Players,
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
                currentMatch_userBatting: bat2TeamId === 0,
              } as any,
            };
          }

          // Match over
          const target2 = match.target ?? 0;
          if (newWickets >= 10 && newRuns < target2) {
            winner = innings.bowlingTeamId;
            const runs2 = target2 - 1 - newRuns;
            result = `${prev.teams.find((t) => t.id === innings.bowlingTeamId)?.name} won by ${runs2} runs`;
          } else if (newRuns >= target2) {
            winner = innings.battingTeamId;
            const wkts = 10 - newWickets;
            result = `${prev.teams.find((t) => t.id === innings.battingTeamId)?.name} won by ${wkts} wickets`;
          } else {
            result = "Match tied!";
          }
          newPhase = "result";

          const allBatStats = [
            ...match.innings1.batterStats,
            ...newBatterStats,
          ];
          const topBatter = allBatStats.sort((a, b) => b.runs - a.runs)[0];
          playerOfMatch = topBatter?.playerId;
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
          } as any,
        };
      });
    },
    [updateGameState, getUserTeamPlayers, getOpponentPlayers],
  );

  const match = gameState.currentMatch as ExtendedMatch | undefined;
  const currentInnings =
    match?.phase === "innings1"
      ? match.innings1
      : match?.phase === "innings2"
        ? match.innings2
        : null;
  const userBatting = currentInnings?.battingTeamId === 0;
  const userBowling = currentInnings?.bowlingTeamId === 0;

  const oversNum = currentInnings ? Math.floor(currentInnings.balls / 6) : 0;
  const ballsNum = currentInnings ? currentInnings.balls % 6 : 0;
  const overStr = `${oversNum}.${ballsNum}`;

  const handlePlayBall = useCallback(() => {
    if (!match || match.phase === "result") return;
    const innings =
      match.phase === "innings1" ? match.innings1 : match.innings2;
    if (!userBatting) return;

    const striker = getPlayer(innings.currentBatterIds[0]);
    const bowler = getPlayer(innings.currentBowlerId);
    if (!striker || !bowler) return;

    const isLastOver = innings.balls >= 114;
    const outcome = simulateBall(
      selectedShot,
      selectedDir,
      selectedBall,
      selectedSpeed,
      striker,
      bowler,
      innings.balls % 6,
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
    applyBallOutcome(outcome, match.phase as "innings1" | "innings2");
  }, [
    match,
    userBatting,
    selectedShot,
    selectedDir,
    selectedBall,
    selectedSpeed,
    overStr,
    addCommentary,
    applyBallOutcome,
  ]);

  const handleBowl = useCallback(() => {
    if (!match || match.phase === "result") return;
    const innings =
      match.phase === "innings1" ? match.innings1 : match.innings2;
    if (!userBowling) return;

    const striker = getPlayer(innings.currentBatterIds[0]);
    const bowler = getPlayer(innings.currentBowlerId);
    if (!striker || !bowler) return;

    const isLastOver = innings.balls >= 114;
    const aiShots: ShotType[] = ["NORMAL", "AGGRESSIVE", "DEFENSIVE"];
    const aiDirs: ShotDirection[] = ["GROUNDED", "LOFTED"];
    const outcome = simulateBall(
      aiShots[Math.floor(Math.random() * 3)],
      aiDirs[Math.floor(Math.random() * 2)],
      selectedBall,
      selectedSpeed,
      striker,
      bowler,
      innings.balls % 6,
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
    applyBallOutcome(outcome, match.phase as "innings1" | "innings2");
  }, [
    match,
    userBowling,
    selectedBall,
    selectedSpeed,
    overStr,
    addCommentary,
    applyBallOutcome,
  ]);

  // AI auto-simulation when AI is batting
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    if (!match || match.phase === "result") return;
    const innings =
      match.phase === "innings1" ? match.innings1 : match.innings2;
    if (innings.battingTeamId === 0) return; // user batting - don't auto sim

    const timer = setTimeout(() => {
      const striker = getPlayer(innings.currentBatterIds[0]);
      const bowler = getPlayer(innings.currentBowlerId);
      if (!striker || !bowler) return;

      const isLastOver = innings.balls >= 114;
      const outcome = simulateAIBall(
        striker,
        bowler,
        innings.balls % 6,
        isLastOver,
        match.target,
        innings.totalRuns,
        120 - innings.balls,
      );

      const resultText = outcome.isWicket
        ? "OUT!"
        : outcome.isSix
          ? "SIX!"
          : outcome.isFour
            ? "FOUR!"
            : outcome.runs === 0
              ? "DOT"
              : `${outcome.runs}`;
      const resultColor = outcome.isWicket
        ? "#E53935"
        : outcome.isSix
          ? "#FF9A3D"
          : outcome.isFour
            ? "#35E06F"
            : "#A7B3C2";

      addCommentary(
        `${overStr} ${outcome.commentary}`,
        resultColor,
        resultText,
      );
      applyBallOutcome(outcome, match.phase as "innings1" | "innings2");
    }, 1200);

    return () => clearTimeout(timer);
  }, [match?.innings1?.balls, match?.innings2?.balls, match?.phase]);

  const finishMatch = useCallback(() => {
    if (!match || match.phase !== "result") return;

    updateGameState((prev) => {
      const m = prev.currentMatch as ExtendedMatch;
      if (!m) return prev;

      const updatedTeams = prev.teams.map((t) => {
        if (t.id === m.winner) {
          return { ...t, wins: t.wins + 1, points: t.points + 2 };
        }
        if ((t.id === m.team1Id || t.id === m.team2Id) && t.id !== m.winner) {
          return { ...t, losses: t.losses + 1 };
        }
        return t;
      });

      return { ...prev, teams: updatedTeams, currentMatch: undefined };
    });

    onNavigate("tournament");
  }, [match, updateGameState, onNavigate]);

  const opponents = gameState.teams.filter(
    (t) => !t.isUserTeam && t.playingXI.length > 0,
  );

  // Setup screen
  if (!match || match.phase === undefined) {
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

          <div
            className="panel-glow rounded-2xl p-6"
            data-ocid="match.setup.panel"
          >
            <h2
              className="text-sm font-bold uppercase tracking-widest mb-4"
              style={{ color: "#A7B3C2" }}
            >
              Select Opponent
            </h2>
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
          </div>
        </div>
      </div>
    );
  }

  const innings =
    match.phase === "innings1"
      ? match.innings1
      : match.phase === "innings2"
        ? match.innings2
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
  const bowlerStats = innings?.bowlerStats.find(
    (b) => b.playerId === innings.currentBowlerId,
  );
  const battingTeam = gameState.teams.find(
    (t) => t.id === innings?.battingTeamId,
  );

  const currentRunRate =
    innings && innings.balls > 0
      ? ((innings.totalRuns / innings.balls) * 6).toFixed(2)
      : "0.00";
  const reqRunRate =
    match.phase === "innings2" && match.target && innings
      ? (
          ((match.target - innings.totalRuns) /
            Math.max(1, 120 - innings.balls)) *
          6
        ).toFixed(2)
      : null;

  if (match.phase === "result") {
    return (
      <div
        className="min-h-screen p-4 md:p-6"
        style={{ background: "#070B14" }}
      >
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <div className="text-6xl mb-4">
              {match.winner === 0 ? "🏆" : "💫"}
            </div>
            <h1
              className="text-3xl font-black uppercase mb-2"
              style={{
                color: "#E9EEF5",
                fontFamily: "'BricolageGrotesque', sans-serif",
              }}
            >
              {match.result}
            </h1>
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
            />
            <ScoreCard
              innings={match.innings2}
              teams={gameState.teams}
              label="2nd Innings"
            />
          </div>

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

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: "#070B14" }}>
      <div className="max-w-6xl mx-auto">
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
              {match.phase === "innings2" && match.target && (
                <div className="text-sm" style={{ color: "#FF9A3D" }}>
                  Target: {match.target} | Need:{" "}
                  {match.target - (innings?.totalRuns ?? 0)} from{" "}
                  {120 - (innings?.balls ?? 0)} balls
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
                  {match.phase === "innings1" ? "1st" : "2nd"}
                </div>
              </div>
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
              ].map((b, i) => (
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
                    className="font-semibold text-sm"
                    style={{ color: "#E9EEF5" }}
                  >
                    {b.player?.name ?? "-"}
                  </div>
                  <div className="text-xs mt-1" style={{ color: "#35E06F" }}>
                    {b.stats?.runs ?? 0}({b.stats?.balls ?? 0}) 4s:
                    {b.stats?.fours ?? 0} 6s:{b.stats?.sixes ?? 0}
                  </div>
                </div>
              ))}
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
                className="font-semibold text-sm"
                style={{ color: "#E9EEF5" }}
              >
                {bowler?.name}
              </div>
              <div className="text-xs ml-auto" style={{ color: "#A7B3C2" }}>
                {Math.floor((bowlerStats?.balls ?? 0) / 6)}.
                {(bowlerStats?.balls ?? 0) % 6} ov • {bowlerStats?.runs ?? 0}{" "}
                runs • {bowlerStats?.wickets ?? 0} wkts
              </div>
            </div>

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
            {userBatting && (
              <div
                className="panel-glow rounded-xl p-4"
                data-ocid="match.batting.controls"
              >
                <h3
                  className="text-xs font-bold uppercase tracking-widest mb-3"
                  style={{ color: "#35E06F" }}
                >
                  🦅 BATTING CONTROLS
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
                  👊 BOWLING CONTROLS
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
                  disabled={(match.phase as string) === "result"}
                  data-ocid="match.bowl.button"
                  className="w-full py-3 rounded-lg font-black uppercase tracking-wider text-sm transition-all"
                  style={{
                    background: "linear-gradient(135deg, #22B8C7, #35E06F)",
                    color: "#fff",
                    boxShadow: "0 4px 15px rgba(34,184,199,0.3)",
                  }}
                >
                  ⚽ BOWL
                </button>
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
                  .map((b, i) => (
                    <div
                      key={b.playerId}
                      className="flex justify-between"
                      data-ocid={`match.batter_stat.item.${i + 1}`}
                    >
                      <span
                        style={{
                          color:
                            innings.currentBatterIds[0] === b.playerId
                              ? "#FF9A3D"
                              : b.isOut
                                ? "#A7B3C2"
                                : "#E9EEF5",
                        }}
                      >
                        {innings.currentBatterIds[0] === b.playerId ? "* " : ""}
                        {getPlayer(b.playerId)?.name?.split(" ")[1] ?? "?"}
                      </span>
                      <span style={{ color: "#35E06F" }}>
                        {b.runs}({b.balls})
                      </span>
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

function ScoreCard({
  innings,
  teams,
  label,
}: {
  innings: InningsState;
  teams: any[];
  label: string;
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
      </div>
      <div className="space-y-1 text-xs">
        {innings.batterStats
          .filter((b) => b.balls > 0 || b.isOut)
          .map((b, i) => (
            <div
              key={b.playerId}
              className="flex justify-between"
              data-ocid={`scorecard.batter.item.${i + 1}`}
            >
              <span style={{ color: b.isOut ? "#A7B3C2" : "#E9EEF5" }}>
                {getPlayer(b.playerId)?.name}
              </span>
              <span style={{ color: "#35E06F" }}>
                {b.runs}({b.balls}) 4s:{b.fours} 6s:{b.sixes}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}
