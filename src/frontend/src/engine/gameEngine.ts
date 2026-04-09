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
    centuries: 0,
    halfCenturies: 0,
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

export function getTopCenturyScorers(
  stats: PlayerTournamentStats[],
  n = 10,
): (PlayerTournamentStats & { player: Player })[] {
  return stats
    .filter((s) => (s.centuries ?? 0) > 0)
    .sort((a, b) => (b.centuries ?? 0) - (a.centuries ?? 0))
    .slice(0, n)
    .map((s) => ({ ...s, player: PLAYERS.find((p) => p.id === s.playerId)! }))
    .filter((s) => s.player);
}

export function getTopFiftyScorers(
  stats: PlayerTournamentStats[],
  n = 10,
): (PlayerTournamentStats & { player: Player })[] {
  return stats
    .filter((s) => (s.halfCenturies ?? 0) > 0)
    .sort((a, b) => (b.halfCenturies ?? 0) - (a.halfCenturies ?? 0))
    .slice(0, n)
    .map((s) => ({ ...s, player: PLAYERS.find((p) => p.id === s.playerId)! }))
    .filter((s) => s.player);
}

export function getBestEconomy(
  stats: PlayerTournamentStats[],
  n = 10,
): (PlayerTournamentStats & { player: Player })[] {
  return stats
    .filter((s) => s.oversBowled >= 1)
    .sort((a, b) => a.economy - b.economy)
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
  teams?: TeamData[],
): { team1Id: number; team2Id: number; venue: string }[] {
  const fixtures: { team1Id: number; team2Id: number; venue: string }[] = [];
  for (let i = 0; i < teamIds.length; i++) {
    for (let j = i + 1; j < teamIds.length; j++) {
      const homeTeam = teams?.find((t) => t.id === teamIds[i]);
      const venue = homeTeam?.homeVenue ?? "TBD Stadium";
      fixtures.push({ team1Id: teamIds[i], team2Id: teamIds[j], venue });
    }
  }
  // Shuffle
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

  const wks = squadPlayers
    .filter((p) => p.role === "WicketKeeper")
    .sort((a, b) => b.battingAvg - a.battingAvg);
  const batsmen = squadPlayers
    .filter((p) => p.role === "Batsman")
    .sort((a, b) => b.battingAvg - a.battingAvg);
  const allrounders = squadPlayers
    .filter((p) => p.role === "AllRounder")
    .sort(
      (a, b) =>
        b.battingAvg +
        (30 - b.bowlingAvg) -
        (a.battingAvg + (30 - a.bowlingAvg)),
    );
  const spinBowlers = squadPlayers
    .filter((p) => p.role === "Bowler" && p.bowlingStyle === "Spin")
    .sort((a, b) => a.bowlingAvg - b.bowlingAvg);
  const paceBowlers = squadPlayers
    .filter(
      (p) =>
        p.role === "Bowler" &&
        (p.bowlingStyle === "Fast" || p.bowlingStyle === "Medium"),
    )
    .sort((a, b) => a.bowlingAvg - b.bowlingAvg);

  const xi: number[] = [];
  let overseasCount = 0;
  const MAX_OVERSEAS = 4;

  const add = (id: number) => {
    if (xi.includes(id) || xi.length >= 11) return;
    const player = allPlayers.find((p) => p.id === id);
    const isOverseas = player && player.country !== "India";
    if (isOverseas && overseasCount >= MAX_OVERSEAS) return; // skip if overseas limit reached
    if (isOverseas) overseasCount++;
    xi.push(id);
  };

  // 1 WK (best by batting avg)
  if (wks[0]) add(wks[0].id);

  // 3 batsmen (top 3 by avg)
  for (const b of batsmen.slice(0, 3)) add(b.id);

  // 2 allrounders
  for (const ar of allrounders.slice(0, 2)) add(ar.id);

  // 2 spin bowlers
  for (const sp of spinBowlers.slice(0, 2)) add(sp.id);

  // 2 pace bowlers
  for (const pb of paceBowlers.slice(0, 2)) add(pb.id);

  // Fill remaining (slots 10-11) with best available not yet in XI
  const remaining = squadPlayers
    .filter((p) => !xi.includes(p.id))
    .sort((a, b) => {
      const scoreA = a.battingAvg + (a.bowlingAvg < 99 ? 30 - a.bowlingAvg : 0);
      const scoreB = b.battingAvg + (b.bowlingAvg < 99 ? 30 - b.bowlingAvg : 0);
      return scoreB - scoreA;
    });
  for (const p of remaining) add(p.id);

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

  // Hard cap: AI never bids above 30 Cr -- not realistic
  if (currentBid >= 30) return null;

  // Don't overpay cheap players
  if (currentBid >= 20 && player.basePrice < 10) return null;

  const maxBid = Math.min(
    player.basePrice * 2.5,
    team.budget * 0.3,
    team.budget - 10,
    29.9, // enforce cap
  );

  if (currentBid >= maxBid) return null;

  const willBid = Math.random() > 0.4;
  if (!willBid) return null;

  const increments = [0.25, 0.5, 1, 2];
  const inc = increments[Math.floor(Math.random() * increments.length)];
  const newBid = Math.min(Math.round((currentBid + inc) * 4) / 4, 30);

  if (newBid > team.budget) return null;
  if (newBid > 30) return null;

  return newBid;
}
