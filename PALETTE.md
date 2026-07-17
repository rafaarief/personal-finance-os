# PFOS palette (Neo-Minimal Fintech)

Derived per the dataviz skill's method (`node scripts/validate_palette.js`), not eyeballed.
Dark-first design; light-mode tokens exist but the shipped UI defaults to dark.

## Surfaces
- Dark plane: `#0d0b10` · Dark surface (cards/charts): `#15121a`
- Light plane: `#f5efe6` · Light surface: `#faf6f0` (tokens only — not the shipped default)

## Categorical (fixed order — never re-cycle per chart)

| # | Name | Dark | Light |
|---|------|------|-------|
| 1 | coral | `#d15c56` | `#bd413f` |
| 2 | purple | `#9b6bce` | `#8854bb` |
| 3 | peach | `#c9690c` | `#b55000` |
| 4 | rose | `#c35c9b` | `#af4387` |
| 5 | gold | `#af7c00` | `#9c6600` |
| 6 | blue | `#4087de` | `#2171cc` |
| 7 | teal | `#00a16f` | `#008d59` |

Validator result (both modes, adjacent pairs, `--surface` as above): lightness band PASS,
chroma floor PASS, CVD separation PASS (worst adjacent ΔE 15.6 dark / 14.5 light — both
clear the 8.0 target), normal-vision floor PASS (17.3 dark / 16.3 light, floor is 15),
contrast vs surface PASS (all ≥ 3:1). Order was chosen by brute-force search over all
permutations of these 7 hues, maximizing the minimum adjacent CVD ΔE — see
`find_order.mjs` in the exploration scratchpad if it needs to be re-derived for an 8th
category later (folding overflow categories into a neutral "Other" instead of adding an
8th hue was the deliberate choice here: a yellow-green 8th slot collided with coral
under deuteranopia and did not clear the floor at any adjacent position).

Only the first 4-5 slots are safe under `--pairs all` (scatter/small-multiples) — past
that, fold to "Other" or facet, per the skill's rule.

## Sequential (magnitude — one hue, light→dark)
Purple (H≈305): `#ece3f8 → #ceb9e9 → #ae8cd5 → #9565c7 → #70449c → #4b2a6a`

## Diverging (polarity — gain/loss)
Negative pole (coral, H≈25): `#f2d7d4 → #e19891 → #d15c56 → #ac3031`
Positive pole (teal, H≈165): `#cde5d9 → #74c0a0 → #00a071 → #00734b`
Neutral midpoint: `#383835`

## Status (fixed, never themed)
good `#0ca30c` · warning `#fab219` · serious `#ec835a` · critical `#d03b3b`
(reused from the skill's documented default — already validated distinct from the
categorical set and always paired with an icon + label, never color alone.)

## Ink / chrome (dark, shipped default)
Primary `#f7f3ee` · Secondary `#b9afc4` · Muted `#8a8296` ·
Border/hairline `rgb(255 255 255 / 10%)`
