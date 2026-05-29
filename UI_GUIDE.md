# Trader's Companion UI Guide

This guide translates `UI_GUIDE.png` into reusable product and implementation rules for Trader's Companion.

The visual target is a serious, embedded trading-terminal companion. The UI should feel native to a browser trading platform: dark, compact, high-trust, and operational.

---

## 1. Design North Star

Trader's Companion is not a marketing app, coaching blog, or generic SaaS dashboard. It is an accountability layer that sits directly over a live trading terminal.

The interface should communicate:

- Discipline
- Precision
- Trust
- Calm enforcement
- Immediate trade context

It should feel like a professional trading control surface with an AI accountability partner built in.

---

## 2. Visual Personality

### Use

- Dark trading-terminal surfaces
- Compact panel layouts
- Crisp borders and separators
- Small uppercase metadata labels
- Clear numeric hierarchy
- Meaningful green, red, amber, and blue states
- Icon-led status indicators
- Dense but readable information

### Avoid

- Marketing-page layouts
- Oversized hero sections
- Decorative gradients or blobs
- Friendly pastel palettes
- Large empty cards
- Rounded pill-heavy SaaS styling
- Long explanatory text inside the product UI
- Color used only as decoration

---

## 3. Layout Model

The UI is composed around the trading platform, not outside it.

### Primary Zones

- **Main platform area:** the existing trading chart, watchlist, order panel, and positions table.
- **Top HUD:** persistent session metrics, centered above the chart area.
- **Right companion panel:** the main Trader's Companion workflow surface.
- **Status modules:** compact cards below the main gate panel.
- **Analytics cards:** small secondary insights near the lower edge of the screen.

The app should respect the trading platform's density and grid. Overlays should align cleanly with existing terminal edges and spacing.

---

## 4. Surface System

### Backgrounds

Use near-black and dark navy surfaces.

Suggested roles:

- App/page base: near black
- Primary panels: dark blue-black
- Nested rows: slightly lighter dark surface
- Borders: low-contrast blue-gray
- Dividers: subtle 1px lines

Panels should feel layered but not flashy. Use restrained shadow and blur only when needed to separate TC from the trading platform beneath it.

### Borders And Radius

- Use subtle 1px borders.
- Prefer modest radii around `6px` to `8px`.
- Avoid large pill radii except for small badges or icon status chips.

---

## 5. Color Semantics

Color has meaning in Trader's Companion. Do not use accent colors randomly.

| Color family | Meaning |
| --- | --- |
| Green | Valid setup, passed rule, profit, primary positive action |
| Red | Loss, danger, short-side trade, blocked trade, hard violation |
| Amber / Orange | Warning, mistake tags, caution, review needed |
| Blue / Purple | AI, confidence, analysis, neutral intelligence layer |
| Gray | Inactive, secondary, muted metadata |

### Important Rules

- Red should feel serious. Use it sparingly and consistently.
- Green primary buttons should be reserved for valid progression.
- Amber should warn without implying a hard block.
- AI colors should not make AI feel like a trade signal.

---

## 6. Typography

The typography should be compact and utilitarian.

### Recommended Hierarchy

- **Panel title:** medium-large, clear, high contrast.
- **Metric number:** larger than labels, strong contrast.
- **Metadata labels:** small, uppercase, muted.
- **Body text:** short, direct, operational.
- **Status text:** concise, color-coded where useful.

### Copy Rules

- Keep in-product language brief.
- Do not explain features in long paragraphs.
- Use direct labels: `Risk Per Trade`, `Daily Budget Left`, `Trades Taken Today`.
- Decision screens can use firmer language, but should remain calm and trustworthy.

---

## 7. Top HUD

The top HUD gives persistent session context.

Example metrics:

- Risk per trade
- Daily budget left
- Trades taken today
- Discipline score

### Design Rules

- Keep it compact and horizontally segmented.
- Use small uppercase labels above strong numeric values.
- Use subtle dividers between metrics.
- Include trend visualization only if it remains compact.
- Do not let the HUD compete with the active gate or chart.

---

## 8. Pre-Trade Gate

The Pre-Trade Gate is the most important UI in the product.

It should be visually dominant, structured, and decisive.

### Required Structure

1. Header
2. Trade summary rows
3. Rules checklist
4. Setup grade
5. Primary and secondary actions

### Header

Include:

- TC icon
- `Pre-Trade Gate` title
- Help icon
- Settings icon
- Close icon

Header controls should use icons, not text buttons.

### Trade Summary Rows

Rows should be compact and scannable.

Examples:

- `Setup` -> `Bullish Breaker + Retest`
- `Stop Loss` -> `66,250.0 (1.59%)`
- `Invalidation` -> `Below 66,000.0`
- `Intended Risk` -> `$500.00 (1.00%)`

Use color only when the value carries meaning:

- Green for valid setup names or healthy values.
- Red for stop/loss/risk danger values.

### Rules Checklist

Checklist items should be binary and enforceable.

Example items:

- HTF bias confirmed
- Sweep confirmed
- Displacement visible
- Retest complete

Passed items use green circular check indicators.
Failed or missing items should use clear warning/error states.

### Setup Grade

Show setup grade as a small badge plus label.

Examples:

- `A` + `High Quality`
- `B` + `Valid`
- `C` + `Marginal`
- `Impulse`

Impulse must visually read as a serious warning or block state.

### Actions

Use two clear actions:

- Secondary muted button: `Cancel`
- Primary green button: `Ready to Submit`

Primary action should only appear enabled when all required checks pass.

---

## 9. Status Modules

Status modules sit below the main gate panel. They should be compact, icon-led, and immediately scannable.

Examples:

- No Trade Mode
- Mistake Tags
- Green Day Protection
- AI Review Confidence

### Design Rules

- Use a small icon container on the left.
- Use a strong title.
- Use one or two short supporting lines.
- Use color to show status.
- Avoid long descriptions.

### Example Status Copy

```text
No Trade Mode
Inactive
Toggle to block all entries
```

```text
Green Day Protection
Active
Lock in profits. Guard focus.
```

```text
AI Review Confidence
High Confidence
Based on similar setups
```

---

## 10. Analytics Cards

Analytics should be secondary to the live trading workflow.

Recommended cards:

- Mistake frequency donut chart
- Weekly discipline trend line chart
- Rule breaches bar chart

### Design Rules

- Keep cards small and dense.
- Use concise chart labels.
- Use tabs or compact dropdowns for time ranges.
- Avoid large dashboard layouts inside the trading view.
- Analytics should support behavior correction, not distract from execution.

---

## 11. Buttons And Controls

### Primary Buttons

Use for confirmed positive progression.

Example:

- `Ready to Submit`

Primary buttons should be green and visually strong.

### Destructive Or Dangerous Actions

Use red for hard blocks, loss states, or rule violations.

Avoid using red for ordinary cancellation unless the action is destructive.

### Secondary Buttons

Use muted dark surfaces with subtle borders.

Example:

- `Cancel`

### Icon Buttons

Use icons for:

- Help
- Settings
- Close
- Expand/collapse
- Chart tools
- Toggles

Icon buttons should have accessible labels/tooltips.

---

## 12. Enforcement States

The UI should become firmer as the user's behavior becomes riskier.

### Normal

- Calm dark surfaces
- Green checks
- Clear primary action

### Warning

- Amber emphasis
- Short cautionary copy
- User can still proceed when rules allow

### Hard Block

- Red emphasis
- Clear reason
- No ambiguity about what is blocked
- Position management remains available

### Lock

The lock UI must clearly state:

- New trades are blocked
- Why the lock happened
- How long remains
- Existing position management is still allowed

This is a trust requirement. The trader must never feel trapped in an open position.

---

## 13. AI Presentation

AI should feel useful and grounded, not mystical.

### AI UI Rules

- Use blue or purple visual language.
- Show confidence level clearly.
- Explain the reason for confidence briefly.
- Never present AI analysis as a signal.
- Keep AI copy short inside overlays.

### Required Framing

AI assessments should include one of:

- `This is a review, not a signal.`
- `Final decision is always yours.`
- `I can only see what is in this screenshot.`

---

## 14. Density And Spacing

Trader's Companion should support fast scanning.

### Spacing Rules

- Prefer compact vertical rhythm.
- Use dividers between data rows.
- Use consistent internal panel padding.
- Keep related controls close together.
- Do not create large decorative empty areas.

### Information Density

The UI may be dense if hierarchy is clear.

Prioritize:

1. Current trade decision
2. Risk state
3. Rule status
4. Lock/protection state
5. Behavioral analytics

---

## 15. Responsive Behavior

The extension should adapt to platform size without breaking the trading workflow.

### Wide Desktop

- Right companion panel remains visible.
- Top HUD remains compact.
- Analytics may be shown near the bottom.

### Narrow Viewports

- Companion panel may become a drawer.
- Analytics should collapse or move behind tabs.
- Gate actions must remain visible and usable.
- Text must not overflow buttons, cards, or rows.

---

## 16. Implementation Checklist

Before shipping UI changes, verify:

- The UI still feels like a trading terminal overlay.
- The Pre-Trade Gate remains the dominant workflow.
- Color semantics are consistent.
- Green is not used decoratively.
- Red is reserved for danger or loss states.
- AI is framed as review, not signal.
- Existing position management is never visually blocked without explanation.
- Labels and numbers are scannable at a glance.
- No cards are nested inside cards.
- No long instructional copy clutters the active trading surface.
- Buttons and compact rows do not overflow on smaller widths.

---

## 17. Reference Image

Use `UI_GUIDE.png` as the visual north star for:

- Dark terminal surfaces
- Right-side gate composition
- Compact HUD metrics
- Meaningful market colors
- Icon-led status modules
- Small analytics cards

Future UI should evolve from this reference, not away from it.
