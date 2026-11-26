# Architecture

No server ever receives a key. The browser holds the keys, builds and signs the recovery, and sends
it to a BNB Chain RPC. The one server route, `/api/copilot`, is optional: it receives wallet
addresses and the owner's note, reads the chain, and asks an AI model to pick among steps it built. The delegate contract stores a per-wallet nonce in the EOA's storage; its treasury
and fee configuration are immutable.

```
Browser tab (keys in memory only)                         BNB Chain
┌─────────────────────────────────────────────┐
│ scan      balances, allowances, delegation  │  eth_call  ─────────────►  RPC
│ plan      RecoveryAction[] → Recovery       │
│ sign      EIP-712 Recovery (compromised key)│
│           EIP-7702 authorization (same key) │
│ simulate  eth_estimateGas with auth list    │  ─────────────────────►
│ send      type-4 tx from the gas wallet     │  eth_sendRawTransaction ─►  compromised EOA
└─────────────────────────────────────────────┘                             runs VindicateDelegate
                                                                             └─ revoke, call, transfer, sweep
```

## Contract: `VindicateDelegate`

The delegate runs in the context of the compromised EOA, so `address(this)` is that wallet.

- `execute(Recovery, signature)` checks the following, in order:
  - the deadline;
  - the optional executor (the gas wallet);
  - the nonce, which lives in an ERC-7201 slot so it survives re-delegation;
  - an EIP-712 signature that must recover to `address(this)`.

  It then runs the calls, sweeps each listed ERC-20 and, if asked, the native balance. A fee is
  taken on sweeps only.
- The fee (`feeBps`, capped at 30%) and the `treasury` are immutable, set at deployment.
- ERC-721 and ERC-1155 receiver hooks let `safeMint` airdrops land while the wallet is delegated.

Without a fresh signature from the wallet's own key, nothing can be moved through the delegate.
That is the fix for the original `Ops7702`, which let anyone sweep any wallet delegated to it.

## Web app

| Layer | Path | Responsibility |
| --- | --- | --- |
| Domain | `web/src/lib/recovery` | Pure planning (`plan.ts`), EIP-712 types, scanning, signing and sending (`execute.ts`), error copy |
| Config | `web/src/lib/env.ts`, `chains.ts` | Zod-validated public config, networks, delegate addresses |
| State | `web/src/components/recovery/recovery-provider.tsx` | Reducer for selections and the transaction phase. Any edit invalidates a finished check |
| UI | `web/src/components/recovery` | Rescue card, wallet scan, receipt, masked key entry |
| Copilot | `web/src/lib/copilot`, `web/src/app/api/copilot` | Reads history, builds a fixed menu of steps, lets a model pick by id. Never sees a key |
| Security | `web/src/proxy.ts`, `next.config.ts` | Per-request nonce CSP, `connect-src` limited to the RPCs and the app's own origin, security headers |

### Order of operations in one rescue

`buildRecovery` always orders the work as follows:

1. revoke allowances and operators, so the drainer is cut off first;
2. run owner-requested calls, such as claims and unstakes;
3. move NFTs;
4. sweep tokens, then the native balance, so tokens received from a claim are included.

### Testing

- `contracts/test`: unit and fuzz tests using Foundry's EIP-7702 cheatcodes.
- `web/src/lib/recovery/*.test.ts`: plan, scan and format unit tests.
- `execute.integration.test.ts`: starts anvil with Prague rules, deploys the contract, and runs a
  full rescue and delegation reset through the same code the UI uses.

## Rendering and performance

- Marketing routes render their content on the server, and their diagrams are static SVGs.
  Browser code is the WebGL stage behind the page (capped at 30 frames a second, paused in a
  hidden tab, a still frame under reduced motion), the opening curtain, the scroll-pinned
  process section and the interactive controls.
- A per-request nonce in the CSP requires dynamic HTML rendering. Static assets remain served from
  Next.js build output.
- CI runs formatting, lint, type checking, unit/integration tests, and the production web build.
