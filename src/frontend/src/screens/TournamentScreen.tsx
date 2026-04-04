import { Calendar, CheckCircle2, Trophy } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { PLAYERS, getPlayer } from "../data/players";
import { aiPickPlayingXI, generateLeagueFixtures } from "../engine/gameEngine";
import { simulateAIBall } from "../engine/matchEngine";
import type { GameState, TournamentMatch } from "../types/game";

interface Props {
  gameState: GameState;
  updateGameState: (updater: (prev: GameState) => GameState) => void;
  onNavigate: (phase: GameState["phase"]) => void;
}

export default function TournamentScreen({
  gameState,
  updateGameState,
  onNavigate,
}: Props) {
  const [showTrophy, setShowTrophy] = useState(false);

  const userTeam = gameState.teams.find((t) => t.isUserTeam)!;

  const initTournament = useCallback(() => {
    const teamIds = gameState.teams.map((t) => t.id);
    const fixtures = generateLeagueFixtures(teamIds);
    const matches: TournamentMatch[] = fixtures.map((f, i) => ({
      id: i + 1,
      team1Id: f.team1Id,
      team2Id: f.team2Id,
      phase: "league",
      completed: false,
    }));
    updateGameState((prev) => ({
      ...prev,
      tournamentMatches: matches,
      tournamentPhase: "group",
    }));
    toast.success("Tournament initialized! 28 league matches scheduled.");
  }, [gameState.teams, updateGameState]);

  const simulateFullMatch = useCallback(
    (
      team1Id: number,
      team2Id: number,
    ): { winner: number; score1: string; score2: string; result: string } => {
      // Full simulation
      const simTeam = (teamId: number) => {
        const team = gameState.teams.find((t) => t.id === teamId)!;
        const xi =
          team.playingXI.length >= 11
            ? team.playingXI
            : team.squad.length >= 11
              ? team.squad.slice(0, 11)
              : aiPickPlayingXI(team.squad, PLAYERS);
        return xi;
      };

      const simInnings = (
        battingPlayers: number[],
        bowlingPlayers: number[],
        target?: number,
      ) => {
        let runs = 0;
        let wickets = 0;
        let balls = 0;
        let batIdx = 0;
        const bowlerPool = bowlingPlayers.filter((id) => {
          const p = getPlayer(id);
          return p && (p.role === "Bowler" || p.role === "AllRounder");
        });
        if (bowlerPool.length === 0)
          bowlerPool.push(...bowlingPlayers.slice(-3));
        let bowlerIdx = 0;

        while (balls < 120 && wickets < 10) {
          if (target && runs >= target) break;
          const batter = getPlayer(battingPlayers[batIdx]) ?? PLAYERS[0];
          const bowler =
            getPlayer(bowlerPool[bowlerIdx % bowlerPool.length]) ?? PLAYERS[2];
          const isLastOver = balls >= 114;
          const outcome = simulateAIBall(
            batter,
            bowler,
            balls % 6,
            isLastOver,
            target,
            runs,
            120 - balls,
          );
          if (!outcome.isWide && !outcome.isNoBall) {
            balls++;
            if (balls % 6 === 0) bowlerIdx++;
          }
          runs += outcome.runs;
          if (outcome.isWicket) {
            wickets++;
            batIdx = Math.min(batIdx + 1, battingPlayers.length - 1);
          }
        }
        return { runs, wickets, balls };
      };

      const t1Players = simTeam(team1Id);
      const t2Players = simTeam(team2Id);
      const inn1 = simInnings(t1Players, t2Players);
      const inn2 = simInnings(t2Players, t1Players, inn1.runs + 1);

      let winner: number;
      let result: string;
      const t1Name =
        gameState.teams.find((t) => t.id === team1Id)?.name ?? "Team 1";
      const t2Name =
        gameState.teams.find((t) => t.id === team2Id)?.name ?? "Team 2";

      if (inn2.runs >= inn1.runs + 1) {
        winner = team2Id;
        result = `${t2Name} won by ${10 - inn2.wickets} wkts`;
      } else {
        winner = team1Id;
        result = `${t1Name} won by ${inn1.runs - inn2.runs} runs`;
      }

      return {
        winner,
        score1: `${inn1.runs}/${inn1.wickets} (${Math.floor(inn1.balls / 6)}.${inn1.balls % 6})`,
        score2: `${inn2.runs}/${inn2.wickets} (${Math.floor(inn2.balls / 6)}.${inn2.balls % 6})`,
        result,
      };
    },
    [gameState.teams],
  );

  const simulateMatch = useCallback(
    (matchId: number) => {
      const match = gameState.tournamentMatches.find((m) => m.id === matchId);
      if (!match || match.completed) return;

      // If user team is involved, go to match screen
      if (match.team1Id === 0 || match.team2Id === 0) {
        updateGameState((prev) => ({ ...prev, currentMatch: undefined }));
        setTimeout(() => onNavigate("match"), 100);
        return;
      }

      const result = simulateFullMatch(match.team1Id, match.team2Id);

      updateGameState((prev) => {
        const updatedMatches = prev.tournamentMatches.map((m) =>
          m.id === matchId
            ? {
                ...m,
                completed: true,
                winner: result.winner,
                result: result.result,
                score1: result.score1,
                score2: result.score2,
              }
            : m,
        );
        const updatedTeams = prev.teams.map((t) => {
          if (t.id === result.winner)
            return { ...t, wins: t.wins + 1, points: t.points + 2 };
          if (t.id === match.team1Id || t.id === match.team2Id)
            return { ...t, losses: t.losses + 1 };
          return t;
        });
        return {
          ...prev,
          tournamentMatches: updatedMatches,
          teams: updatedTeams,
        };
      });
      toast.success(result.result);
    },
    [
      gameState.tournamentMatches,
      simulateFullMatch,
      updateGameState,
      onNavigate,
    ],
  );

  const simulateAllRemaining = useCallback(() => {
    const pending = gameState.tournamentMatches.filter(
      (m) => !m.completed && m.team1Id !== 0 && m.team2Id !== 0,
    );
    if (pending.length === 0) {
      toast.info("No AI-vs-AI matches remaining");
      return;
    }

    updateGameState((prev) => {
      let updatedMatches = [...prev.tournamentMatches];
      let updatedTeams = [...prev.teams];

      for (const match of pending) {
        const result = simulateFullMatch(match.team1Id, match.team2Id);
        updatedMatches = updatedMatches.map((m) =>
          m.id === match.id
            ? {
                ...m,
                completed: true,
                winner: result.winner,
                result: result.result,
                score1: result.score1,
                score2: result.score2,
              }
            : m,
        );
        updatedTeams = updatedTeams.map((t) => {
          if (t.id === result.winner)
            return { ...t, wins: t.wins + 1, points: t.points + 2 };
          if (t.id === match.team1Id || t.id === match.team2Id)
            return { ...t, losses: t.losses + 1 };
          return t;
        });
      }
      return {
        ...prev,
        tournamentMatches: updatedMatches,
        teams: updatedTeams,
      };
    });
    toast.success(`Simulated ${pending.length} matches!`);
  }, [gameState.tournamentMatches, simulateFullMatch, updateGameState]);

  const advanceToPlayoffs = useCallback(() => {
    const allLeagueDone = gameState.tournamentMatches
      .filter((m) => m.phase === "league")
      .every((m) => m.completed);
    if (!allLeagueDone) {
      toast.error("Complete all league matches first");
      return;
    }

    const sortedTeams = [...gameState.teams].sort(
      (a, b) => b.points - a.points || b.nrr - a.nrr,
    );
    const top4 = sortedTeams.slice(0, 4);

    const playoffMatches: TournamentMatch[] = [
      {
        id: 100,
        team1Id: top4[0].id,
        team2Id: top4[1].id,
        phase: "qualifier1",
        completed: false,
      },
      {
        id: 101,
        team1Id: top4[2].id,
        team2Id: top4[3].id,
        phase: "eliminator",
        completed: false,
      },
    ];

    updateGameState((prev) => ({
      ...prev,
      tournamentMatches: [...prev.tournamentMatches, ...playoffMatches],
      tournamentPhase: "qualifier1",
    }));
    toast.success("Playoffs started! Top 4 teams advance.");
  }, [gameState.teams, gameState.tournamentMatches, updateGameState]);

  const runPlayoffs = useCallback(() => {
    const q1 = gameState.tournamentMatches.find(
      (m) => m.phase === "qualifier1",
    );
    const elim = gameState.tournamentMatches.find(
      (m) => m.phase === "eliminator",
    );
    if (!q1 || !elim || !q1.completed || !elim.completed) {
      toast.error("Complete Qualifier 1 and Eliminator first");
      return;
    }

    const q2TeamA = q1.winner === q1.team1Id ? q1.team2Id : q1.team1Id;
    const q2TeamB = elim.winner!;
    const finalTeamA = q1.winner!;

    const q2Exists = gameState.tournamentMatches.some(
      (m) => m.phase === "qualifier2",
    );
    if (!q2Exists) {
      updateGameState((prev) => ({
        ...prev,
        tournamentMatches: [
          ...prev.tournamentMatches,
          {
            id: 102,
            team1Id: q2TeamA,
            team2Id: q2TeamB,
            phase: "qualifier2",
            completed: false,
          },
        ],
        tournamentPhase: "qualifier2",
      }));
      return;
    }

    const q2 = gameState.tournamentMatches.find(
      (m) => m.phase === "qualifier2",
    );
    if (!q2 || !q2.completed) {
      toast.error("Complete Qualifier 2 first");
      return;
    }

    const finalExists = gameState.tournamentMatches.some(
      (m) => m.phase === "final",
    );
    if (!finalExists) {
      updateGameState((prev) => ({
        ...prev,
        tournamentMatches: [
          ...prev.tournamentMatches,
          {
            id: 103,
            team1Id: finalTeamA,
            team2Id: q2.winner!,
            phase: "final",
            completed: false,
          },
        ],
        tournamentPhase: "final",
      }));
    }
  }, [gameState.tournamentMatches, updateGameState]);

  const completeFinal = useCallback(() => {
    const final = gameState.tournamentMatches.find((m) => m.phase === "final");
    if (!final || !final.completed) return;

    updateGameState((prev) => ({
      ...prev,
      tournamentPhase: "complete",
      trophy: final.winner,
      teams: prev.teams.map((t) =>
        t.id === final.winner ? { ...t, wins: t.wins } : t,
      ),
    }));
    setShowTrophy(true);
  }, [gameState.tournamentMatches, updateGameState]);

  const sortedTable = [...gameState.teams].sort(
    (a, b) => b.points - a.points || b.wins - a.wins,
  );
  const leagueMatches = gameState.tournamentMatches.filter(
    (m) => m.phase === "league",
  );
  const playoffMatches = gameState.tournamentMatches.filter(
    (m) => m.phase !== "league",
  );
  const userMatches = leagueMatches.filter(
    (m) => m.team1Id === 0 || m.team2Id === 0,
  );

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: "#070B14" }}>
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <h1
            className="text-2xl font-black uppercase"
            style={{
              color: "#E9EEF5",
              fontFamily: "'BricolageGrotesque', sans-serif",
            }}
          >
            <span className="text-gradient-orange">TOURNAMENT</span>
          </h1>
          <div className="flex gap-2 flex-wrap">
            {gameState.tournamentMatches.length === 0 && (
              <button
                type="button"
                onClick={initTournament}
                data-ocid="tournament.init.button"
                className="px-4 py-2 rounded-lg text-sm font-bold uppercase"
                style={{
                  background: "linear-gradient(135deg, #FF6A2A, #FF9A3D)",
                  color: "#fff",
                }}
              >
                Start Tournament
              </button>
            )}
            {gameState.tournamentMatches.length > 0 &&
              gameState.tournamentPhase === "group" && (
                <button
                  type="button"
                  onClick={simulateAllRemaining}
                  data-ocid="tournament.sim_all.button"
                  className="px-4 py-2 rounded-lg text-sm font-bold uppercase border"
                  style={{ borderColor: "#22B8C7", color: "#22B8C7" }}
                >
                  Sim AI Matches
                </button>
              )}
            {gameState.tournamentPhase === "group" &&
              leagueMatches.length > 0 &&
              leagueMatches.every((m) => m.completed) && (
                <button
                  type="button"
                  onClick={advanceToPlayoffs}
                  data-ocid="tournament.playoffs.button"
                  className="px-4 py-2 rounded-lg text-sm font-bold uppercase"
                  style={{
                    background: "linear-gradient(135deg, #FF6A2A, #FF9A3D)",
                    color: "#fff",
                  }}
                >
                  Go to Playoffs
                </button>
              )}
            {["qualifier1", "qualifier2", "final"].includes(
              gameState.tournamentPhase,
            ) && (
              <button
                type="button"
                onClick={runPlayoffs}
                data-ocid="tournament.advance.button"
                className="px-4 py-2 rounded-lg text-sm font-bold uppercase"
                style={{
                  background: "linear-gradient(135deg, #FF6A2A, #FF9A3D)",
                  color: "#fff",
                }}
              >
                Next Playoff Stage
              </button>
            )}
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Points Table */}
          <div
            className="panel-glow rounded-2xl p-5"
            data-ocid="tournament.points_table.panel"
          >
            <h2
              className="text-sm font-bold uppercase tracking-widest mb-4"
              style={{ color: "#A7B3C2" }}
            >
              Points Table
            </h2>
            <div className="overflow-x-auto">
              <table
                className="w-full text-xs"
                data-ocid="tournament.points.table"
              >
                <thead>
                  <tr style={{ color: "#A7B3C2" }}>
                    <th className="text-left pb-2">#</th>
                    <th className="text-left pb-2">Team</th>
                    <th className="text-center pb-2">W</th>
                    <th className="text-center pb-2">L</th>
                    <th className="text-right pb-2">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTable.map((team, i) => (
                    <tr
                      key={team.id}
                      style={{ borderTop: "1px solid rgba(30,58,74,0.4)" }}
                      data-ocid={`tournament.table.row.${i + 1}`}
                    >
                      <td
                        className="py-2"
                        style={{ color: i < 4 ? "#35E06F" : "#A7B3C2" }}
                      >
                        {i + 1}
                      </td>
                      <td className="py-2">
                        <span
                          className="font-semibold"
                          style={{
                            color: team.isUserTeam ? "#35E06F" : "#E9EEF5",
                          }}
                        >
                          {team.isUserTeam ? "⭐ " : ""}
                          {team.shortName}
                        </span>
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
            {gameState.tournamentPhase !== "group" && (
              <div className="mt-3 text-xs" style={{ color: "#35E06F" }}>
                ⭐ Top 4 qualify for playoffs
              </div>
            )}
          </div>

          {/* Fixtures */}
          <div
            className="lg:col-span-2 panel-glow rounded-2xl p-5"
            data-ocid="tournament.fixtures.panel"
          >
            <h2
              className="text-sm font-bold uppercase tracking-widest mb-4"
              style={{ color: "#A7B3C2" }}
            >
              Fixtures
            </h2>

            {gameState.tournamentMatches.length === 0 ? (
              <div
                className="text-center py-8"
                style={{ color: "#A7B3C2" }}
                data-ocid="tournament.fixtures.empty_state"
              >
                <Calendar className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p>
                  No fixtures yet. Start the tournament to generate matches.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* User matches */}
                {userMatches.length > 0 && (
                  <div>
                    <h3
                      className="text-xs font-bold uppercase tracking-wider mb-3"
                      style={{ color: "#FF9A3D" }}
                    >
                      YOUR MATCHES
                    </h3>
                    <div className="space-y-2">
                      {userMatches.slice(0, 8).map((m, i) => {
                        const opp = gameState.teams.find(
                          (t) =>
                            t.id !== 0 &&
                            (t.id === m.team1Id || t.id === m.team2Id),
                        )!;
                        return (
                          <div
                            key={m.id}
                            className="flex items-center gap-3 p-3 rounded-xl"
                            style={{
                              background: "rgba(15,34,51,0.6)",
                              border: m.completed
                                ? "1px solid rgba(53,224,111,0.2)"
                                : "1px solid rgba(30,58,74,0.5)",
                            }}
                            data-ocid={`tournament.user_match.item.${i + 1}`}
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span
                                  className="text-sm font-semibold"
                                  style={{ color: "#35E06F" }}
                                >
                                  {userTeam.shortName}
                                </span>
                                <span
                                  className="text-xs"
                                  style={{ color: "#A7B3C2" }}
                                >
                                  vs
                                </span>
                                <span
                                  className="text-sm font-semibold"
                                  style={{ color: "#E9EEF5" }}
                                >
                                  {opp?.shortName}
                                </span>
                              </div>
                              {m.completed && (
                                <div
                                  className="text-xs mt-0.5"
                                  style={{
                                    color:
                                      m.winner === 0 ? "#35E06F" : "#E53935",
                                  }}
                                >
                                  {m.result}
                                </div>
                              )}
                            </div>
                            {!m.completed ? (
                              <button
                                type="button"
                                onClick={() => simulateMatch(m.id)}
                                data-ocid={`tournament.play_match.button.${i + 1}`}
                                className="px-3 py-1.5 rounded text-xs font-bold"
                                style={{
                                  background:
                                    "linear-gradient(135deg, #FF6A2A, #FF9A3D)",
                                  color: "#fff",
                                }}
                              >
                                PLAY
                              </button>
                            ) : (
                              <CheckCircle2
                                className="w-4 h-4"
                                style={{
                                  color: m.winner === 0 ? "#35E06F" : "#E53935",
                                }}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Playoff matches */}
                {playoffMatches.length > 0 && (
                  <div>
                    <h3
                      className="text-xs font-bold uppercase tracking-wider mb-3"
                      style={{ color: "#22B8C7" }}
                    >
                      PLAYOFFS
                    </h3>
                    <div className="space-y-2">
                      {playoffMatches.map((m, i) => {
                        const t1 = gameState.teams.find(
                          (t) => t.id === m.team1Id,
                        );
                        const t2 = gameState.teams.find(
                          (t) => t.id === m.team2Id,
                        );
                        return (
                          <div
                            key={m.id}
                            className="flex items-center gap-3 p-3 rounded-xl"
                            style={{
                              background: "rgba(15,34,51,0.6)",
                              border:
                                m.phase === "final"
                                  ? "1px solid rgba(255,154,61,0.4)"
                                  : "1px solid rgba(30,58,74,0.5)",
                            }}
                            data-ocid={`tournament.playoff.item.${i + 1}`}
                          >
                            <div className="flex-1">
                              <div
                                className="text-xs font-bold uppercase mb-1"
                                style={{
                                  color:
                                    m.phase === "final" ? "#FF9A3D" : "#22B8C7",
                                }}
                              >
                                {m.phase.toUpperCase()}
                              </div>
                              <div className="flex items-center gap-2">
                                <span
                                  className="text-sm font-semibold"
                                  style={{
                                    color: t1?.isUserTeam
                                      ? "#35E06F"
                                      : "#E9EEF5",
                                  }}
                                >
                                  {t1?.shortName}
                                </span>
                                <span
                                  className="text-xs"
                                  style={{ color: "#A7B3C2" }}
                                >
                                  vs
                                </span>
                                <span
                                  className="text-sm font-semibold"
                                  style={{
                                    color: t2?.isUserTeam
                                      ? "#35E06F"
                                      : "#E9EEF5",
                                  }}
                                >
                                  {t2?.shortName}
                                </span>
                              </div>
                              {m.completed && (
                                <div
                                  className="text-xs mt-0.5"
                                  style={{
                                    color:
                                      m.winner === 0 ? "#35E06F" : "#FF9A3D",
                                  }}
                                >
                                  {m.result}
                                </div>
                              )}
                            </div>
                            {!m.completed && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (m.team1Id === 0 || m.team2Id === 0) {
                                    simulateMatch(m.id);
                                  } else {
                                    const r = simulateFullMatch(
                                      m.team1Id,
                                      m.team2Id,
                                    );
                                    updateGameState((prev) => ({
                                      ...prev,
                                      tournamentMatches:
                                        prev.tournamentMatches.map((pm) =>
                                          pm.id === m.id
                                            ? {
                                                ...pm,
                                                completed: true,
                                                winner: r.winner,
                                                result: r.result,
                                                score1: r.score1,
                                                score2: r.score2,
                                              }
                                            : pm,
                                        ),
                                    }));
                                    toast.success(r.result);
                                    if (m.phase === "final")
                                      setTimeout(completeFinal, 500);
                                  }
                                }}
                                data-ocid={`tournament.playoff.button.${i + 1}`}
                                className="px-3 py-1.5 rounded text-xs font-bold"
                                style={{
                                  background:
                                    "linear-gradient(135deg, #FF6A2A, #FF9A3D)",
                                  color: "#fff",
                                }}
                              >
                                {m.team1Id === 0 || m.team2Id === 0
                                  ? "PLAY"
                                  : "SIMULATE"}
                              </button>
                            )}
                            {m.completed && m.phase === "final" && (
                              <button
                                type="button"
                                onClick={completeFinal}
                                data-ocid="tournament.trophy.button"
                                className="px-2 py-1 rounded text-xs"
                                style={{
                                  background: "rgba(255,154,61,0.2)",
                                  color: "#FF9A3D",
                                }}
                              >
                                🏆
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Trophy Modal */}
        <AnimatePresence>
          {(showTrophy || gameState.tournamentPhase === "complete") && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center"
              style={{ background: "rgba(7,11,20,0.95)" }}
              data-ocid="tournament.trophy.modal"
            >
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", duration: 0.6 }}
                className="text-center p-12 rounded-3xl max-w-md"
                style={{
                  background: "rgba(15,34,51,0.9)",
                  border: "1px solid rgba(255,154,61,0.4)",
                }}
              >
                <div className="text-8xl mb-4 animate-bounce">🏆</div>
                <h2
                  className="text-3xl font-black uppercase mb-2"
                  style={{
                    color: "#FF9A3D",
                    fontFamily: "'BricolageGrotesque', sans-serif",
                  }}
                >
                  CHAMPIONS!
                </h2>
                <p className="text-lg mb-2" style={{ color: "#E9EEF5" }}>
                  {gameState.teams.find((t) => t.id === gameState.trophy)
                    ?.name ?? "Your team"}{" "}
                  wins the IPL 2024!
                </p>
                {gameState.trophy === 0 && (
                  <p className="text-sm mb-6" style={{ color: "#35E06F" }}>
                    Congratulations! You are the IPL Champions! 🎉
                  </p>
                )}
                <div className="flex gap-3 justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      setShowTrophy(false);
                      onNavigate("leaderboard");
                    }}
                    data-ocid="tournament.trophy.view_leaderboard.button"
                    className="px-6 py-3 rounded-lg font-bold uppercase tracking-wider"
                    style={{
                      background: "linear-gradient(135deg, #FF6A2A, #FF9A3D)",
                      color: "#fff",
                    }}
                  >
                    View Leaderboard
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowTrophy(false)}
                    data-ocid="tournament.trophy.close_button"
                    className="px-6 py-3 rounded-lg font-bold uppercase tracking-wider border"
                    style={{
                      borderColor: "rgba(167,179,194,0.3)",
                      color: "#A7B3C2",
                    }}
                  >
                    Close
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
