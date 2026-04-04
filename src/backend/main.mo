import Map "mo:core/Map";
import Int "mo:core/Int";
import Nat "mo:core/Nat";
import Text "mo:core/Text";
import Principal "mo:core/Principal";
import Array "mo:core/Array";
import Runtime "mo:core/Runtime";
import Option "mo:core/Option";

actor {
  // Types
  type Player = {
    id : Nat;
    name : Text;
    role : {
      #Batsman;
      #Bowler;
      #AllRounder;
      #WicketKeeper;
    };
    isCapped : Bool;
    basePrice : Nat;
    teamId : ?Nat;
    runs : Nat;
    wickets : Nat;
    sixes : Nat;
    fours : Nat;
  };

  type Team = {
    id : Nat;
    name : Text;
    budget : Nat;
    squad : [Nat];
    playingXI : [Nat];
    impactPlayerId : ?Nat;
    isAI : Bool;
  };

  type AuctionState = {
    currentPlayerIndex : Nat;
    currentBid : Nat;
    currentBidderId : ?Nat;
    isActive : Bool;
  };

  // Persistent state
  let players = Map.empty<Nat, Player>();
  let teams = Map.empty<Nat, Team>();
  var auctionState : AuctionState = {
    currentPlayerIndex = 0;
    currentBid = 0;
    currentBidderId = null;
    isActive = false;
  };

  // Auction Functions
  public shared ({ caller }) func startAuction() : async () {
    auctionState := {
      currentPlayerIndex = 0;
      currentBid = 0;
      currentBidderId = null;
      isActive = true;
    };
  };

  public shared ({ caller }) func placeBid(teamId : Nat, amount : Nat) : async () {
    let team = switch (teams.get(teamId)) {
      case (null) { Runtime.trap("Team not found") };
      case (?team) { team };
    };
    if (amount > team.budget) {
      Runtime.trap("Insufficient budget");
    };
    if (amount <= auctionState.currentBid) {
      Runtime.trap("Bid too low");
    };
    auctionState := {
      auctionState with
      currentBid = amount;
      currentBidderId = ?teamId;
    };
  };

  public shared ({ caller }) func passPlayer() : async () {
    auctionState := {
      currentPlayerIndex = auctionState.currentPlayerIndex + 1;
      currentBid = 0;
      currentBidderId = null;
      isActive = auctionState.isActive;
    };
  };

  public query ({ caller }) func getAuctionState() : async AuctionState {
    auctionState;
  };

  // Team Management Functions
  public shared ({ caller }) func setPlayingXI(teamId : Nat, playerIds : [Nat]) : async () {
    if (playerIds.size() != 11) { Runtime.trap("Playing XI must have 11 players") };
    let team = switch (teams.get(teamId)) {
      case (null) { Runtime.trap("Team not found") };
      case (?team) { team };
    };
    teams.add(teamId, { team with playingXI = playerIds });
  };

  public shared ({ caller }) func setImpactPlayer(teamId : Nat, playerId : Nat) : async () {
    let team = switch (teams.get(teamId)) {
      case (null) { Runtime.trap("Team not found") };
      case (?team) { team };
    };
    teams.add(teamId, { team with impactPlayerId = ?playerId });
  };

  public query ({ caller }) func getTeam(teamId : Nat) : async Team {
    switch (teams.get(teamId)) {
      case (null) { Runtime.trap("Team not found") };
      case (?team) { team };
    };
  };

  public query ({ caller }) func getSquad(teamId : Nat) : async [Nat] {
    switch (teams.get(teamId)) {
      case (null) { Runtime.trap("Team not found") };
      case (?team) { team.squad };
    };
  };
};
