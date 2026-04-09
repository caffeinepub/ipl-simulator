import type {
  BallOutcome,
  BallType,
  BowlingSpeed,
  Player,
  ShotDirection,
  ShotType,
} from "../types/game";

// Commentary templates with player name placeholders {B} = batter, {W} = bowler
const COMMENTARY_TEMPLATES = {
  dot: [
    "Tight delivery outside off by {W}, {B} plays back carefully. DOT BALL.",
    "Excellent line and length from {W} — {B} can't score.",
    "Back of length from {W}, {B} defends solidly. No run.",
    "{W} beats {B} outside off! Great bowling!",
    "Well directed delivery from {W} — {B} watches it go through. DOT.",
    "Fantastic bowling by {W}! {B} is completely beaten.",
    "{W} fires in a good length delivery, {B} pushes to cover. No run.",
  ],
  single: [
    "{B} nudges {W} through midwicket for a single.",
    "{B} works off the hips down to fine leg. 1 run.",
    "{B} taps {W} to covers, quick single taken.",
    "{B} clips off the pads, easy single.",
    "{B} pushes {W} to mid-on, well-judged single.",
    "{B} works through square leg for one off {W}.",
  ],
  two: [
    "{B} drives {W} beautifully — bisects mid-off and extra cover for TWO!",
    "{B} cuts hard off {W}, fielder misfields in the deep, they come back for two.",
    "{B} drives past mid-on off {W}, quick running for 2.",
    "{B} edges {W} past the keeper, no fielder nearby. 2 runs.",
  ],
  three: [
    "EXCELLENT running by {B}! Three from a well-placed shot off {W}.",
    "{B} hits {W} hard to the boundary but fielder intercepts — THREE!",
    "{B} drives {W} deep, magnificent running between the wickets. 3 runs!",
  ],
  four: [
    "SHOT! {B} drives {W} beautifully through covers. FOUR!",
    "{B} PULLS {W} hard over midwicket. BOUNDARY!",
    "{B} cuts {W} hard past backward point. FOUR!",
    "{B} late cuts {W}, the ball races to the third man boundary. FOUR!",
    "{B} drives {W} on the up through extra cover. FOUR!",
    "{B} flicks {W} off the pads, splits the field perfectly. FOUR!",
    "Straight drive by {B} off {W}, majestic timing. FOUR!",
    "{B} top-edges {W} over the keeper for FOUR!",
    "{B} reverse sweeps {W} — incredible execution! FOUR!",
  ],
  six: [
    "MASSIVE SIX by {B}! {W} sent over the mid-wicket boundary!",
    "{B} goes HUGE off {W}! Over long-on! What a shot! SIX!",
    "{B} slog sweeps {W}, up and over deep square leg. SIX!",
    "{B} steps out and hits {W} clean over the bowler's head. SIX!",
    "{B} upper cuts {W}, soars over third man. SIX!",
    "{B} reverse sweeps {W} for SIX! Unbelievable!",
    "{B} SMASHES {W} flat over long-off! Incredible power! SIX!",
    "What a clean hit by {B} off {W}! The ball disappears into the crowd! SIX!",
    "{B} ramps {W} over fine leg for SIX! Brilliant!",
  ],
  wicket: [
    "OUT! {B} BOWLED by {W}! Stumps shattered! What a delivery!",
    "CAUGHT! {B} edges {W} and taken cleanly behind the wicket!",
    "LBW! {B} is plumb in front of {W}, the finger goes up!",
    "RUN OUT! {B} caught short of the crease! Direct hit!",
    "CAUGHT at deep midwicket! {B} holes out off {W}!",
    "{B} OUT! Caught at the boundary off {W}! What a stunning catch!",
    "Clean bowled through the gate! {W} rips through {B}'s defence!",
    "STUMPED! {B} wanders out of the crease against {W}! Quick as a flash!",
    "Excellent delivery by {W}! {B} has no answer to that! OUT!",
    "{W} strikes! {B} departs for a duck! The crowd goes wild!",
  ],
  wicket_star: [
    "BOWLED! Ripped by {W}... {B} has to go for a duck!",
    "{B} goes down the ground... {W} takes the wicket! Stunned!",
    "{W} finishes off in style! {B} walks back!",
    "What a delivery from {W}! {B} never saw that coming!",
  ],
  six_star: [
    "{B} goes down the ground! {B} goes OUT of the ground! What a SIX!",
    "{B} finishes off in style! MAXIMUM!",
    "Nobody does it better than {B}! That's gone MILES!",
  ],
  wide: [
    "Wide! {W} sends one down the leg side, batter can't reach. WIDE.",
    "Wide outside off stump from {W}. WIDE.",
    "Too far down the leg from {W}, called WIDE.",
  ],
  noBall: ["No ball! {W} overstepped. FREE HIT next ball!"],
};

function pick(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildCommentary(
  template: string,
  batterName: string,
  bowlerName: string,
): string {
  return template.replace(/\{B\}/g, batterName).replace(/\{W\}/g, bowlerName);
}

function rand(): number {
  return Math.random();
}

export function simulateBall(
  shotType: ShotType,
  direction: ShotDirection,
  ballType: BallType,
  speed: BowlingSpeed,
  batter: Player,
  bowler: Player,
  _ballInOver: number,
  isLastOver: boolean,
): BallOutcome {
  const batterName = batter.name;
  const bowlerName = bowler.name;

  // Base probabilities — tuned for ~155-175 runs per innings in T20
  let pDot = 0.24;
  let pSingle = 0.3;
  let pTwo = 0.12;
  let pThree = 0.03;
  let pFour = 0.15;
  let pSix = 0.09;
  let pWicket = 0.028;
  let pWide = 0.03;
  let pNoBall = 0.015;

  // ---- Player quality modifiers ----
  const rawBattingQuality = Math.max(
    0.5,
    Math.min(1.8, (batter.battingAvg / 35) * (batter.strikeRate / 130)),
  );

  // "Good day" for weaker batters (15% chance they punch above weight)
  const isGoodDay = batter.battingAvg < 25 && Math.random() < 0.15;

  // "Bad day" for good batters — even the best have off days (8% chance)
  const isBadDay = batter.battingAvg >= 40 && Math.random() < 0.08;

  let effectiveBattingQuality: number;
  if (isGoodDay) {
    effectiveBattingQuality = rawBattingQuality * 1.4;
  } else if (isBadDay) {
    effectiveBattingQuality = rawBattingQuality * 0.62;
  } else {
    effectiveBattingQuality = rawBattingQuality;
  }

  // Great bowlers take more wickets and generate more dots
  let bowlingQuality: number;
  const isEliteBowler = bowler.role !== "Batsman" && bowler.bowlingAvg <= 20;
  const isGoodBowler =
    bowler.role !== "Batsman" &&
    bowler.bowlingAvg > 20 &&
    bowler.bowlingAvg <= 25;

  if (bowler.role === "Batsman") {
    bowlingQuality = 0.6;
  } else if (isEliteBowler) {
    bowlingQuality = 1.3;
  } else if (isGoodBowler) {
    bowlingQuality = 1.05;
  } else {
    bowlingQuality = 0.85;
  }

  // "Bad day" for elite bowlers — rare (6% chance) off day
  const isBowlerBadDay = isEliteBowler && Math.random() < 0.06;
  if (isBowlerBadDay) {
    // On bad day: reduced wicket rate, more runs conceded
    bowlingQuality = bowlingQuality * 0.55;
    pFour += 0.04;
    pSix += 0.03;
  }

  // Apply quality to base probs
  pFour *= effectiveBattingQuality;
  pSix *= effectiveBattingQuality;
  pSingle *= Math.max(0.7, effectiveBattingQuality);
  pWicket *= bowlingQuality / Math.max(0.7, effectiveBattingQuality);
  pDot *= bowlingQuality;

  // Adjust for shot type
  if (shotType === "DEFENSIVE") {
    pDot += 0.2;
    pSingle += 0.04;
    pFour -= 0.06;
    pSix -= 0.04;
    pWicket -= 0.01;
  } else if (shotType === "AGGRESSIVE") {
    pDot -= 0.08;
    pFour += 0.08;
    pSix += 0.1;
    pWicket += 0.025;
    pSingle -= 0.04;
  }

  // Adjust for direction
  if (direction === "LOFTED") {
    pFour += 0.04;
    pSix += 0.09;
    pWicket += 0.02;
    pDot -= 0.05;
  } else {
    pFour += 0.03;
    pDot += 0.02;
    pWicket -= 0.005;
  }

  // Adjust for ball type
  switch (ballType) {
    case "YORKER":
      pDot += 0.1;
      pWicket += 0.015;
      pFour -= 0.05;
      pSix -= 0.04;
      if (speed === "FAST") {
        pDot += 0.04;
        pWicket += 0.01;
      }
      break;
    case "BOUNCER":
      pSix += 0.04;
      pWicket += 0.02;
      pFour += 0.02;
      if (speed === "FAST") {
        pWicket += 0.015;
      }
      break;
    case "INSWING":
    case "OUTSWING":
      pWicket += 0.015;
      pDot += 0.04;
      if (speed === "MEDIUM") {
        pWicket += 0.008;
      }
      break;
    case "LEG_CUTTER":
    case "OFF_CUTTER":
      pWicket += 0.012;
      pDot += 0.04;
      break;
    case "SLIDER":
      pWicket += 0.008;
      pDot += 0.05;
      pSix -= 0.02;
      break;
    case "OFF_SPIN":
      pDot += 0.08;
      pWicket += 0.013;
      pSix -= 0.02;
      pFour -= 0.01;
      break;
    case "LEG_SPIN":
      pDot += 0.06;
      pWicket += 0.018;
      pSix -= 0.01;
      break;
    case "ARM_BALL":
      pDot += 0.07;
      pWicket += 0.012;
      pSix -= 0.02;
      break;
    case "CARROM_BALL":
      pDot += 0.07;
      pWicket += 0.016;
      pFour -= 0.01;
      break;
    case "GOOGLY":
      pDot += 0.05;
      pWicket += 0.02;
      pSix -= 0.015;
      break;
  }

  if (isLastOver) {
    pFour *= 1.2;
    pSix *= 1.3;
  }

  // Clamp negatives to 0
  pDot = Math.max(0, pDot);
  pSingle = Math.max(0, pSingle);
  pTwo = Math.max(0, pTwo);
  pThree = Math.max(0, pThree);
  pFour = Math.max(0, pFour);
  pSix = Math.max(0, pSix);
  pWicket = Math.min(0.1, Math.max(0, pWicket));

  // Normalize & determine outcome
  const total =
    pDot + pSingle + pTwo + pThree + pFour + pSix + pWicket + pWide + pNoBall;
  let r = rand() * total;

  if (r < pWide)
    return {
      runs: 1,
      isWicket: false,
      isWide: true,
      isNoBall: false,
      isFour: false,
      isSix: false,
      commentary: buildCommentary(
        pick(COMMENTARY_TEMPLATES.wide),
        batterName,
        bowlerName,
      ),
    };
  r -= pWide;
  if (r < pNoBall)
    return {
      runs: 1,
      isWicket: false,
      isWide: false,
      isNoBall: true,
      isFour: false,
      isSix: false,
      commentary: buildCommentary(
        pick(COMMENTARY_TEMPLATES.noBall),
        batterName,
        bowlerName,
      ),
    };
  r -= pNoBall;
  if (r < pWicket) {
    // Use star commentary for famous players
    const isStarPlayer = batter.battingAvg >= 40 || batter.strikeRate >= 150;
    const wicketTemplates = isStarPlayer
      ? [...COMMENTARY_TEMPLATES.wicket, ...COMMENTARY_TEMPLATES.wicket_star]
      : COMMENTARY_TEMPLATES.wicket;
    return {
      runs: 0,
      isWicket: true,
      isWide: false,
      isNoBall: false,
      isFour: false,
      isSix: false,
      commentary: buildCommentary(
        pick(wicketTemplates),
        batterName,
        bowlerName,
      ),
      wicketType: "caught",
    };
  }
  r -= pWicket;
  if (r < pSix) {
    const isStarPlayer = batter.battingAvg >= 40 || batter.strikeRate >= 150;
    const sixTemplates = isStarPlayer
      ? [...COMMENTARY_TEMPLATES.six, ...COMMENTARY_TEMPLATES.six_star]
      : COMMENTARY_TEMPLATES.six;
    return {
      runs: 6,
      isWicket: false,
      isWide: false,
      isNoBall: false,
      isFour: false,
      isSix: true,
      commentary: buildCommentary(pick(sixTemplates), batterName, bowlerName),
    };
  }
  r -= pSix;
  if (r < pFour)
    return {
      runs: 4,
      isWicket: false,
      isWide: false,
      isNoBall: false,
      isFour: true,
      isSix: false,
      commentary: buildCommentary(
        pick(COMMENTARY_TEMPLATES.four),
        batterName,
        bowlerName,
      ),
    };
  r -= pFour;
  if (r < pThree)
    return {
      runs: 3,
      isWicket: false,
      isWide: false,
      isNoBall: false,
      isFour: false,
      isSix: false,
      commentary: buildCommentary(
        pick(COMMENTARY_TEMPLATES.three),
        batterName,
        bowlerName,
      ),
    };
  r -= pThree;
  if (r < pTwo)
    return {
      runs: 2,
      isWicket: false,
      isWide: false,
      isNoBall: false,
      isFour: false,
      isSix: false,
      commentary: buildCommentary(
        pick(COMMENTARY_TEMPLATES.two),
        batterName,
        bowlerName,
      ),
    };
  r -= pTwo;
  if (r < pSingle)
    return {
      runs: 1,
      isWicket: false,
      isWide: false,
      isNoBall: false,
      isFour: false,
      isSix: false,
      commentary: buildCommentary(
        pick(COMMENTARY_TEMPLATES.single),
        batterName,
        bowlerName,
      ),
    };

  return {
    runs: 0,
    isWicket: false,
    isWide: false,
    isNoBall: false,
    isFour: false,
    isSix: false,
    commentary: buildCommentary(
      pick(COMMENTARY_TEMPLATES.dot),
      batterName,
      bowlerName,
    ),
  };
}

export function simulateAIBall(
  batter: Player,
  bowler: Player,
  _ballInOver: number,
  isLastOver: boolean,
  target?: number,
  currentRuns?: number,
  ballsLeft?: number,
): BallOutcome {
  // AI batting: choose shot type based on situation
  let shotType: ShotType = "NORMAL";
  let direction: ShotDirection = "GROUNDED";

  if (
    target !== undefined &&
    currentRuns !== undefined &&
    ballsLeft !== undefined &&
    ballsLeft > 0
  ) {
    const needed = target - currentRuns;
    const rr = needed / (ballsLeft / 6);
    if (rr > 12) {
      shotType = "AGGRESSIVE";
      direction = "LOFTED";
    } else if (rr > 8) {
      shotType = "AGGRESSIVE";
      direction = "GROUNDED";
    } else if (rr < 5) {
      shotType = "DEFENSIVE";
    }
  } else if (isLastOver) {
    shotType = "AGGRESSIVE";
    direction = Math.random() > 0.4 ? "LOFTED" : "GROUNDED";
  }

  // Include all ball types (pace + spin) for AI variety
  const ballTypes: BallType[] = [
    "INSWING",
    "OUTSWING",
    "YORKER",
    "BOUNCER",
    "SLIDER",
    "LEG_CUTTER",
    "OFF_CUTTER",
    "OFF_SPIN",
    "LEG_SPIN",
    "ARM_BALL",
    "CARROM_BALL",
    "GOOGLY",
  ];
  const ballType = ballTypes[Math.floor(Math.random() * ballTypes.length)];
  const speeds: BowlingSpeed[] = ["SLOW", "MEDIUM", "FAST"];
  const speed = speeds[Math.floor(Math.random() * speeds.length)];

  return simulateBall(
    shotType,
    direction,
    ballType,
    speed,
    batter,
    bowler,
    0,
    isLastOver,
  );
}
