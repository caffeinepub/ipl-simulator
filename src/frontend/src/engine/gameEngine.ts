import { PLAYERS } from "../data/players";
import type { Player, PlayerTournamentStats, TeamData } from "../types/game";

export function getPlayerStats(
  id: number,
  statsArr: PlayerTournamentStats[],
): PlayerTournamentStats {
  const existing = statsArr.find((s) => s.playerId === id);
  if (existing) return existing;
  return {
    playerId: id,
    teamId: -1,
    runs: 0,
    balls: 0,
    fours: 0,
    sixes: 0,
    wickets: 0,
    oversBowled: 0,
    runsConceded: 0,
    innings: 0,
    matchesPlayed: 0,
    strikeRate: 0,
    economy: 0,
    playerOfMatchCount: 0,
  };
}

export function updatePlayerStats(
  statsArr: PlayerTournamentStats[],
  updates: Partial<PlayerTournamentStats> & {
    playerId: number;
    teamId: number;
  },
): PlayerTournamentStats[] {
  const idx = statsArr.findIndex((s) => s.playerId === updates.playerId);
  if (idx === -1) {
    const base = getPlayerStats(updates.playerId, statsArr);
    const updated = { ...base, ...updates };
    updated.strikeRate =
      updated.balls > 0 ? (updated.runs / updated.balls) * 100 : 0;
    updated.economy =
      updated.oversBowled > 0 ? updated.runsConceded / updated.oversBowled : 0;
    return [...statsArr, updated];
  }
  const newStats = [...statsArr];
  const updated = { ...newStats[idx], ...updates };
  updated.strikeRate =
    updated.balls > 0 ? (updated.runs / updated.balls) * 100 : 0;
  updated.economy =
    updated.oversBowled > 0 ? updated.runsConceded / updated.oversBowled : 0;
  newStats[idx] = updated;
  return newStats;
}

export function getTopBatsmen(
  stats: PlayerTournamentStats[],
  n = 10,
): (PlayerTournamentStats & { player: Player })[] {
  return stats
    .filter((s) => s.runs > 0)
    .sort((a, b) => b.runs - a.runs)
    .slice(0, n)
    .map((s) => ({ ...s, player: PLAYERS.find((p) => p.id === s.playerId)! }))
    .filter((s) => s.player);
}

export function getTopWicketTakers(
  stats: PlayerTournamentStats[],
  n = 10,
): (PlayerTournamentStats & { player: Player })[] {
  return stats
    .filter((s) => s.wickets > 0)
    .sort((a, b) => b.wickets - a.wickets || a.economy - b.economy)
    .slice(0, n)
    .map((s) => ({ ...s, player: PLAYERS.find((p) => p.id === s.playerId)! }))
    .filter((s) => s.player);
}

export function getTopSixHitters(
  stats: PlayerTournamentStats[],
  n = 10,
): (PlayerTournamentStats & { player: Player })[] {
  return stats
    .filter((s) => s.sixes > 0)
    .sort((a, b) => b.sixes - a.sixes)
    .slice(0, n)
    .map((s) => ({ ...s, player: PLAYERS.find((p) => p.id === s.playerId)! }))
    .filter((s) => s.player);
}

export function getTopFourHitters(
  stats: PlayerTournamentStats[],
  n = 10,
): (PlayerTournamentStats & { player: Player })[] {
  return stats
    .filter((s) => s.fours > 0)
    .sort((a, b) => b.fours - a.fours)
    .slice(0, n)
    .map((s) => ({ ...s, player: PLAYERS.find((p) => p.id === s.playerId)! }))
    .filter((s) => s.player);
}

export function getBestStrikeRate(
  stats: PlayerTournamentStats[],
  n = 10,
): (PlayerTournamentStats & { player: Player })[] {
  return stats
    .filter((s) => s.balls >= 20)
    .sort((a, b) => b.strikeRate - a.strikeRate)
    .slice(0, n)
    .map((s) => ({ ...s, player: PLAYERS.find((p) => p.id === s.playerId)! }))
    .filter((s) => s.player);
}

export function getPlayerOfTournament(
  stats: PlayerTournamentStats[],
): (PlayerTournamentStats & { player: Player }) | null {
  const candidates = stats
    .map((s) => ({ ...s, player: PLAYERS.find((p) => p.id === s.playerId)! }))
    .filter((s) => s.player);
  if (!candidates.length) return null;
  const scored = candidates.map((s) => ({
    ...s,
    score:
      s.runs * 1 + s.wickets * 25 + s.sixes * 3 + s.playerOfMatchCount * 30,
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored[0];
}

export function generateLeagueFixtures(
  teamIds: number[],
): { team1Id: number; team2Id: number }[] {
  const fixtures: { team1Id: number; team2Id: number }[] = [];
  for (let i = 0; i < teamIds.length; i++) {
    for (let j = i + 1; j < teamIds.length; j++) {
      fixtures.push({ team1Id: teamIds[i], team2Id: teamIds[j] });
    }
  }
  for (let i = fixtures.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [fixtures[i], fixtures[j]] = [fixtures[j], fixtures[i]];
  }
  return fixtures;
}

export function calculateNRR(
  runsFor: number,
  overs: number,
  runsAgainst: number,
  oversAgainst: number,
): number {
  if (overs === 0 || oversAgainst === 0) return 0;
  return runsFor / overs - runsAgainst / oversAgainst;
}

export function aiPickPlayingXI(
  squad: number[],
  allPlayers: Player[],
): number[] {
  const squadPlayers = squad
    .map((id) => allPlayers.find((p) => p.id === id)!)
    .filter(Boolean);

  const wks = squadPlayers.filter((p) => p.role === "WicketKeeper");
  const batsmen = squadPlayers.filter((p) => p.role === "Batsman");
  const bowlers = squadPlayers.filter((p) => p.role === "Bowler");
  const allrounders = squadPlayers.filter((p) => p.role === "AllRounder");

  const xi: number[] = [];

  if (wks.length > 0)
    xi.push(wks.sort((a, b) => b.battingAvg - a.battingAvg)[0].id);

  const sortedBat = [...batsmen].sort((a, b) => b.battingAvg - a.battingAvg);
  for (const b of sortedBat.slice(0, 4)) {
    if (xi.length < 8) xi.push(b.id);
  }

  const sortedAR = [...allrounders].sort(
    (a, b) =>
      b.battingAvg + (30 - b.bowlingAvg) - (a.battingAvg + (30 - a.bowlingAvg)),
  );
  for (const ar of sortedAR.slice(0, 3)) {
    if (xi.length < 9) xi.push(ar.id);
  }

  const sortedBowl = [...bowlers].sort((a, b) => a.bowlingAvg - b.bowlingAvg);
  for (const bw of sortedBowl) {
    if (xi.length >= 11) break;
    xi.push(bw.id);
  }

  const remaining = squadPlayers.filter((p) => !xi.includes(p.id));
  for (const p of remaining) {
    if (xi.length >= 11) break;
    xi.push(p.id);
  }

  return xi.slice(0, 11);
}

export function aiBid(
  player: Player,
  team: TeamData,
  currentBid: number,
  _allTeams: TeamData[],
): number | null {
  const squad = team.squad;

  if (squad.length >= 15) return null;

  const maxBid = Math.min(
    player.basePrice * 2.5,
    team.budget * 0.3,
    team.budget - 10,
  );

  if (currentBid >= maxBid) return null;

  const willBid = Math.random() > 0.4;
  if (!willBid) return null;

  const increments = [0.25, 0.5, 1, 2];
  const inc = increments[Math.floor(Math.random() * increments.length)];
  const newBid = Math.round((currentBid + inc) * 4) / 4;

  if (newBid > team.budget) return null;

  return newBid;
}
