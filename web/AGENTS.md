<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project rules

- After making changes, run `pnpm check` (oxfmt, oxlint with `@shadcn/lint`, tsc, vitest) and fix every error.
- `@shadcn/lint` enforces the design system: colors, sizes, spacing and motion come from the tokens in
  `src/app/globals.css`. Rationale and usage rules are in `DESIGN.md`.
- Icons come from `@phosphor-icons/react` only.
- Private keys never leave the browser. Never add logging, analytics, storage or network calls that could
  touch `ownerKey` or `sponsorKey`, and never add an external origin to the CSP in `src/proxy.ts` without review.
- After changing `contracts/`, run `pnpm abi` to regenerate the typed ABI.
