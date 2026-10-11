# Night Arcade — the Seen! visual design (Option B)

Source of truth for how the app looks. Approved prototype (Claude Design canvas, page "B · Main flow"):
https://claude.ai/artifact/JGeQPfKy7E4nsqrwisHsSL — 12 screens, numbered below.

Idea: the ink colour of the doodles becomes the room. All chrome is dark; the board is the only
large light surface, so it reads like a lit screen and its edges are obvious. The doodles' brightest
fills are the signals.

## Tokens (Tailwind v4 `@theme` in `app/globals.css`)

| Token | Hex | Use |
|---|---|---|
| `ink` | `#1c1b22` | page background; text on light/mustard fills |
| `surface` | `#2a2932` | cards, list rows, inputs, table background |
| `raised` | `#34333d` | hover / pressed surface |
| `line` | `#3d3b46` | hairlines, dividers, table row borders |
| `line-strong` | `#4a4854` | outlined (secondary) buttons, empty progress |
| `dim` | `#6b6875` | disabled, "—" cells, "/5" in round counter |
| `muted` | `#b8b2c0` | secondary text, labels (≥ 7:1 on ink) |
| `soft` | `#d9d3df` | body copy on ink |
| `cream` | `#fbf3e0` | primary text; light buttons ("Back to game") |
| `paper` | `#f4f1ea` | the board, picture tiles, decorative doodle strips |
| `mustard` | `#f5b93f` | primary action, "your turn", running clock, current row/turn, host badge |
| `magenta` | `#e0559a` | wrong tap, "+5 S" penalty chip |
| `teal` | `#2aa7a0` | found / success, "Found it!", correct ring, notifications |

Text on mustard, magenta, teal or paper is always `ink`. Danger text on ink: `#f08aba`.

Player avatar fills (ink letter on top): `#e0559a` `#8fd0f5` `#9bc53d` `#ffb074` `#2aa7a0` `#b9a6ee`.
Final-results medal circles: gold `#f5b93f`, silver `#cfd6dc`, bronze `#d9a47a` (ink numeral). No emoji.

## Type

One family: **Archivo** (Google, variable, `wght` + `wdth` axes) via `next/font/google`
(`axes: ["wdth"]`, `variable: "--font-archivo"`), exposed as Tailwind `font-sans`.

- **Wide display** (`font-stretch: 125%`, weight 900, UPPERCASE): logo "SEEN!" (the "!" in mustard),
  screen titles, primary button labels, "YOUR TURN", "FOUND IT!", big numbers. Utility: `.font-wide`.
- **Labels**: 12px, 700, wide, uppercase, `tracking-[0.12em]`, `muted` ("OTHER GAMES", "PLAYERS").
- **Body**: normal width, 400–700, `soft` or `cream`, 15–17px.
- **Numbers**: wide, 800, `tabular-nums`. The round clock is 48px mustard; result score 52px cream.

## Shape and spacing

- Page: `max-w-md`, 16px side padding. Background `ink` everywhere, including `body` and the PWA theme colour.
- Primary button: full pill (`rounded-full`), mustard, min-height 56–60px, wide uppercase 900 label.
- Secondary button: pill, transparent, `inset 0 0 0 2px line-strong`, cream label.
- Light button: pill, cream fill, ink label ("Back to game", "Back" on board study).
- Danger: text button in `#f08aba`; a confirmation card uses `surface` with a magenta 2px ring.
- Cards and list rows: `surface`, radius 16–24px, no shadows, no borders (or a 1px `line` ring for
  "quiet" rows like finished games).
- Inputs: `surface`, radius 16px, no border, mustard 2px inset ring on focus, 16px+ text.
- Icons: inline stroke SVGs (`currentColor`, ~2.4–2.6 stroke). No emoji anywhere.
- Touch targets ≥ 44px. Focus rings: 2px mustard outline, offset 2px.

## The board

- Board background stays `paper` (`#f4f1ea`), canvas-drawn as today.
- In play and study views the board sits inset in the dark chrome: margin 0 8px 8px, radius 22px,
  `overflow-hidden`. That inset is what makes the boundary clear.
- Correct ring: `teal`. Wrong flash fill and "+5 s" label: `magenta` (label keeps its white halo).
- The reveal cover is `paper` inside the same inset frame.

## Screens (numbers match the prototype)

1. **Sign in** — doodle strip (paper panel, ~280px, scattered rotated pictures), "SEEN!" 60px,
   tagline, email field, mustard "Email me a sign-in link", "or" divider, secondary "Continue with Google".
2. **Your name** — small header logo, paper tile with one doodle + mustard ring, wide title
   "WHAT SHOULD FRIENDS CALL YOU?", input, mustard "Continue" pinned to the bottom.
3. **Home** — header: logo left, avatar button right. "Your turn" games as a big card: doodle strip
   on top, then "YOUR TURN" (mustard, wide) + "with … · round n of m", round mustard play button;
   2px mustard ring. Notification prompt as a surface row with teal bell + teal "Turn on" pill.
   Other games as surface rows (avatar, title, status line). Mustard "NEW GAME" pill at the bottom.
4. **New game** — back chevron + "NEW GAME". Two choice groups of 3 tiles (surface; selected = mustard
   fill, ink text), big wide number + hint. Mustard "CREATE GAME".
5. **Lobby** — "GAME LOBBY" + "5 rounds each · 200 pictures". Players card (surface, rows split by
   `line`, "3 / 6" count, mustard HOST badge). Invite card with dark link box + secondary
   "SHARE INVITE LINK". Mustard "START GAME"; "Cancel game" as danger text.
6. **Game / scoreboard** — "SCOREBOARD" + turn line (mustard when it is your turn). Mustard
   "PLAY MY TURN" with play icon. Score table on surface: current row mustard-tinted
   (`rgba(245,185,63,.12)`) with a 3px mustard left bar; capped cells mustard; "—" in `dim`.
   Legend in muted. Turn-order pills (current = mustard). Secondary "VIEW BOARD". "Leave game" muted underline.
7. **Ready** — "ROUND 3 OF 5" label, "READY?" 72px (mustard "?"), blank paper tile with a grey "?",
   **three points with mustard stroke icons** (clock, magnifier, 4-way arrows):
   - "Nothing is timed yet. The picture is shown for a moment, then the clock starts."
   - "Find the picture on the board as fast as you can. A wrong tap adds 5 seconds."
   - "The board is bigger than your screen. Drag it to move around."
   Teal preload bar on surface. Huge mustard "DRAW" pill (76px, soft mustard glow). "Back to game" muted link.
8. **Draw reveal** — round header with an empty surface slot and dim "0.0 s"; the inset paper frame
   shows the target large in the centre, then it flies into the header slot (existing FLIP).
9. **Round** — header (104px): target on a paper tile with a 3px mustard ring + glow; clock 48px
   mustard wide ("12.4 s", the " s" smaller); magenta "+5 S" chip + "1 wrong"; right: "3/5" (the "/5" dim)
   and five 12×4px segments (done cream, current mustard, future `line-strong`). Board inset below.
10. **Round result** — header target ring turns teal. Bottom sheet in `ink`, radius 22px top:
    one row, vertically centred: "FOUND IT!" (26px, wide 900, teal, one line, no wrap) left and the
    score (52px wide) right; below, right-aligned muted "1 wrong tap · +5 s". Standings as rows
    (surface; you = mustard fill, ink text). Cream "BACK TO GAME" pill. "Time's up" uses magenta.
11. **Final results** — paper header card with two doodles, "GAME OVER" label, "BEN WINS!" / "YOU WIN!"
    44px wide, total. Ranking rows with medal circles; you get a 2px cream ring. Round-by-round table
    as in 6. Mustard "REMATCH"; "View board" / "Home" links.
12. **Study the board** — "BOARD" title, cream "BACK" pill, board inset below.

## Rules for implementers

- Change presentation only. No changes to logic, data flow, RPCs, props or `data-testid`s.
- Keep every user-visible string that tests use: clock text "0.0 s" / "90.0 s" format, "n wrong",
  "5 rounds each · 200 pictures", "Game lobby", "Sign out" (a button with that name must still exist on
  Home), "Continue", "Email me…", "Continue with Google", "What should friends call you?", "retired",
  game-row link names like "with Hosty". Uppercase via CSS `uppercase` is fine (accessible name unchanged).
- Keep `env(safe-area-inset-*)` handling and `overscroll-behavior` on play screens.
- Tailwind v4: use the theme tokens (`bg-ink`, `text-cream`, `bg-mustard`…), not raw hex, except for the
  one-off values listed above.
