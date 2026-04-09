import { Calendar, CheckCircle2, Trophy } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PLAYERS, getPlayer } from "../data/players";
import { aiPickPlayingXI, generateLeagueFixtures } from "../engine/gameEngine";
import { simulateAIBall } from "../engine/matchEngine";
import type {
  GameState,
  PlayerTournamentStats,
  TournamentMatch,
} from "../types/game";

interface Props {
  gameState: GameState;
  updateGameState: (updater: (prev: GameState) => GameState) => void;
  onNavigate: (phase: GameState["phase"]) => void;
  onReset?: () => void;
}

// Generate match dates: March 22 - May 18, 2025 (~57 days, ~45 league matches)
function generateMatchDates(count: number): string[] {
  const dates: string[] = [];
  const start = new Date(2025, 2, 22); // March 22, 2025
  const end = new Date(2025, 4, 18); // May 18, 2025
  const totalDays = Math.floor(
    (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
  );
  for (let i = 0; i < count; i++) {
    const dayOffset = Math.floor((i / count) * totalDays);
    const d = new Date(start);
    d.setDate(d.getDate() + dayOffset);
    dates.push(
      d.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
    );
  }
  return dates;
}

// Distribute innings runs/wickets across players and accumulate into playerStats
function recordAIMatchPlayerStats(
  playerStats: PlayerTournamentStats[],
  battingPlayerIds: number[],
  bowlingPlayerIds: number[],
  battingTeamId: number,
  bowlingTeamId: number,
  totalRuns: number,
  totalWickets: number,
): PlayerTournamentStats[] {
  let updated = [...playerStats];

  // ---- Batting distribution ----
  const batters = battingPlayerIds.slice(0, 11);
  const weights = batters.map((_, i) => Math.max(1, 11 - i));
  const weightSum = weights.reduce((s, w) => s + w, 0);

  let runsLeft = totalRuns;
  let wicketsLeft = Math.min(totalWickets, Math.max(0, batters.length - 1));

  for (let i = 0; i < batters.length; i++) {
    const playerId = batters[i];
    const isLastBatter = i === batters.length - 1;
    let playerRuns: number;
    if (isLastBatter) {
      playerRuns = Math.max(0, runsLeft);
    } else {
      const share = (weights[i] / weightSum) * totalRuns;
      playerRuns = Math.max(
        0,
        Math.min(runsLeft, Math.round(share + (Math.random() - 0.5) * 15)),
      );
    }
    runsLeft = Math.max(0, runsLeft - playerRuns);

    const isOut =
      wicketsLeft > 0 && (i < batters.length - 1 ? Math.random() > 0.3 : true);
    if (isOut && wicketsLeft > 0) wicketsLeft--;

    const player = getPlayer(playerId);
    const sr = player?.strikeRate ?? 130;
    const balls =
      playerRuns > 0
        ? Math.max(1, Math.round((playerRuns / sr) * 100))
        : isOut
          ? 1
          : 0;
    if (balls === 0 && !isOut) continue;

    const sixes = Math.max(0, Math.floor(playerRuns / 35));
    const fours = Math.max(0, Math.floor(playerRuns / 18) - sixes);
    const isCentury = playerRuns >= 100;
    const isHalfCentury = playerRuns >= 50 && playerRuns < 100;

    const existingIdx = updated.findIndex((s) => s.playerId === playerId);
    if (existingIdx === -1) {
      updated.push({
        playerId,
        teamId: battingTeamId,
        runs: playerRuns,
        balls,
        fours,
        sixes,
        wickets: 0,
        oversBowled: 0,
        runsConceded: 0,
        innings: 1,
        matchesPlayed: 1,
        strikeRate: balls > 0 ? (playerRuns / balls) * 100 : 0,
        economy: 0,
        playerOfMatchCount: 0,
        centuries: isCentury ? 1 : 0,
        halfCenturies: isHalfCentury ? 1 : 0,
      });
    } else {
      const s = updated[existingIdx];
      const newBalls = s.balls + balls;
      const newRuns = s.runs + playerRuns;
      updated[existingIdx] = {
        ...s,
        runs: newRuns,
        balls: newBalls,
        fours: s.fours + fours,
        sixes: s.sixes + sixes,
        innings: s.innings + 1,
        matchesPlayed: s.matchesPlayed + 1,
        strikeRate: newBalls > 0 ? (newRuns / newBalls) * 100 : s.strikeRate,
        teamId: s.teamId !== -1 ? s.teamId : battingTeamId,
        centuries: (s.centuries ?? 0) + (isCentury ? 1 : 0),
        halfCenturies: (s.halfCenturies ?? 0) + (isHalfCentury ? 1 : 0),
      };
    }
  }

  // ---- Bowling distribution ----
  const bowlers = bowlingPlayerIds
    .filter((id) => {
      const p = getPlayer(id);
      return p && (p.role === "Bowler" || p.role === "AllRounder");
    })
    .slice(0, 5);
  if (bowlers.length === 0) return updated;

  const oversTotal = 20;
  const oversEach = Math.floor(oversTotal / bowlers.length);
  let wicketsToAssign = totalWickets;

  for (let i = 0; i < bowlers.length; i++) {
    const playerId = bowlers[i];
    const overs = i < oversTotal % bowlers.length ? oversEach + 1 : oversEach;
    const runsShare = Math.max(
      0,
      Math.round((totalRuns / oversTotal) * overs + (Math.random() - 0.5) * 8),
    );
    const wkts =
      i === bowlers.length - 1
        ? wicketsToAssign
        : Math.min(wicketsToAssign, Math.floor(Math.random() * 3));
    if (i < bowlers.length - 1)
      wicketsToAssign = Math.max(0, wicketsToAssign - wkts);

    const economy = overs > 0 ? runsShare / overs : 0;
    const existingIdx = updated.findIndex((s) => s.playerId === playerId);
    if (existingIdx === -1) {
      updated.push({
        playerId,
        teamId: bowlingTeamId,
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        wickets: wkts,
        oversBowled: overs,
        runsConceded: runsShare,
        innings: 0,
        matchesPlayed: 1,
        strikeRate: 0,
        economy,
        playerOfMatchCount: 0,
        centuries: 0,
        halfCenturies: 0,
      });
    } else {
      const s = updated[existingIdx];
      const newOvers = s.oversBowled + overs;
      const newRunsConceded = s.runsConceded + runsShare;
      updated[existingIdx] = {
        ...s,
        wickets: s.wickets + wkts,
        oversBowled: newOvers,
        runsConceded: newRunsConceded,
        economy: newOvers > 0 ? newRunsConceded / newOvers : s.economy,
        matchesPlayed: s.matchesPlayed + 1,
        teamId: s.teamId !== -1 ? s.teamId : bowlingTeamId,
      };
    }
  }

  return updated;
}

export default function TournamentScreen({
  gameState,
  updateGameState,
  onNavigate,
  onReset,
}: Props) {
  const [showTrophy, setShowTrophy] = useState(false);
  const [fixtureTab, setFixtureTab] = useState<"all" | "user" | "playoffs">(
    "user",
  );

  const userTeam = gameState.teams.find((t) => t.isUserTeam)!;

  // Helper: simulate a single match purely from team state (used in bulk ops)
  const simulateFullMatchFromTeams = useCallback(
    (
      team1Id: number,
      team2Id: number,
      teams: GameState["teams"],
    ): {
      winner: number;
      score1: string;
      score2: string;
      result: string;
      nrr1Delta: number;
      nrr2Delta: number;
      inn1: { runs: number; wickets: number; balls: number };
      inn2: { runs: number; wickets: number; balls: number };
      t1Players: number[];
      t2Players: number[];
    } => {
      const simTeam = (teamId: number) => {
        const team = teams.find((t) => t.id === teamId)!;
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
      const t1Name = teams.find((t) => t.id === team1Id)?.name ?? "Team 1";
      const t2Name = teams.find((t) => t.id === team2Id)?.name ?? "Team 2";

      if (inn2.runs >= inn1.runs + 1) {
        winner = team2Id;
        result = `${t2Name} won by ${10 - inn2.wickets} wkts`;
      } else {
        winner = team1Id;
        result = `${t1Name} won by ${inn1.runs - inn2.runs} runs`;
      }

      const overs1 = inn1.balls / 6;
      const overs2 = inn2.balls / 6;
      const nrr1Delta =
        overs1 > 0 && overs2 > 0 ? inn1.runs / overs1 - inn2.runs / overs2 : 0;
      const nrr2Delta = -nrr1Delta;

      return {
        winner,
        score1: `${inn1.runs}/${inn1.wickets} (${Math.floor(inn1.balls / 6)}.${inn1.balls % 6})`,
        score2: `${inn2.runs}/${inn2.wickets} (${Math.floor(inn2.balls / 6)}.${inn2.balls % 6})`,
        result,
        nrr1Delta,
        nrr2Delta,
        inn1,
        inn2,
        t1Players,
        t2Players,
      };
    },
    [],
  );

  const simulateFullMatch = useCallback(
    (team1Id: number, team2Id: number) => {
      return simulateFullMatchFromTeams(team1Id, team2Id, gameState.teams);
    },
    [gameState.teams, simulateFullMatchFromTeams],
  );

  const simulateMatch = useCallback(
    (matchId: number) => {
      const match = gameState.tournamentMatches.find((m) => m.id === matchId);
      if (!match || match.completed) return;

      // If user team is involved, navigate to match screen
      if (match.team1Id === userTeam.id || match.team2Id === userTeam.id) {
        updateGameState((prev) => {
          const opponent =
            match.team1Id === userTeam.id ? match.team2Id : match.team1Id;
          return {
            ...prev,
            currentMatch: {
              id: Date.now(),
              team1Id: userTeam.id,
              team2Id: opponent,
              tossWinner: -1,
              tossChoice: "bat",
              phase: "setup",
              innings1: {
                battingTeamId: -1,
                bowlingTeamId: -1,
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
              },
              innings2: {
                battingTeamId: -1,
                bowlingTeamId: -1,
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
              },
              matchType: match.phase,
              impactPlayerUsed1: false,
              impactPlayerUsed2: false,
              matchId: match.id,
              venue: match.venue,
            },
          };
        });
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
          if (t.id === match.team1Id || t.id === match.team2Id) {
            const isWinner = t.id === result.winner;
            const nrrDelta =
              t.id === match.team1Id ? result.nrr1Delta : result.nrr2Delta;
            return {
              ...t,
              wins: isWinner ? t.wins + 1 : t.wins,
              losses: isWinner ? t.losses : t.losses + 1,
              points: isWinner ? t.points + 2 : t.points,
              matchesPlayed: t.matchesPlayed + 1,
              nrr: t.nrr + nrrDelta,
            };
          }
          return t;
        });
        // Record individual player stats for both teams
        let updatedPlayerStats = recordAIMatchPlayerStats(
          prev.playerStats,
          result.t1Players,
          result.t2Players,
          match.team1Id,
          match.team2Id,
          result.inn1.runs,
          result.inn1.wickets,
        );
        updatedPlayerStats = recordAIMatchPlayerStats(
          updatedPlayerStats,
          result.t2Players,
          result.t1Players,
          match.team2Id,
          match.team1Id,
          result.inn2.runs,
          result.inn2.wickets,
        );
        return {
          ...prev,
          tournamentMatches: updatedMatches,
          teams: updatedTeams,
          playerStats: updatedPlayerStats,
        };
      });
      toast.success(result.result);
    },
    [
      gameState.tournamentMatches,
      simulateFullMatch,
      updateGameState,
      onNavigate,
      userTeam.id,
    ],
  );

  // Auto-simulate all pending AI-vs-AI matches in one batch update
  const simulateAllAIMatches = useCallback(() => {
    updateGameState((prev) => {
      const pending = prev.tournamentMatches.filter(
        (m) =>
          !m.completed &&
          m.phase === "league" &&
          m.team1Id !== userTeam.id &&
          m.team2Id !== userTeam.id,
      );
      if (pending.length === 0) return prev;

      let updatedMatches = [...prev.tournamentMatches];
      let updatedTeams = [...prev.teams];
      let updatedPlayerStats = [...prev.playerStats];

      for (const match of pending) {
        const result = simulateFullMatchFromTeams(
          match.team1Id,
          match.team2Id,
          updatedTeams,
        );
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
          if (t.id === match.team1Id || t.id === match.team2Id) {
            const isWinner = t.id === result.winner;
            const nrrDelta =
              t.id === match.team1Id ? result.nrr1Delta : result.nrr2Delta;
            return {
              ...t,
              wins: isWinner ? t.wins + 1 : t.wins,
              losses: isWinner ? t.losses : t.losses + 1,
              points: isWinner ? t.points + 2 : t.points,
              matchesPlayed: t.matchesPlayed + 1,
              nrr: t.nrr + nrrDelta,
            };
          }
          return t;
        });
        updatedPlayerStats = recordAIMatchPlayerStats(
          updatedPlayerStats,
          result.t1Players,
          result.t2Players,
          match.team1Id,
          match.team2Id,
          result.inn1.runs,
          result.inn1.wickets,
        );
        updatedPlayerStats = recordAIMatchPlayerStats(
          updatedPlayerStats,
          result.t2Players,
          result.t1Players,
          match.team2Id,
          match.team1Id,
          result.inn2.runs,
          result.inn2.wickets,
        );
      }

      return {
        ...prev,
        tournamentMatches: updatedMatches,
        teams: updatedTeams,
        playerStats: updatedPlayerStats,
      };
    });
  }, [userTeam.id, simulateFullMatchFromTeams, updateGameState]);

  // When tournament is initialized, auto-simulate all AI matches immediately
  const initTournament = useCallback(() => {
    const teamIds = gameState.teams.map((t) => t.id);
    const rawFixtures = generateLeagueFixtures(teamIds, gameState.teams);
    const dates = generateMatchDates(rawFixtures.length);
    const matches: TournamentMatch[] = rawFixtures.map((f, i) => ({
      id: i + 1,
      team1Id: f.team1Id,
      team2Id: f.team2Id,
      phase: "league",
      completed: false,
      venue: f.venue,
      matchDate: dates[i],
    }));

    // Immediately simulate all AI-vs-AI matches
    const aiMatches = matches.filter(
      (m) => m.team1Id !== userTeam.id && m.team2Id !== userTeam.id,
    );
    let simulatedMatches = [...matches];
    let simulatedTeams = [...gameState.teams];
    let simulatedPlayerStats: PlayerTournamentStats[] = [];

    for (const match of aiMatches) {
      const result = simulateFullMatchFromTeams(
        match.team1Id,
        match.team2Id,
        simulatedTeams,
      );
      simulatedMatches = simulatedMatches.map((m) =>
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
      simulatedTeams = simulatedTeams.map((t) => {
        if (t.id === match.team1Id || t.id === match.team2Id) {
          const isWinner = t.id === result.winner;
          const nrrDelta =
            t.id === match.team1Id ? result.nrr1Delta : result.nrr2Delta;
          return {
            ...t,
            wins: isWinner ? t.wins + 1 : t.wins,
            losses: isWinner ? t.losses : t.losses + 1,
            points: isWinner ? t.points + 2 : t.points,
            matchesPlayed: t.matchesPlayed + 1,
            nrr: t.nrr + nrrDelta,
          };
        }
        return t;
      });
      simulatedPlayerStats = recordAIMatchPlayerStats(
        simulatedPlayerStats,
        result.t1Players,
        result.t2Players,
        match.team1Id,
        match.team2Id,
        result.inn1.runs,
        result.inn1.wickets,
      );
      simulatedPlayerStats = recordAIMatchPlayerStats(
        simulatedPlayerStats,
        result.t2Players,
        result.t1Players,
        match.team2Id,
        match.team1Id,
        result.inn2.runs,
        result.inn2.wickets,
      );
    }

    updateGameState((prev) => ({
      ...prev,
      tournamentMatches: simulatedMatches,
      teams: simulatedTeams,
      playerStats: simulatedPlayerStats,
      tournamentPhase: "group",
    }));
    toast.success(
      `Tournament started! ${aiMatches.length} AI matches auto-simulated. Play your ${matches.length - aiMatches.length} matches!`,
    );
  }, [
    gameState.teams,
    userTeam.id,
    simulateFullMatchFromTeams,
    updateGameState,
  ]);

  // Auto-simulate AI matches whenever user returns to tournament and there are pending AI matches
  useEffect(() => {
    if (
      gameState.tournamentPhase !== "group" ||
      gameState.tournamentMatches.length === 0
    )
      return;
    const pendingAI = gameState.tournamentMatches.filter(
      (m) =>
        !m.completed &&
        m.phase === "league" &&
        m.team1Id !== userTeam.id &&
        m.team2Id !== userTeam.id,
    );
    if (pendingAI.length > 0) {
      simulateAllAIMatches();
    }
  }, [
    gameState.tournamentPhase,
    gameState.tournamentMatches,
    userTeam.id,
    simulateAllAIMatches,
  ]);

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
        venue: "Narendra Modi Stadium, Ahmedabad",
        matchDate: "27 May 2025",
      },
      {
        id: 101,
        team1Id: top4[2].id,
        team2Id: top4[3].id,
        phase: "eliminator",
        completed: false,
        venue: "MA Chidambaram Stadium, Chennai",
        matchDate: "28 May 2025",
      },
    ];

    // Auto-simulate any AI-vs-AI playoff matches
    let simulatedPlayoffs = [...playoffMatches];
    let simulatedTeams = [...gameState.teams];
    const userTeamId = userTeam.id;
    let playoffPlayerStats = [...gameState.playerStats];

    for (const match of simulatedPlayoffs) {
      if (match.team1Id !== userTeamId && match.team2Id !== userTeamId) {
        const result = simulateFullMatchFromTeams(
          match.team1Id,
          match.team2Id,
          simulatedTeams,
        );
        simulatedPlayoffs = simulatedPlayoffs.map((m) =>
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
        simulatedTeams = simulatedTeams.map((t) => {
          if (t.id === match.team1Id || t.id === match.team2Id) {
            const isWinner = t.id === result.winner;
            return {
              ...t,
              wins: isWinner ? t.wins + 1 : t.wins,
              losses: isWinner ? t.losses : t.losses + 1,
              points: isWinner ? t.points + 2 : t.points,
              matchesPlayed: t.matchesPlayed + 1,
            };
          }
          return t;
        });
        playoffPlayerStats = recordAIMatchPlayerStats(
          playoffPlayerStats,
          result.t1Players,
          result.t2Players,
          match.team1Id,
          match.team2Id,
          result.inn1.runs,
          result.inn1.wickets,
        );
        playoffPlayerStats = recordAIMatchPlayerStats(
          playoffPlayerStats,
          result.t2Players,
          result.t1Players,
          match.team2Id,
          match.team1Id,
          result.inn2.runs,
          result.inn2.wickets,
        );
      }
    }

    updateGameState((prev) => ({
      ...prev,
      tournamentMatches: [...prev.tournamentMatches, ...simulatedPlayoffs],
      teams: simulatedTeams,
      playerStats: playoffPlayerStats,
      tournamentPhase: "qualifier1",
    }));
    toast.success("Playoffs started! Top 4 teams advance.");
  }, [
    gameState.teams,
    gameState.tournamentMatches,
    gameState.playerStats,
    userTeam.id,
    simulateFullMatchFromTeams,
    updateGameState,
  ]);

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
    const userTeamId = userTeam.id;

    const q2Exists = gameState.tournamentMatches.some(
      (m) => m.phase === "qualifier2",
    );
    if (!q2Exists) {
      const q2Match: TournamentMatch = {
        id: 102,
        team1Id: q2TeamA,
        team2Id: q2TeamB,
        phase: "qualifier2",
        completed: false,
        venue: "Eden Gardens, Kolkata",
        matchDate: "30 May 2025",
      };

      // Auto-simulate if no user team involved
      if (q2TeamA !== userTeamId && q2TeamB !== userTeamId) {
        const result = simulateFullMatchFromTeams(
          q2TeamA,
          q2TeamB,
          gameState.teams,
        );
        updateGameState((prev) => {
          let updatedStats = recordAIMatchPlayerStats(
            prev.playerStats,
            result.t1Players,
            result.t2Players,
            q2TeamA,
            q2TeamB,
            result.inn1.runs,
            result.inn1.wickets,
          );
          updatedStats = recordAIMatchPlayerStats(
            updatedStats,
            result.t2Players,
            result.t1Players,
            q2TeamB,
            q2TeamA,
            result.inn2.runs,
            result.inn2.wickets,
          );
          return {
            ...prev,
            tournamentMatches: [
              ...prev.tournamentMatches,
              {
                ...q2Match,
                completed: true,
                winner: result.winner,
                result: result.result,
                score1: result.score1,
                score2: result.score2,
              },
            ],
            playerStats: updatedStats,
            tournamentPhase: "qualifier2",
          };
        });
        toast.success(`Qualifier 2: ${result.result} (AI simulated)`);
      } else {
        updateGameState((prev) => ({
          ...prev,
          tournamentMatches: [...prev.tournamentMatches, q2Match],
          tournamentPhase: "qualifier2",
        }));
      }
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
      const finalTeamB = q2.winner!;
      const finalMatch: TournamentMatch = {
        id: 103,
        team1Id: finalTeamA,
        team2Id: finalTeamB,
        phase: "final",
        completed: false,
        venue: "Narendra Modi Stadium, Ahmedabad",
        matchDate: "1 Jun 2025",
      };

      // Auto-simulate final if no user team
      if (finalTeamA !== userTeamId && finalTeamB !== userTeamId) {
        const result = simulateFullMatchFromTeams(
          finalTeamA,
          finalTeamB,
          gameState.teams,
        );
        updateGameState((prev) => {
          let updatedStats = recordAIMatchPlayerStats(
            prev.playerStats,
            result.t1Players,
            result.t2Players,
            finalTeamA,
            finalTeamB,
            result.inn1.runs,
            result.inn1.wickets,
          );
          updatedStats = recordAIMatchPlayerStats(
            updatedStats,
            result.t2Players,
            result.t1Players,
            finalTeamB,
            finalTeamA,
            result.inn2.runs,
            result.inn2.wickets,
          );
          return {
            ...prev,
            tournamentMatches: [
              ...prev.tournamentMatches,
              {
                ...finalMatch,
                completed: true,
                winner: result.winner,
                result: result.result,
                score1: result.score1,
                score2: result.score2,
              },
            ],
            playerStats: updatedStats,
            tournamentPhase: "final",
            trophy: result.winner,
          };
        });
        toast.success(`Final: ${result.result} (AI simulated)`);
        setTimeout(() => setShowTrophy(true), 500);
      } else {
        updateGameState((prev) => ({
          ...prev,
          tournamentMatches: [...prev.tournamentMatches, finalMatch],
          tournamentPhase: "final",
        }));
      }
    }
  }, [
    gameState.tournamentMatches,
    gameState.teams,
    userTeam.id,
    simulateFullMatchFromTeams,
    updateGameState,
  ]);

  const completeFinal = useCallback(() => {
    const final = gameState.tournamentMatches.find((m) => m.phase === "final");
    if (!final || !final.completed) return;

    updateGameState((prev) => ({
      ...prev,
      tournamentPhase: "complete",
      trophy: final.winner,
    }));
    setShowTrophy(true);
  }, [gameState.tournamentMatches, updateGameState]);

  const sortedTable = [...gameState.teams].sort(
    (a, b) => b.points - a.points || b.nrr - a.nrr,
  );
  const leagueMatches = gameState.tournamentMatches.filter(
    (m) => m.phase === "league",
  );
  const playoffMatches = gameState.tournamentMatches.filter(
    (m) => m.phase !== "league",
  );
  const userMatches = leagueMatches.filter(
    (m) => m.team1Id === userTeam.id || m.team2Id === userTeam.id,
  );

  const pendingUserMatches = userMatches.filter((m) => !m.completed);

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
            <span className="text-gradient-orange">IPL 2026 TOURNAMENT</span>
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

        {/* Pending user matches banner */}
        {pendingUserMatches.length > 0 && (
          <div
            className="mb-4 p-3 rounded-xl flex items-center justify-between gap-3"
            style={{
              background: "rgba(255,154,61,0.08)",
              border: "1px solid rgba(255,154,61,0.3)",
            }}
          >
            <div className="text-sm" style={{ color: "#FF9A3D" }}>
              <span className="font-bold">
                {pendingUserMatches.length} match
                {pendingUserMatches.length > 1 ? "es" : ""} to play
              </span>
              <span className="ml-2" style={{ color: "#A7B3C2" }}>
                All other team matches are auto-simulated by AI
              </span>
            </div>
            <button
              type="button"
              onClick={() => simulateMatch(pendingUserMatches[0].id)}
              data-ocid="tournament.play_next.button"
              className="px-4 py-1.5 rounded text-sm font-bold uppercase shrink-0"
              style={{
                background: "linear-gradient(135deg, #FF6A2A, #FF9A3D)",
                color: "#fff",
              }}
            >
              Play Next
            </button>
          </div>
        )}

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
                    <th className="text-center pb-2">M</th>
                    <th className="text-center pb-2">W</th>
                    <th className="text-center pb-2">L</th>
                    <th className="text-center pb-2">NRR</th>
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
                        style={{ color: "#A7B3C2" }}
                      >
                        {team.matchesPlayed}
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
                        className="py-2 text-center text-xs"
                        style={{
                          color: team.nrr >= 0 ? "#35E06F" : "#E53935",
                        }}
                      >
                        {team.nrr >= 0 ? "+" : ""}
                        {team.nrr.toFixed(2)}
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
            <div className="flex items-center justify-between mb-4">
              <h2
                className="text-sm font-bold uppercase tracking-widest"
                style={{ color: "#A7B3C2" }}
              >
                Fixtures
              </h2>
              {gameState.tournamentMatches.length > 0 && (
                <div className="flex gap-1">
                  {(["user", "all", "playoffs"] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setFixtureTab(tab)}
                      data-ocid={`tournament.fixture_${tab}.tab`}
                      className="px-3 py-1 rounded text-xs font-bold uppercase"
                      style={{
                        background:
                          fixtureTab === tab
                            ? "rgba(255,154,61,0.2)"
                            : "rgba(15,34,51,0.6)",
                        color: fixtureTab === tab ? "#FF9A3D" : "#A7B3C2",
                        border:
                          fixtureTab === tab
                            ? "1px solid rgba(255,154,61,0.4)"
                            : "1px solid rgba(30,58,74,0.4)",
                      }}
                    >
                      {tab === "user"
                        ? "My Matches"
                        : tab === "all"
                          ? "All"
                          : "Playoffs"}
                    </button>
                  ))}
                </div>
              )}
            </div>

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
              <div
                className="space-y-2 overflow-y-auto"
                style={{ maxHeight: "480px" }}
              >
                {/* User matches */}
                {fixtureTab === "user" && (
                  <div>
                    {userMatches.length === 0 ? (
                      <p
                        className="text-center py-6 text-sm"
                        style={{ color: "#A7B3C2" }}
                        data-ocid="tournament.user_matches.empty_state"
                      >
                        No user matches found
                      </p>
                    ) : (
                      userMatches.map((m, i) => {
                        const opp = gameState.teams.find(
                          (t) =>
                            !t.isUserTeam &&
                            (t.id === m.team1Id || t.id === m.team2Id),
                        )!;
                        const isUserWinner = m.winner === userTeam.id;
                        return (
                          <div
                            key={m.id}
                            className="p-3 rounded-xl"
                            style={{
                              background: "rgba(15,34,51,0.6)",
                              border: m.completed
                                ? isUserWinner
                                  ? "1px solid rgba(53,224,111,0.3)"
                                  : "1px solid rgba(229,57,53,0.3)"
                                : "1px solid rgba(30,58,74,0.5)",
                            }}
                            data-ocid={`tournament.user_match.item.${i + 1}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span
                                    className="text-xs font-bold"
                                    style={{ color: "#A7B3C2" }}
                                  >
                                    Match {m.id}
                                  </span>
                                  {m.matchDate && (
                                    <span
                                      className="text-xs"
                                      style={{ color: "#A7B3C2" }}
                                    >
                                      · {m.matchDate}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-1">
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
                                {m.venue && (
                                  <div
                                    className="text-xs mt-0.5"
                                    style={{ color: "#6B7A8F" }}
                                  >
                                    📍 {m.venue}
                                  </div>
                                )}
                                {m.completed && m.result && (
                                  <div
                                    className="text-xs mt-1 font-semibold"
                                    style={{
                                      color: isUserWinner
                                        ? "#35E06F"
                                        : "#E53935",
                                    }}
                                  >
                                    {m.result}
                                    {m.score1 && m.score2 && (
                                      <span
                                        className="ml-2 font-normal"
                                        style={{ color: "#A7B3C2" }}
                                      >
                                        ({m.score1} / {m.score2})
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                              {!m.completed ? (
                                <button
                                  type="button"
                                  onClick={() => simulateMatch(m.id)}
                                  data-ocid={`tournament.play_match.button.${i + 1}`}
                                  className="px-3 py-1.5 rounded text-xs font-bold shrink-0"
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
                                  className="w-4 h-4 shrink-0"
                                  style={{
                                    color: isUserWinner ? "#35E06F" : "#E53935",
                                  }}
                                />
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {/* All league matches */}
                {fixtureTab === "all" && (
                  <div>
                    {leagueMatches.map((m, i) => {
                      const t1 = gameState.teams.find(
                        (t) => t.id === m.team1Id,
                      );
                      const t2 = gameState.teams.find(
                        (t) => t.id === m.team2Id,
                      );
                      const isUserMatch =
                        m.team1Id === userTeam.id || m.team2Id === userTeam.id;
                      return (
                        <div
                          key={m.id}
                          className="p-3 rounded-xl"
                          style={{
                            background: isUserMatch
                              ? "rgba(255,154,61,0.05)"
                              : "rgba(15,34,51,0.4)",
                            border: m.completed
                              ? "1px solid rgba(53,224,111,0.15)"
                              : isUserMatch
                                ? "1px solid rgba(255,154,61,0.3)"
                                : "1px solid rgba(30,58,74,0.4)",
                          }}
                          data-ocid={`tournament.league_match.item.${i + 1}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div
                                className="flex items-center gap-2 text-xs"
                                style={{ color: "#A7B3C2" }}
                              >
                                <span>Match {m.id}</span>
                                {m.matchDate && <span>· {m.matchDate}</span>}
                                {!isUserMatch && (
                                  <span
                                    className="px-1.5 py-0.5 rounded text-xs"
                                    style={{
                                      background: "rgba(34,184,199,0.1)",
                                      color: "#22B8C7",
                                      border: "1px solid rgba(34,184,199,0.2)",
                                    }}
                                  >
                                    AI
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-1">
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
                              {m.venue && (
                                <div
                                  className="text-xs mt-0.5"
                                  style={{ color: "#6B7A8F" }}
                                >
                                  📍 {m.venue}
                                </div>
                              )}
                              {m.completed && m.result && (
                                <div
                                  className="text-xs mt-1"
                                  style={{ color: "#FF9A3D" }}
                                >
                                  {m.result}
                                  {m.score1 && m.score2 && (
                                    <span
                                      className="ml-1"
                                      style={{ color: "#6B7A8F" }}
                                    >
                                      ({m.score1} / {m.score2})
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="shrink-0">
                              {!m.completed && isUserMatch && (
                                <button
                                  type="button"
                                  onClick={() => simulateMatch(m.id)}
                                  data-ocid={`tournament.play_all_match.button.${i + 1}`}
                                  className="px-2 py-1 rounded text-xs font-bold"
                                  style={{
                                    background:
                                      "linear-gradient(135deg, #FF6A2A, #FF9A3D)",
                                    color: "#fff",
                                  }}
                                >
                                  PLAY
                                </button>
                              )}
                              {m.completed && (
                                <CheckCircle2
                                  className="w-3 h-3"
                                  style={{ color: "#35E06F" }}
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Playoff matches */}
                {fixtureTab === "playoffs" && (
                  <div>
                    {playoffMatches.length === 0 ? (
                      <p
                        className="text-center py-6 text-sm"
                        style={{ color: "#A7B3C2" }}
                        data-ocid="tournament.playoffs.empty_state"
                      >
                        Playoffs not started yet
                      </p>
                    ) : (
                      playoffMatches.map((m, i) => {
                        const t1 = gameState.teams.find(
                          (t) => t.id === m.team1Id,
                        );
                        const t2 = gameState.teams.find(
                          (t) => t.id === m.team2Id,
                        );
                        const isUserPlayoff =
                          m.team1Id === userTeam.id ||
                          m.team2Id === userTeam.id;
                        return (
                          <div
                            key={m.id}
                            className="p-3 rounded-xl"
                            style={{
                              background: "rgba(15,34,51,0.6)",
                              border:
                                m.phase === "final"
                                  ? "1px solid rgba(255,154,61,0.4)"
                                  : "1px solid rgba(30,58,74,0.5)",
                            }}
                            data-ocid={`tournament.playoff.item.${i + 1}`}
                          >
                            <div
                              className="text-xs font-bold uppercase mb-1 flex items-center gap-2"
                              style={{
                                color:
                                  m.phase === "final" ? "#FF9A3D" : "#22B8C7",
                              }}
                            >
                              {m.phase.toUpperCase()}
                              {m.matchDate && (
                                <span
                                  className="font-normal"
                                  style={{ color: "#6B7A8F" }}
                                >
                                  · {m.matchDate}
                                </span>
                              )}
                              {!isUserPlayoff && (
                                <span
                                  className="px-1.5 py-0.5 rounded text-xs"
                                  style={{
                                    background: "rgba(34,184,199,0.1)",
                                    color: "#22B8C7",
                                    border: "1px solid rgba(34,184,199,0.2)",
                                  }}
                                >
                                  AI
                                </span>
                              )}
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex-1 min-w-0">
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
                                {m.venue && (
                                  <div
                                    className="text-xs mt-0.5"
                                    style={{ color: "#6B7A8F" }}
                                  >
                                    📍 {m.venue}
                                  </div>
                                )}
                                {m.completed && (
                                  <div
                                    className="text-xs mt-0.5"
                                    style={{
                                      color:
                                        m.winner === userTeam.id
                                          ? "#35E06F"
                                          : "#FF9A3D",
                                    }}
                                  >
                                    {m.result}
                                    {m.score1 && m.score2 && (
                                      <span
                                        className="ml-1"
                                        style={{ color: "#6B7A8F" }}
                                      >
                                        ({m.score1} / {m.score2})
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div className="flex gap-1 shrink-0">
                                {!m.completed && isUserPlayoff && (
                                  <button
                                    type="button"
                                    onClick={() => simulateMatch(m.id)}
                                    data-ocid={`tournament.playoff.button.${i + 1}`}
                                    className="px-3 py-1.5 rounded text-xs font-bold"
                                    style={{
                                      background:
                                        "linear-gradient(135deg, #FF6A2A, #FF9A3D)",
                                      color: "#fff",
                                    }}
                                  >
                                    PLAY
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
                            </div>
                          </div>
                        );
                      })
                    )}
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
                className="text-center p-12 rounded-3xl max-w-md w-full mx-4"
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
                  IPL 2026 CHAMPIONS!
                </h2>
                <p className="text-lg mb-2" style={{ color: "#E9EEF5" }}>
                  {gameState.teams.find((t) => t.id === gameState.trophy)
                    ?.name ?? "Your team"}{" "}
                  wins the IPL 2026 Season {gameState.season}!
                </p>
                {gameState.trophy === userTeam.id && (
                  <p className="text-sm mb-4" style={{ color: "#35E06F" }}>
                    Congratulations! You are the IPL 2026 Champions! 🎉
                  </p>
                )}
                <div className="flex gap-3 justify-center mb-4">
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
                <div
                  className="pt-4 space-y-3"
                  style={{ borderTop: "1px solid rgba(30,58,74,0.5)" }}
                >
                  <p
                    className="text-xs font-semibold uppercase tracking-widest"
                    style={{ color: "#A7B3C2" }}
                  >
                    What's next?
                  </p>
                  {gameState.season < 5 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setShowTrophy(false);
                        onNavigate("retention");
                      }}
                      data-ocid="tournament.trophy.season_next.button"
                      className="w-full px-6 py-3 rounded-lg font-bold uppercase tracking-wider"
                      style={{
                        background: "linear-gradient(135deg, #22B8C7, #35E06F)",
                        color: "#070B14",
                      }}
                    >
                      🏏 Continue to Season {gameState.season + 1}
                    </button>
                  ) : (
                    <p
                      className="text-xs text-center py-1"
                      style={{ color: "#FF9A3D" }}
                    >
                      🏆 You've completed all 5 seasons! Legend!
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setShowTrophy(false);
                      if (onReset) onReset();
                    }}
                    data-ocid="tournament.trophy.new_game.button"
                    className="w-full px-6 py-3 rounded-lg font-bold uppercase tracking-wider border"
                    style={{
                      background: "rgba(229,57,53,0.08)",
                      borderColor: "rgba(229,57,53,0.4)",
                      color: "#E53935",
                    }}
                  >
                    🔄 Start New Game
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
