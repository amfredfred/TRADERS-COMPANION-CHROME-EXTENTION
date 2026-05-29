# Trader's Companion — Project Bible

> The AI accountability partner for discretionary traders. Watches your trades, reads your charts, and holds you to the standard you set for yourself.

---

## 1. The Problem

Traders fail not because they lack a strategy. They fail because they cannot consistently execute it.
The gap between knowing your rules and following them is an emotional one — and it widens exactly
when it matters most: after a loss.

The three patterns that destroy accounts:

- **Revenge trading** — re-entering immediately after a loss to recover
- **Overtrading** — taking low-quality setups out of boredom or desperation
- **Rule abandonment** — skipping checklist steps mid-session because "this one feels different"

No tool currently addresses this at the moment of execution, inside the browser, with AI awareness
of what is actually on the chart.

---

## 2. The Solution

Trader's Companion sits inside the browser and activates at two moments: when a position opens, and when
it closes. At each moment it captures a screenshot of the chart, sends it to an AI model, and
opens a structured dialogue with the trader.

It does not automate trades. It does not replace judgment.
It creates a mandatory pause between impulse and action — and builds a data record of every
decision made under pressure.

---

## 3. Target User

- **Primary:** Discretionary retail trader using a web-based terminal
- **Platforms:** Match Trader, MT5 WebTerminal, TradingView, cTrader Web, any browser-based platform
- **Profile:** Has a strategy. Knows their rules. Breaks them anyway under emotional pressure.
- **Pain:** Loses money not from bad setups but from bad execution — revenge trades, oversizing, no stop discipline

---

## 4. Core Value Proposition

> "The only trading tool that watches what you're doing, reads the chart you're looking at,
> and asks you the question you don't want to answer — before the damage is done."

---

## 5. MVP Features

### 5.1 Pre-Trade Gate

The most important feature in the product. Intercepts the Buy/Sell button click **before
the order is submitted to the broker**. Nothing goes through until the trader answers honestly.

This is not a reminder. It is a gate. The trade does not exist until it passes.

**Trigger:** Buy or Sell button clicked on any detected trading platform.

**The Gate — questions asked every time:**

```
Trader's Companion
─────────────────────────────────────────────
Before you place this trade, answer honestly.

1. What is the setup?
   [ Type here... ]

2. Where is your stop loss?
   [ Price level or pips... ]

3. What invalidates this trade?
   [ What would tell you this idea is wrong? ]

4. What is your intended risk on this trade?
   [ $ amount ]     Allowed per your formula: $33.33

5. Does this match your rules today?
   [ ✅ Yes, all rules met ]   [ ❌ No — one or more rules broken ]

6. Setup grade:
   [ A — high conviction ]  [ B — valid but not ideal ]
   [ C — marginal ]  [ Impulse — I know this is emotional ]

─────────────────────────────────────────────
[ Submit trade ]   [ Cancel ]
```

**Blocking logic — trade is blocked or delayed if any of the following:**

| Condition                                   | Action                                               |
| ------------------------------------------- | ---------------------------------------------------- |
| Setup grade = Impulse                       | Hard block — trade rejected, platform lock triggered |
| "Does this match your rules?" = No          | Hard block — platform lock triggered                 |
| Intended risk > risk_per_trade from formula | Hard block with reason shown                         |
| Stop loss field left empty                  | Cannot submit — field required                       |
| Trade invalidation field left empty         | Cannot submit — field required                       |
| Setup description < 10 characters           | Cannot submit — "be specific" prompt                 |

**On hard block:**

```
🚫 Trade Blocked

You marked this as an impulse trade.
You know your own rules better than anyone.

Platform locked for 30 minutes.
```

→ Triggers the full platform lock from Section 5.13

**On pass — trade submitted:**

- All answers logged to trade record automatically
- Trade proceeds to broker as normal
- Entry prompt fires after position confirms open (Section 5.3)

**Why this works:**
Typing out "what invalidates this trade?" in real time forces the rational brain to engage.
If you cannot answer it, you do not have a trade — you have a feeling.
The act of writing it makes the impulse visible to yourself before it becomes a loss.

---

### 5.2 Position Detection

- Monitor the DOM of any web trading platform using MutationObserver
- Detect when a new position row appears in the positions table → **trade opened**
- Detect when a position row disappears or P&L column changes to closed → **trade closed**
- Platform-agnostic: detect by DOM patterns, not hardcoded platform selectors
- Fallback: intercept Buy/Sell button clicks for pre-trade prompt

### 5.3 Chart Screenshot

- On position open: capture visible tab screenshot via `chrome.tabs.captureVisibleTab()`
- On position close: capture screenshot at moment of close
- Screenshot sent to AI with context (platform detected, time, session state)

### 5.4 AI Chart Analysis

- AI receives the screenshot and analyses:
  - What structure is visible (trend, range, key levels)
  - Where price is relative to recent highs/lows
  - Whether the entry/exit looks aligned with standard trading logic
- AI cross-references against the trader's saved rules
- Response is shown inside the overlay dialogue

### 5.5 Entry Prompt (position opens)

Overlay appears immediately after position detection:

```
Trader's Companion
─────────────────────────────────
📸 Chart snapshot taken.

AI sees: "Price is at a previous resistance level,
recent candle shows rejection. Possible short setup."

Why did you enter this trade?
[ Type your reason... ]

Setup grade:  [ A ]  [ B ]  [ C ]  [ Impulse ]

Does this meet all your rules?  [ Yes ]  [ No ]
─────────────────────────────────
[ Log it and continue ]
```

### 5.6 Exit Prompt (position closes)

Different dialogue depending on outcome:

**On profit:**

```
Trader's Companion
─────────────────────────────────
✅ Trade closed at profit.

AI sees: "Price reached the next supply zone and reversed."

What made this trade work?
[ Type your reflection... ]
─────────────────────────────────
[ Log it ]
```

**On loss:**

```
Trader's Companion
─────────────────────────────────
🔴 Trade closed at a loss.

AI sees: "Price broke through your entry level with momentum,
no clear reversal signal was present at entry."

What happened? Did you follow your rules?
[ Type your reflection... ]

Rule check:  [ Followed all rules ]  [ Skipped a rule ]  [ Impulse trade ]
─────────────────────────────────
[ Log it ]
```

### 5.7 Revenge Trade Detection

- If previous trade closed at a loss AND a new position opens within N minutes (default: 15)
- Hard intervention overlay:

```
⚠️ REVENGE TRADE ALERT

Your last trade closed at a loss {X} minutes ago.
Statistically, trades taken within 15 minutes of a loss
have a significantly lower success rate.

Are you sure this setup meets all your rules?

[ I have reviewed my rules — proceed ]   [ Cancel trade ]
```

### 5.8 Overtrading Detection

- Track trade count per session (resets at configurable time e.g. midnight)
- Warning at 80% of max trades set
- Hard prompt at max trades:

```
🛑 MAX TRADES REACHED

You set a limit of {N} trades today. You have reached it.
Taking more trades now means overriding your own rules.

Do you want to override your daily limit?
[ Yes, I accept the risk ]   [ No, I am done for today ]
```

### 5.9 Daily Budget Guard

- Track P&L across the session
- At 70% of daily loss budget: warning
- At 100%: hard intervention prompt (same as overtrading)

### 5.10 Trade Log

- Every trade stored with:
  - Entry/exit time
  - Symbol (parsed from DOM if available)
  - Direction (long/short)
  - P&L (parsed from DOM if available)
  - Setup grade (user input)
  - Rule adherence (user input)
  - Entry reason (user text)
  - Exit reflection (user text)
  - AI chart assessment at entry
  - AI chart assessment at exit
  - Screenshot URLs (stored in Supabase Storage)
- Accessible via extension popup → "My Trades"

### 5.11 AI Provider Toggle

- Settings page with:
  - Claude (Anthropic) API key input
  - GPT-4o (OpenAI) API key input
  - Toggle: which model to use
- Same prompt structure sent to either model
- User can switch at any time

### 5.12 Rules Editor + Playbook Builder

Two layers of rules. Both active simultaneously.

**Layer 1 — Structured Playbook (powers hard enforcement)**
Parsed by the app directly. Used for binary block/allow decisions before the pre-trade gate.

**Layer 2 — Free Text Notes (feeds AI analysis)**
Plain language description of your strategy. Sent to Claude/GPT as system prompt context for
nuanced conversation during gate and exit prompts.

---

#### Playbook Builder

Trader can create one or more named setups. Each setup is a structured rule card:

```
┌─────────────────────────────────────────────────────┐
│  Setup Name          CRT Reversal                   │
│                                                     │
│  Allowed Sessions    [ London ] [ NY ] [ Asian ]    │
│                      ✅ London  ✅ NY  ☐ Asian      │
│                                                     │
│  HTF Bias Required   ( Yes )  ( No )                │
│                                                     │
│  Allowed Symbols     [ XAUUSD ] [ US100 ]           │
│                      + Add symbol                   │
│                                                     │
│  Entry Confirmation  Sweep + displacement + retest  │
│                      [ text field ]                 │
│                                                     │
│  Stop Rule           Below sweep candle / range     │
│                      candle low                     │
│                      [ text field ]                 │
│                                                     │
│  Max Trades/Day      [ 3 ]                          │
│                                                     │
│  Cooldown After Loss [ 30 ] minutes                 │
│                      (min: 30)                      │
│                                                     │
│  Setup Active        [ ✅ ON ]                      │
│                                                     │
│  [ Save Setup ]  [ Delete ]                         │
└─────────────────────────────────────────────────────┘
```

Trader can build multiple setups (e.g. CRT Reversal, Liquidity Sweep, Range Play).
Only active setups are enforced.

---

#### Playbook Fields Reference

| Field               | Type            | How it's enforced                                         |
| ------------------- | --------------- | --------------------------------------------------------- |
| Setup Name          | text            | Shown in pre-trade gate dropdown                          |
| Allowed Sessions    | multiselect     | Hard block if current time outside allowed session        |
| HTF Bias Required   | boolean         | Pre-trade gate asks "Is HTF bias confirmed?" — No = block |
| Allowed Symbols     | tags            | Hard block if symbol not in list                          |
| Entry Confirmation  | text            | Shown as checklist item in pre-trade gate                 |
| Stop Rule           | text            | Shown as reminder, stop field required before submit      |
| Max Trades Per Day  | number          | Overrides global max trades setting for this setup        |
| Cooldown After Loss | number (min 30) | Overrides global cooldown for this setup                  |

---

#### How Playbook Integrates with Pre-Trade Gate

When trader clicks Buy/Sell, **before** the 6-question gate opens:

**Step 0 — Structured checks run silently:**

```
Checking your playbook...
✅ Session: London — allowed
✅ Symbol: XAUUSD — allowed
✅ Trades today: 1 of 3
⚠️  HTF bias: not yet confirmed
```

If any structured check fails → **immediate block**, reason shown, gate never opens:

```
🚫 Trade Blocked — Playbook Violation

Symbol US30 is not in your allowed symbols list.
Your active setups only allow: XAUUSD, US100

This trade does not match your playbook.
```

If all structured checks pass → pre-trade gate opens with setup pre-selected:

```
Setup detected: CRT Reversal
Entry confirmation required: Sweep + displacement + retest

1. Have you confirmed the sweep?     [ Yes ] [ No ]
2. Is there clear displacement?      [ Yes ] [ No ]
3. Has price retested the level?     [ Yes ] [ No ]
4. Where is your stop?               [ ________ ]
5. What invalidates this trade?      [ ________ ]
6. Setup grade:  [ A ]  [ B ]  [ C ]  [ Impulse ]
```

Notice the entry confirmation questions are now **generated from the playbook** —
not generic questions but the specific confirmation steps for this exact setup.

---

#### Free Text Notes (Layer 2)

Below the structured playbook, a free text area remains:

```
Additional context for your AI companion:

[ I trade CRT — Candle Range Theory. I look for...
  write however feels natural                        ]
```

This text is prepended to every AI system prompt. The AI uses it for nuanced
analysis ("this looks like a displacement candle based on your CRT rules")
while the structured fields handle hard enforcement.

**Rule:** Structured fields always override free text for enforcement decisions.
Free text only informs the AI's conversational layer.

---

### 5.14 Risk Formula Settings

The trader's personal risk formula, configured in settings and enforced every session.

```
daily_budget   = account_balance × risk_percent
risk_per_trade = daily_budget ÷ max_trades
```

**Inputs (set once in settings, fixed for the day at session start):**

| Setting        | Description                                 | Example |
| -------------- | ------------------------------------------- | ------- |
| `risk_percent` | % of balance willing to risk today          | 1%      |
| `max_trades`   | Max trades today (your losing streak limit) | 3       |

**Calculated automatically at session start:**

```
Session starts
────────────────────────────────────────
Account balance:    $10,000       ← read from platform DOM if available
                                    or entered manually at session start
Daily budget:       $100          (balance × 1%)
Risk per trade:     $33.33        (budget ÷ 3 trades)
────────────────────────────────────────
Values locked for the rest of the session.
```

**Displayed in the overlay HUD (always visible, corner of screen):**

```
┌─────────────────────────┐
│ 💰 $33.33 / trade       │
│ 📊 Budget: $67 left     │
│ 🔢 Trades: 1 / 3        │
└─────────────────────────┘
```

**Enforcement:**

- When `risk_per_trade` is set, the entry prompt shows it as a reminder:
  _"Your risk on this trade should not exceed $33.33"_
- When cumulative losses hit `daily_budget` → platform lock triggers immediately
- When `trades_today` hits `max_trades` → platform lock triggers immediately
- Both feed directly into Section 5.12 lock conditions

**Session start prompt (if balance cannot be read from DOM):**

```
Trader's Companion — Session Start
──────────────────────────────
What is your account balance today?

[ $_________ ]

Your limits for today:
  Daily budget:    $___  (1% of balance)
  Risk per trade:  $___  (budget ÷ 3 trades)

These are fixed for the rest of the session.

[ Start trading ]
```

---

### Trigger Conditions

Any one of the following locks the platform immediately:

- Revenge trade detected (new position opened within cooldown window after a loss)
- Daily loss budget fully hit
- Max trades for the day exceeded
- Trader self-reports "I broke a rule" in any exit prompt

### The Lock Overlay

Full-page overlay injected into the trading platform tab.
`z-index: 999999` — covers everything. All underlying elements have pointer events blocked.
No close button. No escape key. No clicking through.

```
┌──────────────────────────────────────────────────┐
│                                                  │
│                 🔴 RULE BROKEN                   │
│                                                  │
│     You entered a trade 8 minutes after          │
│     closing a losing position.                   │
│                                                  │
│     This is a revenge trade. You knew that       │
│     when you placed it.                          │
│                                                  │
│          Platform unlocks in                     │
│                                                  │
│                  27:43                           │
│                                                  │
│     Step away from the screen.                   │
│     Come back when the timer is done.            │
│                                                  │
│  ─────────────────────────────────────────────  │
│                                                  │
│  [ I need to override — I understand the risk ]  │
│                                                  │
└──────────────────────────────────────────────────┘
```

### Countdown Duration

- **Minimum: 30 minutes** — cannot be set lower, hardcoded floor
- **Default: 30 minutes**
- **Configurable** up to any duration in settings
- Different durations per trigger type (e.g. revenge trade = 30 min, budget hit = rest of day)

### Persistence — How the Lock Survives Uninstall

Browser overlays cannot persist after an extension is uninstalled — no code running means
no overlay. Instead, a layered persistence approach is used:

**Layer 1 — Supabase (primary)**

- Lock state stored server-side: `{ user_id, locked_until, reason, created_at }`
- On every page load of a trading platform, extension queries Supabase first
- If active lock exists and `locked_until` is in the future → overlay fires immediately
- Survives tab close, browser restart, extension reinstall

**Layer 2 — Uninstall Warning Page**

- `chrome.runtime.setUninstallURL` points to a hosted page showing:
  - Active lock status and exact time remaining
  - The rule that was broken
  - Message: _"Uninstalling Trader's Companion does not remove your lock.
    When you reinstall, it will still be active."_
- Makes uninstalling a conscious, visible act

**Layer 3 — Reinstall Re-enforcement**

- On first load after reinstall, extension checks Supabase
- If lock is still active: overlay fires before trader can touch the platform
- No grace period, no bypass

**Result:** uninstalling to escape requires:
uninstall → see warning page → reinstall → still locked.
Most traders will not go through that process in the heat of the moment.

### Override Mechanic

For genuine emergencies (closing positions, not opening new ones), an override exists
but is designed to be painful and conscious:

**Step 1 — Click override button**
Confirmation dialog appears:

```
Are you sure you want to override your own rules?

Type exactly to confirm:
"I am choosing to override my trading rules"

[ _________________ ]

[ Confirm override ]   [ Cancel — keep lock ]
```

**Step 2 — Type the phrase exactly**

- Phrase must match character for character
- No copy-paste (input field blocks paste)
- Deliberately slow and deliberate

**Step 3 — Override logged permanently**

```
Override logged:
- Time: Friday 29 May, 14:32
- Lock reason: Revenge trade detected
- Time remaining when overridden: 24:11
- This override is saved to your trade history permanently
```

**Step 4 — Escalation rule**

- 2 overrides in a month → minimum lock duration doubles (60 min)
- 3 overrides in a month → minimum lock duration triples (90 min)
- Resets monthly
- User is shown their override count in settings as a metric of self-discipline

### What the Lock Does NOT Block

- Closing existing open positions (managing risk is always allowed)
- Viewing charts in read-only mode
- Accessing the Trader's Companion journal or stats
- The lock only blocks NEW order placement

### 5.15 No Trade Mode — Voluntary Lock

A trader's discipline is strongest in the moment they decide to stop.
This feature protects that decision immediately.

**Activation:** One button, always visible in the TC overlay HUD.

```
[ 🔴 I'm done for today ]
```

**Confirmation prompt:**

```
Trader's Companion
──────────────────────────────────────
You are declaring No Trade Mode.

Reason (optional):
( ) Reached daily target
( ) Feeling emotional
( ) Finished my session
( ) Market not giving setups
( ) Other: [_____________]

New trades will be blocked for the rest of today's session.
Existing positions can still be managed.

[ Confirm — Lock me out ]   [ Cancel ]
──────────────────────────────────────
```

**While active:**

- All new order placement blocked
- Existing positions fully manageable
- Journal and analytics remain accessible
- HUD shows: `🔴 No Trade Mode — Session ended`

**Unlock:** Available after session reset time (configurable, default midnight).
Manual early unlock requires typing override phrase — same mechanic as platform lock.

**Why this matters:** The hardest part of stopping is not being tempted
five minutes later when price moves. This removes the option entirely.

---

### 5.16 Mistake Taxonomy

Free text exit reflections are valuable for journalling but useless for analytics.
Predefined mistake tags make every error measurable over time.

**On every losing trade exit prompt, trader selects all that apply:**

```
What went wrong? (select all that apply)

[ Early entry ]      [ Late entry ]       [ Oversized ]
[ Moved stop ]       [ No stop placed ]   [ Ignored bias ]
[ Revenge trade ]    [ Overtraded ]       [ Exited early ]
[ Held too long ]    [ Random setup ]     [ Wrong session ]
[ Chased price ]     [ Ignored news ]     [ Nothing — valid loss ]
```

**On winning trades, positive tags available:**

```
What worked?

[ Followed plan exactly ]   [ Patient entry ]    [ Correct sizing ]
[ Respected stop ]          [ Took full target ] [ Trusted the setup ]
```

**How tags power analytics:**

- Mistake frequency chart: "Oversized" appears in 40% of your losses
- Pattern detection: "Revenge trade" always follows "Moved stop" for this trader
- Weekly summary: your top 3 mistakes this week
- AI uses tags in exit prompt: "You tagged this as Early Entry —
  what would the correct entry have looked like?"

---

### 5.17 Green Day Protection

Daily loss protection exists. Profit protection is equally important.
Traders make money then give it back. This stops that.

**Configuration (in settings):**

```
Daily profit target:     $______
Giveback limit:          [ 30% ] of daily profit
Hard lock threshold:     [ 50% ] of daily profit
Auto No Trade Mode:      [ ON / OFF ] after target hit
```

**How it works:**

```
You are up $420 today.
Your giveback limit: 40%

If daily P&L drops below $252, new trades will be locked.
```

**Warning (at 30% giveback):**

```
⚠️  Green Day Warning

You were up $420. You are now up $294.
You have given back $126 (30%) of today's profit.

Are you sure you want to keep trading?

[ Yes, I have a valid setup ]   [ No — activate No Trade Mode ]
```

**Hard lock (at 50% giveback):**

```
🔴 Green Day Protection — Locked

You were up $420. You are now up $210.
You have given back 50% of today's profit.

New trades are blocked for the rest of the session.
Existing positions can still be managed.
```

**Why this matters especially for prop firm traders:**

- Prop firms have daily drawdown limits on gross profit — giving back crosses the line
- Protecting a green day is as important as cutting a red one short

---

### 5.18 Discipline Score

Every session generates a Discipline Score (0–100).
Not P&L. Behaviour.

**Score calculation:**

| Action                            | Points |
| --------------------------------- | ------ |
| Completed pre-trade gate fully    | +10    |
| Setup graded A or B (not impulse) | +10    |
| Risk within formula limit         | +10    |
| Stop loss placed before entry     | +10    |
| Followed all playbook rules       | +15    |
| Completed exit reflection         | +10    |
| Stopped at max trades voluntarily | +10    |
| Activated No Trade Mode           | +10    |
| Tagged "followed plan exactly"    | +5     |
| **Deductions**                    |        |
| Impulse trade taken               | -20    |
| Risk exceeded formula limit       | -15    |
| Revenge trade (within cooldown)   | -20    |
| Platform lock triggered           | -15    |
| Override used                     | -20    |
| No stop placed                    | -15    |
| Mistake tag: moved stop           | -10    |
| Mistake tag: oversized            | -10    |

**Displayed in session HUD and weekly stats:**

```
Today's Discipline Score

       78 / 100

██████████████████░░░░  78%

Penalties today:
  Impulse trade at 10:42        -20
  Risk exceeded on XAUUSD       -15

Bonuses today:
  Stopped at max trades          +10
  Completed all gate checks      +10
  Exit reflection completed      +10
```

**Weekly trend visible in analytics:**
Traders can see their discipline score over time independently of P&L.
A week of 85+ discipline scores with negative P&L tells a different story
than a week of 40s with positive P&L. The process is what compounds.

---

### 5.19 Emergency Close Mode

The platform lock must never make a trader feel trapped in a losing position.
Trust depends on this being explicit in the UI — not buried in documentation.

**Every lock screen shows this clearly:**

```
🛑 Trader's Companion — Platform Locked
New trades are blocked. [Reason shown here.]

──────────────────────────────────────────
Risk management is always allowed.

[ Manage existing positions ]
──────────────────────────────────────────

Countdown: 24:11
[ Override — I understand the consequences ]
```

Clicking "Manage existing positions" dims the lock overlay partially,
allowing access to open positions panel only — close, modify SL/TP, partial close.
The new order form remains blocked.

**Why this is non-negotiable:**
A trader who fears being trapped in a loss will never trust the product.
Making emergency access explicit and easy removes the fear —
and paradoxically makes them less likely to override impulsively.

---

### 5.20 AI Confidence Level

The AI reads a screenshot and analyses a chart. It cannot see the full picture.
It must never sound like an oracle.

**Every AI chart assessment includes a confidence tag:**

```
AI Assessment — CRT Reversal Setup

"Price appears to be at a previous support level with
a recent liquidity sweep below. The structure suggests
a possible reversal, consistent with your CRT rules."

Confidence: Medium
Reason: Screenshot shows 15m chart only — HTF context not visible.
         Full context would require higher timeframe confirmation.

This is a review, not a signal.
```

**Confidence levels:**

| Level  | When used                                                           |
| ------ | ------------------------------------------------------------------- |
| High   | Clear structure, setup visible, matches rules explicitly            |
| Medium | Setup visible but partial context — HTF not shown, or chart cut off |
| Low    | Chart unclear, screenshot partial, or setup ambiguous               |

**Framing rule:** Every AI response ends with one of:

- _"This is a review, not a signal."_
- _"Final decision is always yours."_
- _"I can only see what is in this screenshot."_

This protects the product legally and sets correct expectations.
The AI is a reviewer and accountability partner — not a trade recommendation engine.

---

## 6. Technical Architecture

### 6.1 Platform Adapter System

Generic DOM scanning is fallback only. Every supported platform has a dedicated adapter.
Without adapters the product fails unpredictably on real money accounts.

Each adapter implements this interface:

```typescript
interface PlatformAdapter {
  // Detection
  detectBuyButton(): Element | null;
  detectSellButton(): Element | null;
  detectOpenPositions(): Position[];
  detectClosedTrades(): ClosedTrade[];
  detectSymbol(): string | null;
  detectAccountBalance(): number | null;
  detectEquity(): number | null;
  detectPnL(): number | null;
  detectOrderSize(): number | null;
  detectStopLoss(): number | null;
  detectTakeProfit(): number | null;

  // Actions
  blockNewOrders(): void;
  unblockNewOrders(): void;
  allowPositionMgmtOnly(): void;
}
```

**Supported adapters — MVP ships with one, others added iteratively:**

| Platform         | Priority | Notes                  |
| ---------------- | -------- | ---------------------- |
| Match Trader     | MVP      | Primary target         |
| MT5 WebTerminal  | V1       | Second adapter         |
| TradingView      | V1       | Charts + broker widget |
| cTrader Web      | V1       | Third adapter          |
| Generic fallback | Always   | Manual companion mode  |

**Fallback — Unsupported Platform Mode:**
If TC cannot reliably detect order buttons or positions:

- Switches to **Manual Companion Mode** automatically
- Trader manually logs entry/exit via floating TC button
- Pre-trade gate still works as a floating checklist
- Screenshots still captured on demand
- No hard blocking is promised or attempted
- HUD shows: `⚠️ Manual Mode — platform not fully supported`

---

### 6.2 Trade Lifecycle State Machine

Trades are not simple open → close. Partial closes, scale-ins, SL moves, and
pending orders all need to be handled cleanly.

```
PRE_TRADE_INTENT          ← trader opens pre-trade gate
  → ORDER_SUBMITTED       ← order sent to broker
  → PENDING_ORDER         ← limit/stop order waiting
  → POSITION_OPEN         ← filled / pending triggered
  → POSITION_MODIFIED     ← SL/TP moved, size changed
  → PARTIAL_CLOSE         ← scale out, partial TP
  → BREAKEVEN_SET         ← SL moved to entry
  → POSITION_CLOSED       ← full close
  → EXIT_REFLECTION       ← exit prompt completed
  → COMPLETE              ← trade fully logged
```

Each trade gets a unique `trade_intent_id` at gate open.
Real positions are matched back to intent when they appear in the DOM.
Multiple entries on the same idea are grouped under one `trade_intent_id`.
Positions opened without going through the gate are flagged as `UNPLANNED`.

---

### 6.3 Setup Checklist Engine

Entry confirmation in the playbook is structured checklist items — not free text.
Each item is a binary yes/no that the pre-trade gate renders and enforces.

```
Setup: CRT Reversal — Pre-Trade Checklist

[✅] HTF bias confirmed (15m or above)
[✅] Price swept range high or range low
[❌] Displacement candle formed            ← cannot submit until checked
[ ]  Retest of displacement level occurred
[ ]  Stop placed beyond invalidation candle
[ ]  Risk-reward minimum 2R confirmed
```

All items must be checked before the trade can submit.
One unchecked item = cannot proceed. No exceptions, no workarounds.
Checklist items are defined per setup in the Playbook Builder, not hardcoded.

---

### 6.4 Enforcement Modes

Three modes let the trader calibrate enforcement to their current psychology.
New users start in Training Mode for 7 days automatically.

| Feature                  | Training Mode | Strict Mode |   Prop Firm Mode   |
| ------------------------ | :-----------: | :---------: | :----------------: |
| Pre-trade gate           |      ✅       |     ✅      |         ✅         |
| Warnings                 |      ✅       |     ✅      |         ✅         |
| Hard lock on rule breach |      ❌       |     ✅      |         ✅         |
| Platform lock countdown  |      ❌       | ✅ 30 min+  |     ✅ 30 min+     |
| Override                 |    ✅ Easy    |  ✅ Phrase  | ⚠️ Phrase + reason |
| Green day protection     |      ❌       |     ✅      |         ✅         |
| Prop firm drawdown rules |      ❌       |     ❌      |         ✅         |

After 7 days TC prompts: _"Ready for Strict Mode?"_

---

### 6.5 Prop Firm Guardrails

Configurable to match any firm's challenge rules. Enforced as pre-trade hard blocks.

```
Daily drawdown limit      [ $____  or  ___% ]
Overall drawdown limit    [ $____  or  ___% ]
Trailing drawdown         [ ON / OFF ]
Max lot size              [ ____ lots ]
News trading allowed      [ Yes / No ]
Max risk per trade        [ ___% ]
Min trading days          [ ___ days ]
Consistency rule          [ ON / OFF ]
Profit target             [ $____ ]
```

---

### 6.6 Economic News Guard

```
Enable news blocking          [ ON / OFF ]
Affected symbols              [ XAUUSD ] [ US100 ] [ EURUSD ]
Block window before event     [ 15 ] minutes
Block window after event      [ 15 ] minutes
Warning window                [ 30 ] minutes before
```

TC fetches economic calendar (Forex Factory API or Investing.com).
Filters high-impact events for configured symbols.
Block uses same lock overlay as rule breach. Override requires confirmation phrase.

---

### 6.7 Screenshot Privacy Redaction

```
Settings → Privacy → Screenshot Mode

( ) Full screenshot
( ) Redact account info — blur balance, account number, email
( ) Chart only — crop to chart area before sending
```

Canvas-based blur applied to sensitive regions before upload.
Every AI prompt includes: _"Do not reference any account numbers,
balances, or personal identifiers visible in this image."_

---

### 6.8 Account Profiles

Each account has fully isolated data — balance, rules, trades, discipline score, lock state.
A demo lock never affects a live account.

```
Account name:     Funded — FTMO 100k
Account type:     ( Live ) ( Prop Firm ) ( Demo ) ( Backtest )
Platform:         Match Trader
Starting balance: $100,000
Active playbooks: CRT Reversal ✅
Prop firm rules:  FTMO preset ✅
```

Switching accounts: one click in the HUD dropdown.

---

### 6.9 Analytics Dashboard

| Metric                      | What it shows                  |
| --------------------------- | ------------------------------ |
| Win rate by setup           | Which setups actually work     |
| Discipline score trend      | Behaviour over time            |
| P&L vs discipline score     | Process vs outcome correlation |
| Mistake frequency           | Most common error tags         |
| Revenge trade count         | Weekly/monthly trend           |
| Best / worst session window | When to trade and when not to  |
| Avg trade after loss        | Revenge trade performance      |
| Green day giveback          | How much profit you return     |
| Override history            | Every time override was used   |

**Key view:** P&L vs Discipline Score over 60 days.
When discipline drops, does P&L follow? Most traders will see yes.
That chart changes behaviour more than any lock.

---

### 6.10 Browser Permissions Strategy

| Permission  | Why needed                     | User explanation                                   |
| ----------- | ------------------------------ | -------------------------------------------------- |
| `activeTab` | Capture chart screenshot       | "To read your chart when you place a trade"        |
| `storage`   | Save settings and lock state   | "To remember your rules and active locks"          |
| `scripting` | Inject trade gate overlay      | "To show the pre-trade checklist on your platform" |
| `tabs`      | Detect trading platform tab    | "To know when you are on a trading platform"       |
| `alarms`    | Countdown timer, session reset | "To run the lock countdown reliably"               |

TC only activates on user-approved domains.
Never runs on unrelated websites. No browsing history access.
Document all permissions clearly on Chrome Web Store listing.

---

### 6.11 Core Tech Stack

| Layer            | Technology                                                     |
| ---------------- | -------------------------------------------------------------- |
| Extension        | Manifest V3, content script, background service worker         |
| UI               | React + Tailwind CSS (injected overlay, side panel)            |
| AI — Claude      | `claude-sonnet-4-20250514` via `api.anthropic.com/v1/messages` |
| AI — GPT         | `gpt-4o` via `api.openai.com/v1/chat/completions`              |
| Backend          | Supabase (Postgres + Auth + Storage + Realtime)                |
| Local fallback   | `chrome.storage.local` for offline / no-account mode           |
| State management | Zustand (extension popup) + chrome.storage.session             |
| Calendar API     | Forex Factory RSS or investing.com for news guard              |

---

## 7. Build Order — Revised Realistic Scope

| Milestone                                 | Timeline   |
| ----------------------------------------- | ---------- |
| Real MVP (core gate + lock)               | 3–5 weeks  |
| Full V1 (AI + analytics + multi-platform) | 8–12 weeks |

### Phase 1 — Scaffold (Week 1)

- Extension scaffold: Manifest V3, content script, background worker, options page
- Match Trader adapter (one platform — get this right before adding others)
- Trade state machine
- Supabase schema + magic link auth

### Phase 2 — Pre-Trade Gate (Week 2)

- Playbook builder UI + checklist engine
- Pre-trade gate overlay — renders checklist from playbook
- Risk formula validator
- Impulse/rule-breach confirmation screen (prevent misclick)

### Phase 3 — Enforcement (Week 3)

- Platform lock overlay + countdown timer
- Lock persistence via Supabase
- Override mechanic + escalation
- No Trade Mode
- Revenge trade + max trades detection
- Training Mode vs Strict Mode toggle

### Phase 4 — Journal + Score (Week 4)

- Exit prompt (profit/loss variants) + mistake taxonomy
- Trade log UI in popup
- Basic discipline score
- Manual screenshot capture
- Account profiles (basic)
- Match Trader testing + polish

### V1 Additions (Weeks 5–12)

- AI chart analysis (vision API)
- MT5 WebTerminal + TradingView adapters
- Green day protection
- Prop firm guardrails (preset library)
- Economic news guard
- Analytics dashboard
- Screenshot privacy redaction
- Multiple prop account profiles
- Chrome Web Store submission

---

## 8. Monetization

| Tier          | Price         | What you get                                                                 |
| ------------- | ------------- | ---------------------------------------------------------------------------- |
| **Free**      | $0            | Training mode, 1 playbook, local storage, basic discipline score             |
| **Pro**       | $19/month     | Strict mode, unlimited playbooks, AI analysis, full analytics, Supabase sync |
| **Prop Firm** | $29/month     | Pro + prop firm guardrails, news guard, multiple accounts                    |
| **Lifetime**  | $149 one-time | Pro forever — early adopter price                                            |

**Why traders pay:** The cost of one revenge trade on a funded account exceeds a year of subscription.
Prop Firm tier targets the challenge/funded account market — large and underserved.

**Growth:** ProductHunt launch + r/Forex, r/Daytrading, X/Twitter trading community.
Demo video: extension catching a revenge trade and locking the platform in real time.

---

## 9. V2 Features

- Weekly AI review — AI reads all trades, gives behavioural debrief
- Pattern detection — "You lose 80% of trades taken after 11am"
- Android overlay app — same Supabase backend, same rules engine
- Mobile companion — Expo app for stats and journal (already designed)
- Custom AI personas — strict coach vs supportive mentor
- Team dashboard — prop firm coach monitors multiple traders

---

## 10. What This Is Not

- Not a trade copier or automation tool
- Not a signal service or financial advice
- Does not execute, modify, or cancel trades programmatically
- The trader retains 100% control at all times
- AI assessments are reviews, not recommendations

---

## 11. Name

**Trader's Companion** ✅ — chosen. Short form: **TC**.

Domain targets: `traderscompanion.com` / `tradercompanion.io` / `thetradercompanion.com`

---

_Built for the trader who already has the edge — and just needs to execute it._
