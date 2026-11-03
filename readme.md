# Monopoly World Tour: Spec Pack

A complete set of specification files to let an AI coding agent (such as Google Antigravity) build a fun, polished, browser-based Monopoly-style game on a world-cities board.

## Contents
| File | Purpose |
|---|---|
| `AGENTS.md` | Rules and instructions for the coding agent (read first) |
| `docs/PRD.md` | Product requirements, modes, features, metrics |
| `docs/TRD.md` | Tech stack, architecture, data models, AI, testing |
| `docs/APP_FLOW.md` | Screens, turn state machine, user flows |
| `docs/GAME_DESIGN.md` | Board layout, rules, fun features, bots, achievements |
| `docs/UI_UX_SPEC.md` | Visual style, components, animations, accessibility |
| `docs/IMPLEMENTATION_PLAN.md` | Phased task checklist |
| `docs/MULTIPLAYER_SPEC.md` | Online play with friends: rooms, server, protocol, deployment |
| `data/board.json` | All 40 tiles with prices, rents, fun facts |
| `data/cards.json` | 16 Chance and 16 Community Chest cards |

## How to Use with Antigravity
1. Create a new empty project folder and copy this entire pack into it, keeping the structure.
2. Open the folder as a workspace in Antigravity.
3. Paste the "First Prompt to Give the Agent" from `AGENTS.md` into the agent manager.
4. Review each phase's output, then prompt: "Continue with the next phase in IMPLEMENTATION_PLAN.md."
5. Play-test after Phase 3, then request Phase 4 (fun layer) and onward.

## Trademark Note
"Monopoly" is a Hasbro trademark. This pack uses original city names and card text. For anything public, rename the game (e.g. "World Tour Tycoon") and use original artwork.
