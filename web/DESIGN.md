# Vindicate design system: "Vault"

Everything visual comes from the mark: a hexagonal shield cut at 30 and 60 degrees around an
upward arrow, electric cyan on black. Tokens live in `src/app/globals.css`. `@shadcn/lint`
(through oxlint) rejects raw colours, arbitrary values, unknown classes and restyled
components, so use the tokens and components below.

## Principles

1. **One action, one colour.** Brand cyan (`primary`) marks the brand and the single next action
   on a screen. Never decoration.
2. **Cut, never round.** Plates and primary buttons have chamfered corners (`chamfer`,
   `chamfer-sm`, `chamfer-lg`) on the top-left and bottom-right, echoing the mark. Inputs and
   outline controls are square. Status dots, token avatars, and explanatory diagram nodes are round.
3. **Show the move.** The product moves assets out of a wallet. Layouts and motion show that
   direction: From → Transaction → To in the app, lift and drain in the hero.
4. **Calm under stress.** Users arrive after losing money. Copy is plain and specific, errors say
   what happened and what to do, and nothing animates without a reason.

## Two surfaces

The **app** (`/app`) follows everything below as written. It shares the landing page's stage
(held back by a fixed shade), its `font-flow` title and its boxed `Tag`s, and keeps the chamfered
`Card`. A five-step rail above the card (`recovery/step-rail.tsx`) shows where the owner is and
names the next action. The **landing page** (`/`) uses the same
tokens in a looser language called "Flow":

- One fixed stage (`effects/flow-stage.tsx`) runs behind the whole page: a field of thin brand
  lines over slow dunes. A shade deepens as the page scrolls, and sections float over it on
  translucent plates (`bg-card/55 backdrop-blur-md`).
- Headings use `font-flow` (the body face, medium weight, set tight) instead of Oxanium.
- Plates are square with `corner-ticks`, section names are boxed `Tag`s, and the action is an
  underlined `ArrowLink` in `primary` rather than a filled button.
- A short `Preloader` covers the first two seconds. It never blocks a click: the header and its
  link to the app sit above it, and it lifts by CSS alone.
- The process section pins and swaps its steps on scroll at `md` and up, and is a plain list
  below that. Reduced motion resolves the curtain and the stage to a still frame.

## Colour

| Token                             | Value                 | Use                               |
| --------------------------------- | --------------------- | --------------------------------- |
| `background`                      | `#04080b`             | Page                              |
| `muted`                           | `#081117`             | Shells, inputs, chips             |
| `card`                            | `#0b161d`             | Plates                            |
| `accent`                          | `#112530`             | Hover, selected rows, avatars     |
| `border` / `input`                | `#172832` / `#22414e` | Hairlines / control outlines      |
| `foreground` / `muted-foreground` | `#e3f3f6` / `#7d969e` | Text                              |
| `primary`                         | `#12e7f5`             | Brand cyan, sampled from the mark |
| `success`                         | `#45e39a`             | Secured assets, amounts received  |
| `destructive` / `warning`         | `#ff5a6e` / `#ffb547` | Failures / caution                |

Contrast: body text on `background` is 15:1, `muted-foreground` is 6.5:1, and `primary-foreground`
on `primary` is 13:1.

## Type

- **Oxanium** for display headings, **Geist** for body text, and **Geist Mono** for addresses,
  amounts, hashes and step numbers. Mono is never used for labels.
- The scale is a 1.25 modular scale from 16px (`text-xs` through `text-display`). Line height
  tightens as size grows. Sentence case everywhere and no all-caps labels.

## Surfaces and texture

- `Card` is two layers. A 1px frame in the status colour sits behind a chamfered plate. Statuses
  are `default`, `draft` (a plan not yet sent), `active` and `success` (mined). `beam` adds a
  travelling light for work in flight.
- `bg-iso` is a faint isometric grid at the mark's angles, used for page backgrounds.
  `bg-spotlight`, `bg-horizon`, `bg-dot-matrix` and `bg-glow` light the hero only.
  `text-fade` is reserved for the hero headline.

## Motion

- Feedback uses `duration-instant` (120ms) or `duration-quick` (200ms) with `ease-out-quart`.
- The landing page's diagrams are static SVG, so the message appears without waiting for
  JavaScript. Its WebGL stage is capped at 30 frames a second, pauses in a hidden tab, and renders
  a still frame for reduced-motion preferences. The app keeps the quieter aurora. In the app, operations light up in order
  while sending and the plate turns green when the transaction is mined.
- List changes (selecting assets, adding steps) animate their enter and exit so cause and effect
  stay visible.
- `prefers-reduced-motion` resolves every sequence to its final state.

## Components

`src/components/ui` holds the primitives: Button, Card, Dialog, DropdownMenu, Field, Input,
Checkbox, RadioCard, Notice, Skeleton and Accordion, all cva-based Radix wrappers. Icons are
Phosphor only.

`src/components/effects` holds the WebGL hero backdrop and vendored effects: React Bits
`DecryptedText` (hash reveal) and Magic UI `BorderBeam` (sending state). The vendored components
are kept as published; this folder alone is exempt from token lint rules. Callers pass tokens (for
example `var(--primary)`).

## Layout

- Landing sections use `Section`: a display heading and lead on the left of a 76rem page grid,
  with content below. Bands are separated by hairlines rather than alternating backgrounds.
- Marketing routes use server-rendered content; client code is reserved for effects and controls
  that need browser state. The per-request nonce CSP means route HTML is rendered dynamically.
- The app is one screen of three plates (From, Transaction, To) above a sticky action bar,
  whose button always names the next step, and a live chain status line.

## Avoid

Gradient washes on cards, glow on anything except the hero mark, rounded pills, more than one
cyan element per view, invented statistics, and hype copy.
