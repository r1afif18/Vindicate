# Contributing

1. Fork, then branch from `main` (`feat/…`, `fix/…`, `chore/…`).
2. Keep each commit atomic and use [Conventional Commits](https://www.conventionalcommits.org):
   `feat(web): …`, `fix(contracts): …`, `docs: …`.
3. Run the checks before you push:
   ```bash
   cd contracts && forge fmt --check && forge test
   cd web && pnpm check && pnpm build
   ```
4. UI changes follow [`web/DESIGN.md`](web/DESIGN.md). The linter enforces the tokens.
5. After changing the contract, run `pnpm abi` in `web/` and commit the regenerated ABI.
6. Never add code that logs, stores or transmits private keys, and never widen the CSP in
   `web/src/proxy.ts` without a review.
