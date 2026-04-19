# Vela Design System

Complete design language and visual system for Vela Exchange. This document covers everything a designer or developer needs to implement the Vela design system correctly from scratch.

---

## 1. OVERVIEW

### Design Philosophy

Vela's visual language is **warm monochrome, editorial meets terminal** — a collision of financial newspaper aesthetics with raw blockchain data. The palette is built entirely from warm off-whites and near-blacks with no blue, no cyan, no teal, no color accents beyond the semantic green/red for bids and asks.

The result is a system that feels authoritative, precise, and slightly archaic — a deliberate contrast to the neon-and-gradient aesthetic common in DeFi.

### Two Distinct Experiences

**Landing page (editorial):** Typography-forward, section-based scrolling layout. Playfair Display headlines dominate. Hex texture provides atmosphere. Alternating dark and warm-white sections create rhythm. Feels like a financial publication.

**Exchange / app (terminal):** Dense, functional, information-first. No decorative elements. Courier New for all data. Tight spacing. Fixed viewport — no page scrolling. Feels like a Bloomberg terminal crossed with a command-line interface.

### Hard Rules

- **No rounded corners anywhere.** `border-radius: 0` on every element — buttons, inputs, cards, badges, tooltips.
- **No box-shadow anywhere.** Depth is communicated through layered background colors and borders, never shadows.

---

## 2. COLOR SYSTEM

### Background Layers

| Role | Value |
|------|-------|
| Page background | `#0C0C0C` |
| Surface | `#111110` |
| Elevated surface (hover states) | `#131920` |

### Text

| Role | Value |
|------|-------|
| Primary | `#E8E4D8` |
| Muted | `rgba(232, 228, 216, 0.35)` |
| Faint | `rgba(232, 228, 216, 0.20)` |
| Very faint | `rgba(232, 228, 216, 0.08)` |

### Borders

| Role | Value |
|------|-------|
| Default | `rgba(232, 228, 216, 0.07)` |
| Emphasized | `rgba(232, 228, 216, 0.12)` |

### Semantic Colors

| Role | Value |
|------|-------|
| Bid / Buy / Positive | `#6B8A5A` |
| Ask / Sell / Negative | `#CC3333` |
| Bid background tint | `rgba(107, 138, 90, 0.08)` |
| Ask background tint | `rgba(204, 51, 51, 0.08)` |

### Light Sections (alternating on landing page)

| Role | Value |
|------|-------|
| Background | `#E8E4D8` |
| Text | `#0C0C0C` |
| Muted text | `rgba(12, 12, 12, 0.42)` |
| Faint text | `rgba(12, 12, 12, 0.20)` |
| Border | `rgba(12, 12, 12, 0.08)` |

### Color Rules

- **No blue. No cyan. No teal.** Warm monochrome only.
- All transparency is achieved by layering `rgba` values of the primary warm-white (`232, 228, 216`) on dark backgrounds, or the near-black (`12, 12, 12`) on light backgrounds.

---

## 3. TYPOGRAPHY

### Font Families

**Display: Playfair Display** (loaded via Google Fonts)
- Weights used: `400 italic`, `700`, `700 italic`, `900`, `900 italic`
- Used for: headlines, market names, hero text, large numbers on landing page, logo

**Functional: Inter** (loaded via Google Fonts)
- Weights used: `300`, `400`, `500`, `600`
- Used for: all UI chrome, labels, body text, buttons, nav links, data labels

**Monospace: Courier New** (system font — no import needed)
- Used for: all prices, order IDs, wallet addresses, signatures, hex data, any technical/numeric value in the exchange UI

### Type Scale

#### Display / Editorial

| Role | Family | Weight | Size | Notes |
|------|--------|--------|------|-------|
| Hero headline | Playfair Display | 900 | 72px | line-height: 0.95 |
| Hero italic line | Playfair Display | 400 italic | 72px | paired with above |
| Section headline | Playfair Display | 700–900 | 32–52px | varies by section |
| Market name (editorial) | Playfair Display | 900 | 38px | |
| Large price (landing) | Playfair Display | 900 | 28–40px | |

#### Functional / UI

| Role | Family | Weight | Size | Notes |
|------|--------|--------|------|-------|
| Nav links | Inter | 400–500 | 12px | uppercase, letter-spacing: 0.02em |
| Section labels | Inter | 400 | 9–10px | uppercase, letter-spacing: 0.18–0.25em |
| Body text | Inter | 300 | 13–15px | line-height: 1.7–1.8 |
| Button text | Inter | 600 | 10–13px | uppercase, letter-spacing: 0.12–0.15em |

#### Monospace / Terminal

| Role | Family | Size | Notes |
|------|--------|------|-------|
| Order book prices | Courier New | 10.5–11px | |
| Wallet addresses | Courier New | 10–12px | |
| Order IDs | Courier New | 11px | |
| Signatures | Courier New | 10px | word-break: break-all |

---

## 4. HEX TEXTURE

The Bitcoin genesis block hex dump is used as a repeating wallpaper texture across all dark sections. This grounds Vela's visual identity in cryptographic history and reinforces the terminal aesthetic.

### Genesis Block Hex String

```
00000000 01 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
00 00 00 00 3B A3 ED FD 7A 7B 12 B2 7A C7 2C 3E 67 76 8F
61 7F C8 1B C3 88 8A 51 32 3A 9F B8 AA 4B 1E 5E 4A 29 AB
5F 49 FF FF 00 1D 1D AC 2B 7C 01 00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 FF FF FF FF 4D 04 FF FF 00 1D 01 04
45 54 68 65 20 54 69 6D 65 73 20 30 33 2F 4A 61 6E 2F 32
30 30 39 20 43 68 61 6E 63 65 6C 6C 6F 72 20 6F 6E 20 62
72 69 6E 6B 20 6F 66 20 73 65 63 6F 6E 64 20 62 61 69 6C
6F 75 74 20 66 6F 72 20 62 61 6E 6B 73
```

### Static Hex Texture (used in features section / early dark sections)

A `<div>` absolutely positioned within the section, containing the genesis block hex repeated to fill the container.

```css
position: absolute;
inset: 0;
font-family: 'Courier New', monospace;
font-size: 10.5px;
line-height: 1.6;
letter-spacing: 0.05em;
word-break: break-all;
color: rgba(232, 228, 216, 0.09);
padding: 16px 20px;
pointer-events: none;
overflow: hidden;
z-index: 0;
```

### Animated Hex Canvas (`HexCanvas` component)

A `<canvas>` element that fills the parent section. The genesis block hex is rendered as a grid of characters.

**Ambient flicker:**
- 0.3% of cells flip to a random hex character per frame
- Each scrambled cell holds for 2–3 frames before reverting
- Runs at 30fps (`setTimeout` at 33ms intervals)

**Mouse proximity effect:**
- Cells within a 120px radius of the cursor scramble continuously
- Intensity = `1 - (distance / 120)` — closer cells scramble more
- Closer cells get brighter: up to `rgba(232, 228, 216, 0.24)` at cursor center
- Baseline cell color: `rgba(232, 228, 216, 0.09)`

**Used on:** hero section, features section, closing CTA section, transparency page dark sections, 404 page

### Vertical Hex Rain (closing CTA section)

Ten thin columns of vertical hex text flanking the CTA content. Implemented as `<div>` elements with `writing-mode: vertical-rl`.

```css
writing-mode: vertical-rl;
font-size: 8.5px;
color: rgba(232, 228, 216, 0.07);
font-family: 'Courier New', monospace;
```

**Left columns** at: `3%`, `9%`, `15%`, `21%`, `27%`  
**Right columns** at: `73%`, `79%`, `85%`, `91%`, `97%`  
**Center** (`27%`–`73%`) is kept clear for CTA content.

---

## 5. LAYOUT SYSTEM

### Landing Page Section Sequence

| Section | Background | Texture | Content |
|---------|------------|---------|---------|
| S1 | `#0C0C0C` | Animated HexCanvas | Hero |
| S2 | `#E8E4D8` | None | Performance stats |
| S3 | `#111110` | Static hex texture | Features |
| S4 | `#E8E4D8` | None | Email capture |
| S5 | `#0C0C0C` | Hex rain + vertical columns | Closing CTA |

**Section padding:** `90px 52px` desktop / `40px 24px` mobile

### Exchange Pages

- Full viewport height minus nav + banner (`96px` total offset)
- No page scrolling — all content fits in viewport
- `display: flex; flex-direction: column; overflow: hidden`

### Markets Overview Grid

```css
display: grid;
grid-template-columns: repeat(3, 1fr); /* desktop */
gap: 1px;
background: rgba(232, 228, 216, 0.05); /* gap color creates grid lines */
```

Each cell: `background: #0C0C0C`

### Trading Terminal (4-panel layout)

```css
display: grid;
grid-template-columns: 180px 1fr 200px 240px;
```

- Panel borders: `1px solid rgba(232, 228, 216, 0.07)`
- Open orders strip at bottom: height `150–160px`
- Panels: instrument list | chart | order form | order book

---

## 6. COMPONENT PATTERNS

### Buttons

| Variant | Background | Color | Border |
|---------|------------|-------|--------|
| Primary (dark bg) | `#E8E4D8` | `#0C0C0C` | none |
| Primary (light bg) | `#0C0C0C` | `#E8E4D8` | none |
| Ghost (dark bg) | transparent | `rgba(232,228,216,0.5)` | `1px solid rgba(232,228,216,0.15)` |
| Buy | `rgba(107,138,90,0.9)` | white | none |
| Sell | `rgba(204,51,51,0.9)` | white | none |

All buttons:
```css
border-radius: 0;
box-shadow: none;
font-family: Inter, sans-serif;
font-weight: 600;
font-size: 10–13px;
text-transform: uppercase;
letter-spacing: 0.12–0.15em;
padding: 12–14px 28–44px; /* context-dependent */
```

### Inputs

```css
background: #111110;
border: 1px solid rgba(232, 228, 216, 0.08);
color: #E8E4D8;
font-family: 'Courier New', monospace;
font-size: 12px;
padding: 8px 10px;
border-radius: 0;
box-shadow: none;
```

Focus state: `border-color: rgba(232, 228, 216, 0.20)`

### Cards (dark surface)

```css
background: #111110;
border: 1px solid rgba(232, 228, 216, 0.07);
padding: 24–32px;
border-radius: 0;
box-shadow: none;
```

### Cards (light surface)

```css
background: rgba(12, 12, 12, 0.04);
border-left: 2–3px solid rgba(12, 12, 12, 0.08);
padding: 24–32px;
border-radius: 0;
```

### Section Labels

Small uppercase descriptor placed above headlines to orient the reader.

```css
font-family: Inter, sans-serif;
font-size: 8–10px;
font-weight: 400;
text-transform: uppercase;
letter-spacing: 0.18–0.25em;
```

- Dark sections: `color: rgba(232, 228, 216, 0.25)`
- Light sections: `color: rgba(12, 12, 12, 0.35)`

### Stat Blocks

```
[number]    — Playfair Display 900, 36–40px, primary color
[label]     — Inter 400, 9px, uppercase, letter-spacing: 0.2em, muted
[sub-label] — Inter 400, 11px, very muted
```

### Order Book Rows

```css
font-family: 'Courier New', monospace;
font-size: 10.5px;
position: relative; /* for depth bar */
```

- Bid rows: `color: #6B8A5A`
- Ask rows: `color: #CC3333`

**Depth bars:** `position: absolute`, full row height, `rgba` fill at `0.07–0.08` opacity.
- Bid bars: anchored left (`left: 0`)
- Ask bars: anchored right (`right: 0`)
- Width represents relative depth; transitions on update: `transition: width 0.4s ease`

### Spread Row

```
◆ {spread_value}    — Inter 8px, muted color
● LIVE              — 5px circle, fill #6B8A5A + Inter 7px uppercase
```

The LIVE dot pulses via opacity keyframe animation.

### Toast Notifications

```css
position: fixed;
bottom: 24px;
right: 24px;
background: #111110;
border: 1px solid rgba(232, 228, 216, 0.08);
border-left: 3px solid {semantic-color}; /* #6B8A5A success / #CC3333 error */
padding: 10px 16px;
font-family: Inter, sans-serif;
font-size: 11px;
border-radius: 0;
box-shadow: none;
```

Auto-dismiss after `3000ms`.

### Loading Skeletons

```css
background: rgba(232, 228, 216, 0.06);
border-radius: 0;
animation: pulse 1.8s ease-in-out infinite;

/* pulse keyframes */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}
```

---

## 7. NAV

### Structure

- **Height:** `60px`
- **Position:** `fixed`, `top: 36px` (below beta banner), `z-index: 100`
- **Background:** `#0C0C0C` (solid, never transparent, never blurred)
- **Border-bottom:** `1px solid rgba(232, 228, 216, 0.07)`

### Logo

```
"Vela" — Playfair Display, italic, 24px, color: #E8E4D8
```

### Nav Links

```css
font-family: Inter, sans-serif;
font-weight: 400;
font-size: 12px;
text-transform: uppercase;
letter-spacing: 0.02em;
color: rgba(232, 228, 216, 0.38);
```

Active link:
```css
color: #E8E4D8;
border-bottom: 2px solid #E8E4D8;
```

### Right-side Buttons

- **"Log in":** ghost style — transparent background, `1px solid rgba(232,228,216,0.15)` border
- **"Get started" / connected wallet address:** solid white button (`#E8E4D8` bg, `#0C0C0C` text)

### Mobile Nav (`< 768px`)

Nav links are hidden. A hamburger icon is shown. On click, a full-screen overlay menu appears with the same link styles at larger size.

### Beta Banner (above nav)

```css
height: 36px;
position: fixed;
top: 0;
z-index: 200;
background: #080C10;
border-bottom: 1px solid rgba(0, 210, 210, 0.2);
```

Content: pulsing dot + `"PUBLIC BETA"` + testnet warning message + "Learn more" link.

> Note: The `#080C10` background and the cyan border on the beta banner are the only exceptions to the warm-monochrome rule — this is intentional to visually flag the beta state as distinct from the product itself.

---

## 8. MOTION

Vela uses minimal, purposeful animation. Nothing is decorative except the hex canvas, which is thematic.

| Element | Animation | Duration |
|---------|-----------|----------|
| Hex canvas ambient flicker | Random cell scramble, 0.3% per frame | Continuous, 30fps |
| Mouse proximity (hex canvas) | Cells within 120px scramble + brighten | Instant response |
| Hex rain columns | Static — vertical text only, no animation | n/a |
| Order book depth bars | `width` transition on data update | `0.4s ease` |
| LIVE dot pulse | `opacity` keyframe loop | `1.5–2s` |
| Price flash (bid) | `rgba(107,138,90,0.2)` → transparent | `0.4s` |
| Price flash (ask) | `rgba(204,51,51,0.2)` → transparent | `0.4s` |
| Loading skeleton pulse | `opacity 1 → 0.4 → 1` | `1.8s ease-in-out` |
| Hover states | `background` transition | `0.15s` |

No other animation. No transitions on color changes beyond price flash. No spring physics. No page transitions.

---

## 9. RESPONSIVE

### Breakpoints

| Name | Range |
|------|-------|
| Mobile | `< 640px` |
| Tablet | `640px – 1024px` |
| Desktop | `> 1024px` |

### Trading Terminal

Gated at `< 1024px`. Displays `MobileGate` component instead of the terminal:
- Headline: **"Built for the desktop."** — Playfair Display 700, ~28px
- Two buttons: "View Markets" (primary) + "Back to Home" (ghost)

### Landing Page — Mobile

- Hero: single column, headline reduces to `44px`
- All sections: `1` column, `padding: 24px`
- Email capture form: inputs and button stack vertically
- Ghost wordmarks and decorative text hidden

### Markets Overview — Mobile

- Grid collapses to `1` column
- Footer stats strip hidden

### Nav — Mobile

- Nav links hidden
- Hamburger icon shown
- Full-screen overlay on hamburger click

---

## 10. PAGE-SPECIFIC NOTES

### Landing Page (`app/page.tsx`)

- `HexCanvas` used on S1 (hero), S3 (features), S5 (CTA)
- S5 has vertical hex rain flanking the CTA content (see Section 4)
- Ghost "Vela" wordmark on hero:
  ```css
  font-family: 'Playfair Display', serif;
  font-weight: 900;
  font-style: italic;
  font-size: 140px;
  color: rgba(232, 228, 216, 0.04);
  letter-spacing: -4px;
  pointer-events: none;
  ```

### Markets Overview (`app/markets/page.tsx`)

- **Sparkline bars:** 12 bars per card, `display: flex; align-items: flex-end`
  - Up bars: `#6B8A5A`
  - Down bars: `#CC3333`
- **Price font-size scales by value:**
  - `> 10,000`: `24px`
  - `> 100`: `28px`
  - `< 1`: `28px`

### Trading Terminal (`app/markets/[pair]/page.tsx`)

- Candlestick chart via `lightweight-charts`
- Chart color config:
  ```js
  upColor: '#6B8A5A',
  downColor: '#CC3333',
  borderUpColor: '#6B8A5A',
  borderDownColor: '#CC3333',
  wickUpColor: '#6B8A5A',
  wickDownColor: '#CC3333',
  layout: { background: { color: '#0C0C0C' }, textColor: '#E8E4D8' },
  grid: { vertLines: { color: 'rgba(232,228,216,0.04)' }, horzLines: { color: 'rgba(232,228,216,0.04)' } }
  ```

### Transparency Page (`app/transparency/page.tsx`)

- Same alternating dark/light section structure as landing page
- `HexCanvas` on dark sections
- Typography and spacing identical to landing

### 404 Page (`app/not-found.tsx`)

- Full viewport, `HexCanvas` as background
- Ghost "404":
  ```css
  font-family: 'Playfair Display', serif;
  font-weight: 900;
  font-style: italic;
  font-size: 120px;
  color: rgba(232, 228, 216, 0.06);
  pointer-events: none;
  ```
