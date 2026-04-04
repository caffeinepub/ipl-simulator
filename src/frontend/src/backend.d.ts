import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export interface AuctionState {
    currentPlayerIndex: bigint;
    isActive: boolean;
    currentBidderId?: bigint;
    currentBid: bigint;
}
export interface Team {
    id: bigint;
    impactPlayerId?: bigint;
    isAI: boolean;
    name: string;
    playingXI: Array<bigint>;
    squad: Array<bigint>;
    budget: bigint;
}
export interface backendInterface {
    getAuctionState(): Promise<AuctionState>;
    getSquad(teamId: bigint): Promise<Array<bigint>>;
    getTeam(teamId: bigint): Promise<Team>;
    passPlayer(): Promise<void>;
    placeBid(teamId: bigint, amount: bigint): Promise<void>;
    setImpactPlayer(teamId: bigint, playerId: bigint): Promise<void>;
    setPlayingXI(teamId: bigint, playerIds: Array<bigint>): Promise<void>;
    startAuction(): Promise<void>;
}
