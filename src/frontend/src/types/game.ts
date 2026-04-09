// Types for IPL Simulator

export type PlayerRole = "Batsman" | "Bowler" | "AllRounder" | "WicketKeeper";
export type BattingStyle = "RHB" | "LHB";
export type BowlingStyle = "Fast" | "Medium" | "Spin" | "None";

export interface Player {
  id: number;
  name: string;
  role: PlayerRole;
  isCapped: boolean;
  country: string;
  basePrice: number; // in Cr
  battingAvg: number;
  strikeRate: number;
  bowlingAvg: number;
  economy: number;
  battingStyle: BattingStyle;
  bowlingStyle: BowlingStyle;
  teamColor: string;
  jerseyNumber: number;
  auctionSet: string; // e.g. "WK-Set-1", "Bat-Set-1", "Bowl-Set-2", "AR-Set-3"
}

export interface TeamData {
  id: number;
  name: string;
  shortName: string;
  primaryColor: string;
  secondaryColor: string;
  isUserTeam: boolean;
  budget: number; // in Cr
  squad: number[]; // player ids
  playingXI: number[]; // player ids
  impactPlayerId?: number;
  wins: number;
  losses: number;
  points: number;
  nrr: number;
  matchesPlayed: number;
  homeVenue?: string;
}

export type ShotType = "DEFENSIVE" | "NORMAL" | "AGGRESSIVE";
export type ShotDirection = "GROUNDED" | "LOFTED";
export type BallType =
  | "INSWING"
  | "OUTSWING"
  | "LEG_CUTTER"
  | "OFF_CUTTER"
  | "BOUNCER"
  | "SLIDER"
  | "YORKER"
  | "OFF_SPIN"
  | "LEG_SPIN"
  | "ARM_BALL"
  | "CARROM_BALL"
  | "GOOGLY";
export type BowlingSpeed = "SLOW" | "MEDIUM" | "FAST";

export interface BallOutcome {
  runs: number;
  isWicket: boolean;
  isWide: boolean;
  isNoBall: boolean;
  isFour: boolean;
  isSix: boolean;
  commentary: string;
  wicketType?: string;
}

export interface BatterStats {
  playerId: number;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  isOut: boolean;
  dismissal?: string;
}

export interface BowlerStats {
  playerId: number;
  overs: number;
  balls: number;
  runs: number;
  wickets: number;
  wides: number;
  noBalls: number;
}

export interface InningsState {
  battingTeamId: number;
  bowlingTeamId: number;
  totalRuns: number;
  wickets: number;
  balls: number; // total legal balls
  overs: number;
  extras: number;
  batterStats: BatterStats[];
  bowlerStats: BowlerStats[];
  currentBatterIds: [number, number]; // [striker, non-striker]
  currentBowlerId: number;
  fallOfWickets: { wicket: number; runs: number; over: string }[];
}

export interface MatchState {
  id: number;
  team1Id: number;
  team2Id: number;
  tossWinner: number;
  tossChoice: "bat" | "bowl";
  phase: "setup" | "innings1" | "innings2" | "result";
  innings1: InningsState;
  innings2: InningsState;
  target?: number;
  result?: string;
  winner?: number;
  playerOfMatch?: number;
  matchType: "league" | "qualifier1" | "eliminator" | "qualifier2" | "final";
  impactPlayerUsed1: boolean;
  impactPlayerUsed2: boolean;
  matchId?: number; // links back to TournamentMatch.id
  venue?: string;
  // Super Over fields
  isSuperOver?: boolean;
  superOverPhase?: "so_innings1" | "so_innings2" | "so_result";
  superOverInnings1?: InningsState;
  superOverInnings2?: InningsState;
  superOverTarget?: number;
  superOverResult?: string;
  superOverWinner?: number;
}

export interface AuctionBid {
  teamId: number;
  amount: number;
  timestamp: number;
}

export interface AuctionPlayerState {
  playerId: number;
  currentBid: number;
  currentBidderTeamId?: number;
  timerSeconds: number;
  bids: AuctionBid[];
  status: "active" | "sold" | "unsold";
}

export interface TournamentMatch {
  id: number;
  team1Id: number;
  team2Id: number;
  phase: "league" | "qualifier1" | "eliminator" | "qualifier2" | "final";
  completed: boolean;
  winner?: number;
  result?: string;
  score1?: string;
  score2?: string;
  venue?: string;
  matchDate?: string;
}

export interface PlayerTournamentStats {
  playerId: number;
  teamId: number;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  wickets: number;
  oversBowled: number;
  runsConceded: number;
  innings: number;
  matchesPlayed: number;
  strikeRate: number;
  economy: number;
  playerOfMatchCount: number;
  centuries: number;
  halfCenturies: number;
}

export interface RetentionEntry {
  playerId: number;
  teamId: number;
  retentionCost: number; // Cr
  isRTM: boolean;
}

export interface GameState {
  season: number;
  phase:
    | "home"
    | "franchise"
    | "auction"
    | "team"
    | "match"
    | "tournament"
    | "leaderboard"
    | "retention";
  teams: TeamData[];
  auctionQueue: number[]; // player ids in order
  auctionIndex: number;
  auctionComplete: boolean;
  currentAuctionPlayer?: AuctionPlayerState;
  currentMatch?: MatchState;
  tournamentMatches: TournamentMatch[];
  tournamentPhase:
    | "group"
    | "qualifier1"
    | "eliminator"
    | "qualifier2"
    | "final"
    | "complete";
  playerStats: PlayerTournamentStats[];
  retainedPlayers: number[]; // for season 2+
  retentionEntries?: RetentionEntry[];
  rtmCards: { teamId: number; count: number }[];
  trophy?: number; // winning team id
}
