import { joinNames } from "@/lib/game/home";

export type OutboxKind = "your_turn" | "reminder" | "game_finished";

export interface MessageInput {
  kind: OutboxKind;
  /** notification_outbox.payload as queued by SQL. */
  payload: Record<string, unknown>;
  gameId: string;
  /** Base URL, e.g. https://seen.example (trailing slash tolerated). */
  appUrl: string;
  /** Other players' display names (everyone except the recipient). */
  otherNames: string[];
  roundsPerPlayer: number;
}

export interface Message {
  subject: string;
  /** Inbox preview text. */
  preheader: string;
  heading: string;
  body: string;
  ctaLabel: string;
  url: string;
  pushTitle: string;
  pushBody: string;
  /** Collapses duplicate pushes for the same event (e.g. on retry). */
  tag: string;
}

export function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10 > 3 ? 0 : n % 10]}`;
}

export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function buildMessage(i: MessageInput): Message {
  const base = i.appUrl.replace(/\/+$/, "");
  const withWho = i.otherNames.length ? ` with ${joinNames(i.otherNames)}` : "";

  if (i.kind === "your_turn") {
    const round = num(i.payload.round);
    const roundText = round ? `Round ${round} of ${i.roundsPerPlayer}` : "Your next round";
    return {
      subject: "Your turn in Seen!",
      preheader: `${roundText} is waiting for you.`,
      heading: "Your turn!",
      body: `${roundText} of your game${withWho} is ready. Find the picture before the clock gets you.`,
      ctaLabel: "Play your turn",
      url: `${base}/g/${i.gameId}/play`,
      pushTitle: "Your turn in Seen!",
      pushBody: `${roundText}${withWho}. Tap to play.`,
      tag: `turn-${i.gameId}`,
    };
  }

  if (i.kind === "reminder") {
    const who = i.otherNames.length ? joinNames(i.otherNames) : "Your friends";
    const verb = i.otherNames.length > 1 ? "are" : "is";
    return {
      subject: "Reminder: your turn in Seen! is waiting",
      preheader: `${who} ${verb} waiting for you.`,
      heading: "Still your turn",
      body: `${who} ${verb} waiting for you to play. Your turn has been open for a day. After three days it will be skipped.`,
      ctaLabel: "Play your turn",
      url: `${base}/g/${i.gameId}/play`,
      pushTitle: "Your turn is still waiting",
      pushBody: `${who} ${verb} waiting for you. Tap to play.`,
      tag: `turn-${i.gameId}`,
    };
  }

  const rank = num(i.payload.rank);
  const retired = i.payload.retired === true;
  const total = num(i.payload.total_ms);
  const timeText = total !== null ? ` Total time: ${formatSeconds(total)}.` : "";
  let heading: string;
  let body: string;
  if (retired || rank === null) {
    heading = "The game is over";
    body = `Your game${withWho} has finished. See how everyone did.`;
  } else if (rank === 1) {
    heading = "You won!";
    body = `You finished 1st in your game${withWho}.${timeText}`;
  } else {
    heading = `You finished ${ordinal(rank)}`;
    body = `Your game${withWho} is done. You came ${ordinal(rank)}.${timeText}`;
  }
  return {
    subject: "Game finished in Seen!",
    preheader: heading,
    heading,
    body,
    ctaLabel: "See results",
    url: `${base}/g/${i.gameId}`,
    pushTitle: "Game finished",
    pushBody: `${heading}. Tap to see the results.`,
    tag: `finished-${i.gameId}`,
  };
}

/** Plain-text alternative for the email. */
export function plainText(m: Message): string {
  return `${m.heading}\n\n${m.body}\n\n${m.ctaLabel}: ${m.url}\n\n-- Seen!\nYou get this email because you play Seen!.\n`;
}
