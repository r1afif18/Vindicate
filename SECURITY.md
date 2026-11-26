# Security policy

Vindicate handles private keys of compromised wallets in the browser and runs code inside those
wallets through EIP-7702. Please report anything that could let someone other than the key holder
move assets, leak a key, or bypass the signature checks.

## Reporting

Use GitHub's **private vulnerability reporting** (Security → Report a vulnerability). Please do not
open a public issue. Include the affected file or contract, the steps to reproduce, and the impact.
We aim to acknowledge reports within 72 hours.

## In scope

- `contracts/src/VindicateDelegate.sol`: signature, nonce, deadline and executor checks, fee
  handling, reentrancy.
- `web/`: anything that could send key material off the device, script injection (CSP bypass),
  signing the wrong payload, or misleading the user about what will be sent.

## Known limitations

- Not independently audited.
- A bot that also holds the leaked key can try to act in the same block. Sending through a
  private-transaction RPC reduces that risk.
- After a rescue the wallet stays delegated until cleared. The delegate is inert without a new
  signature, and the app offers a one-click reset.
