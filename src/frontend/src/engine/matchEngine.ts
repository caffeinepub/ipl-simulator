import type {
  BallOutcome,
  BallType,
  BowlingSpeed,
  Player,
  ShotDirection,
  ShotType,
} from "../types/game";

// Commentary templates
const COMMENTARY = {
  dot: [
    "Tight delivery outside off, played back carefully. DOT BALL.",
    "Well directed yorker, squeezed out to square leg. DOT BALL.",
    "Back of length, defended solidly. No run.",
    "Excellent line and length, beaten outside the off stump.",
    "Played back down the pitch. Good leaving shot.",
  ],
  single: [
    "Nudged through midwicket for a single.",
    "Worked off the hips down to fine leg. 1 run.",
    "Tapped to covers, quick single taken.",
    "Clipped off the pads, easy single.",
    "Pushed to mid-on, well-judged single.",
  ],
  two: [
    "Well-timed drive bisects mid-off and extra cover for TWO!",
    "Cut hard, fielder misfields in the deep, they come back for two.",
    "Driven past mid-on, quick running for 2.",
    "Edged past the keeper, no fielder nearby, 2 runs.",
  ],
  three: [
    "EXCELLENT running! Three from a well-placed shot.",
    "Hard-hit to the boundary, fielder intercepts, THREE!",
    "Driven deep, magnificent running between the wickets, 3 runs!",
  ],
  four: [
    "SHOT! Driven beautifully through covers. FOUR!",
    "Pulled hard over midwicket. BOUNDARY!",
    "Cut hard past backward point. FOUR!",
    "Late cut, the ball races to the third man boundary. FOUR!",
    "Driven on the up through extra cover. FOUR!",
    "Flicked off the pads, splits the field perfectly. FOUR!",
    "Straight drive, majestic timing. FOUR!",
  ],
  six: [
    "MASSIVE SIX! Cleared the mid-wicket boundary with ease!",
    "HUGE! Over long-on! What a shot! SIX!",
    "Slog sweep, up and over deep square leg. SIX!",
    "Stepped out and hit it clean over the bowler's head. SIX!",
    "Upper cut, soars over third man. SIX!",
    "Reverse sweep for SIX! Unbelievable!",
    "Smashed flat over long-off! Incredible power! SIX!",
  ],
  wicket: [
    "OUT! Clean bowled! Stumps shattered!",
    "CAUGHT! Edged and taken cleanly behind the wicket!",
    "LBW! Plumb in front, the finger goes up!",
    "RUN OUT! A direct hit, caught short of the crease!",
    "CAUGHT at deep midwicket! The fielder holds on!",
    "OUT! Caught at the boundary, what a stunning catch!",
    "Clean bowled through the gate!",
    "STUMPED! Quick as a flash!",
  ],
  wide: [
    "Wide! Down the leg side, batter can't reach. WIDE.",
    "Wide outside off stump, leaves it alone. WIDE.",
  ],
  noBall: ["No ball! The bowler overstepped. FREE HIT next ball!"],
};

function pick(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
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
  // Base probabilities
  let pDot = 0.3;
  let pSingle = 0.25;
  let pTwo = 0.1;
  let pThree = 0.03;
  let pFour = 0.12;
  let pSix = 0.07;
  let pWicket = 0.05;
  let pWide = 0.04;
  let pNoBall = 0.02;

  // Adjust for shot type
  if (shotType === "DEFENSIVE") {
    pDot += 0.25;
    pSingle += 0.05;
    pFour -= 0.07;
    pSix -= 0.05;
    pWicket -= 0.03;
  } else if (shotType === "AGGRESSIVE") {
    pDot -= 0.1;
    pFour += 0.1;
    pSix += 0.12;
    pWicket += 0.06;
    pSingle -= 0.05;
  }

  // Adjust for direction
  if (direction === "LOFTED") {
    pFour += 0.04;
    pSix += 0.1;
    pWicket += 0.04;
    pDot -= 0.06;
  } else {
    pFour += 0.03;
    pDot += 0.02;
    pWicket -= 0.02;
  }

  // Adjust for ball type
  switch (ballType) {
    case "YORKER":
      pDot += 0.1;
      pWicket += 0.04;
      pFour -= 0.05;
      pSix -= 0.04;
      if (speed === "FAST") {
        pDot += 0.05;
        pWicket += 0.03;
      }
      break;
    case "BOUNCER":
      pSix += 0.05;
      pWicket += 0.06;
      pFour += 0.02;
      if (speed === "FAST") {
        pWicket += 0.04;
      }
      break;
    case "INSWING":
    case "OUTSWING":
      pWicket += 0.04;
      pDot += 0.05;
      if (speed === "MEDIUM") {
        pWicket += 0.02;
      }
      break;
    case "LEG_CUTTER":
    case "OFF_CUTTER":
      pWicket += 0.03;
      pDot += 0.04;
      break;
    case "SLIDER":
      pWicket += 0.02;
      pDot += 0.06;
      pSix -= 0.03;
      break;
  }

  // Adjust for player stats
  const battingQuality = (batter.battingAvg / 50) * (batter.strikeRate / 140);
  const bowlingQuality =
    bowler.role === "Batsman" ? 0.6 : bowler.bowlingAvg < 25 ? 1.2 : 0.9;

  pFour *= battingQuality;
  pSix *= battingQuality;
  pWicket *= bowlingQuality / battingQuality;
  if (isLastOver) {
    pFour *= 1.2;
    pSix *= 1.3;
    pWicket *= 1.1;
  }

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
      commentary: pick(COMMENTARY.wide),
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
      commentary: pick(COMMENTARY.noBall),
    };
  r -= pNoBall;
  if (r < pWicket) {
    return {
      runs: 0,
      isWicket: true,
      isWide: false,
      isNoBall: false,
      isFour: false,
      isSix: false,
      commentary: pick(COMMENTARY.wicket),
      wicketType: "caught",
    };
  }
  r -= pWicket;
  if (r < pSix)
    return {
      runs: 6,
      isWicket: false,
      isWide: false,
      isNoBall: false,
      isFour: false,
      isSix: true,
      commentary: pick(COMMENTARY.six),
    };
  r -= pSix;
  if (r < pFour)
    return {
      runs: 4,
      isWicket: false,
      isWide: false,
      isNoBall: false,
      isFour: true,
      isSix: false,
      commentary: pick(COMMENTARY.four),
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
      commentary: pick(COMMENTARY.three),
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
      commentary: pick(COMMENTARY.two),
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
      commentary: pick(COMMENTARY.single),
    };

  return {
    runs: 0,
    isWicket: false,
    isWide: false,
    isNoBall: false,
    isFour: false,
    isSix: false,
    commentary: pick(COMMENTARY.dot),
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

  const ballTypes: BallType[] = [
    "INSWING",
    "OUTSWING",
    "YORKER",
    "BOUNCER",
    "SLIDER",
    "LEG_CUTTER",
    "OFF_CUTTER",
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
