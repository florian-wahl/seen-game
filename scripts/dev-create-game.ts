// Creates a started game with fresh test users and prints URLs.
// Usage: npx tsx --env-file=.env.local scripts/dev-create-game.ts [--players 2] [--rounds 3] [--size 100]
import { createStartedGame, uniqueEmail } from "../e2e/helpers/game";

const arg = (name: string, fallback: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : fallback;
};

async function main() {
  const players = arg("players", 2);
  const emails = Array.from({ length: players }, (_, i) => uniqueEmail(`dev${i + 1}`));
  const g = await createStartedGame({
    emails,
    names: emails.map((_, i) => `Dev${i + 1}`),
    rounds: arg("rounds", 3) as 3 | 5 | 10 | 20,
    size: arg("size", 100) as 100 | 200 | 300 | 500,
  });
  const base = "http://localhost:3002";
  console.log(`game ${g.gameId}; first to play: ${g.firstUser.email}`);
  for (const u of g.bySeat) {
    const next = (p: string) => `${base}/dev/login?email=${encodeURIComponent(u.email)}&name=${u.name}&next=${encodeURIComponent(p)}`;
    console.log(`\n${u.email}\n  scoreboard: ${next(`/dev/game/${g.gameId}`)}\n  play:       ${next(`/g/${g.gameId}/play`)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
