# Vertical slices with a thin composition root

We use vertical slices (`archive`, `model`, `sorter`, `sync`, `app`) on the client and feature modules plus infrastructure on the server, with `src/lib/ui` as a leaf design system and `App.svelte` as a thin composition root. We chose this over full Feature-Sliced Design and Bulletproof React because this is a single-page tool with one server, not a large multi-page React app; FSD's `pages/widgets/entities` layers and Bulletproof's React-specific `hooks/providers` have no useful counterpart here. The trade-off is fewer prescribed folders, so the boundaries are enforced by dependency-cruiser rules and documented in this ADR instead of by directory conventions alone.

Status: accepted.

## Considered options

- **Feature-Sliced Design** — rejected: no meaningful `pages`, `widgets` or `entities` layer in a one-screen tool.
- **Bulletproof React** — rejected: React-specific and barrel-oriented; this project uses Svelte 5 runes and explicitly avoids barrel files.
- **Layered by file type** (`components/`, `hooks/`, `services/`) — rejected: feature code gets scattered across folders.

## Consequences

- `App.svelte` renders and wires; orchestration lives in `src/lib/app/controller.ts`.
- Domain modules may not import UI or each other's internals; allowed edges are narrow and explicit.
- `src/lib/ui/*` is a leaf: it imports only `svelte`, `bits-ui`, `tailwind-variants` and other UI files.
- `server/*` never imports `src/**`, and browser code never imports `server/**`.
- These rules run in `bun run validate` via `arch:check`. Changing an architecture boundary requires an ADR update first.
