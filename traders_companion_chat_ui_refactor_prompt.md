# Trader’s Companion — Premium Chat Interface Refactor Prompt

## Objective

Refactor the Trader’s Companion sidepanel chat interface in this codebase so it feels like a polished WhatsApp / Telegram-style messaging interface inside a professional trading companion extension.

The current UI is functional but visually weak. The header is cramped, the buttons feel raw, the tabs look like bulky dashboard buttons, and the composer still feels like a native textarea. The final result should look cleaner, denser, more premium, and more product-ready.

This is a UI/UX refactor, not a logic rewrite.

Do **not** add fake AI responses.
Do **not** add dummy chat messages.
Do **not** add fallback provider behavior.
Do **not** make the chat active on every browser tab.
Do **not** break existing provider, streaming, storage, screenshot, or session logic.

---

## Target Files

Work mainly in these files:

```txt
src/sidepanel/App.tsx
src/sidepanel/Chat.tsx
src/index.css
```

Only touch these if required:

```txt
tailwind.config.js
src/sidepanel/components/*
src/lib/*
```

Do not perform broad architecture changes unless the existing code structure already supports it cleanly.

---

## Design Direction

The final UI should feel like:

- WhatsApp / Telegram-style chat layout
- Premium dark fintech/SaaS assistant
- Compact browser extension sidepanel
- Professional trading companion interface
- Clean tabs, clean icons, clear status, readable messages
- Dense but not cramped
- Modern but not toy-like

Avoid:

- Big pill buttons everywhere
- Heavy shadows
- Bulky dashboard-card styling inside the chat
- Raw textarea visuals
- Fake/demo messages
- Over-engineered animations
- New dependencies unless already available

Use the existing theme tokens where possible:

```txt
tc-bg
tc-panel
tc-surface
tc-elevated
tc-border
tc-green
tc-text
tc-sub
tc-muted
tc-faint
```

If small contrast improvements are needed, update theme values carefully without changing the whole design system.

---

## Core Acceptance Criteria

The refactor is complete only when all of these are true:

- Header looks premium and compact.
- `Refresh` and `Unpin` are icon buttons, not text buttons.
- Dashboard / Chat / Session / Playbook are professional tabs, not chunky buttons.
- Active tab shows icon + label + green underline.
- Inactive tabs are muted but readable.
- Chat layout feels like a real messaging app.
- User messages align right.
- Assistant messages align left.
- Message bubbles are compact, readable, and visually distinct.
- The input composer no longer looks like a raw textarea.
- Quick prompt chips are clean, compact, and icon-based.
- Provider missing state shows a clear connect CTA.
- AI streaming still works inside the same assistant bubble.
- Screenshot/capture behavior still works.
- Session/log trade behavior still works.
- No dummy or fallback AI behavior was added.
- Chat is not activated globally on all tabs.

---

# 1. Header Refactor

## Current Problem

The header currently feels cramped and basic. The `Refresh` and `Unpin` buttons are text buttons, which makes the UI feel unfinished.

## Required Change

Refactor the sidepanel header in `src/sidepanel/App.tsx`.

The header should have:

### Left Side

- A compact `TC` logo block.
- App title: `Trader’s Companion`.
- A secondary status line under the title.
- If a manual/context attachment exists, show:

```txt
Manual Attached
```

with a small paperclip/link icon.

### Right Side

Replace text controls with icon buttons:

- Refresh icon button
- Pin / Unpin icon button
- Close icon button only if the current extension environment supports it cleanly

Do not add a fake close handler if there is no real sidepanel close API available.

## Visual Rules

- Header height should stay compact, around `64px` to `72px`.
- Use subtle border bottom.
- No heavy shadow.
- Logo should be a green rounded square with `TC`.
- Title should be white and semibold.
- Secondary text should be muted or amber depending on current attached state.
- Icon buttons should be rounded, quiet by default, brighter on hover.

## Example Structure

```tsx
<header className="flex h-[68px] items-center justify-between border-b border-tc-border/60 bg-tc-bg px-4">
  <div className="flex min-w-0 items-center gap-3">
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-tc-green text-sm font-black text-black">
      TC
    </div>

    <div className="min-w-0">
      <h1 className="truncate text-sm font-semibold tracking-tight text-tc-text">
        Trader’s Companion
      </h1>
      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-amber-300">
        <PaperclipIcon className="h-3.5 w-3.5" />
        <span className="truncate">Manual Attached</span>
      </div>
    </div>
  </div>

  <div className="flex items-center gap-1">
    <IconButton title="Refresh" onClick={handleRefresh}>
      <RefreshIcon className="h-4 w-4" />
    </IconButton>
    <IconButton title="Unpin" onClick={handlePinToggle}>
      <PinIcon className="h-4 w-4" />
    </IconButton>
  </div>
</header>
```

---

# 2. Icon Button Component

Create a small local `IconButton` helper inside `App.tsx` or a local component file if that matches the current structure.

```tsx
function IconButton({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string
  onClick?: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-tc-muted transition hover:border-tc-border hover:bg-tc-surface hover:text-tc-text disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  )
}
```

Use `currentColor` SVG icons so icon color follows Tailwind classes.

---

# 3. Professional Tab Navigation

## Current Problem

The current tabs look like large rounded buttons:

```tsx
<nav className="grid grid-cols-4 gap-1 ...">
  <Button>{tab.label}</Button>
</nav>
```

This makes the interface feel amateur and crowded.

## Required Change

Replace the bulky button nav with a proper product tab bar.

Tabs:

```txt
Dashboard
Chat
Session
Playbook
```

Each tab should have:

- Icon
- Label
- Active underline
- Muted inactive state
- Hover state

## Tab Config

```tsx
const TABS: Array<{
  id: SidecarTab
  label: string
  icon: React.ReactNode
}> = [
  { id: 'dashboard', label: 'Dashboard', icon: <DashboardIcon /> },
  { id: 'chat', label: 'Chat', icon: <ChatIcon /> },
  { id: 'session', label: 'Session', icon: <ClockIcon /> },
  { id: 'playbook', label: 'Playbook', icon: <BookIcon /> },
]
```

## Tab Design

Container:

```tsx
<nav className="grid grid-cols-4 border-b border-tc-border/60 bg-tc-panel">
```

Tab item:

```tsx
<button
  type="button"
  onClick={() => setActiveTab(tab.id)}
  className={cn(
    'relative flex h-12 items-center justify-center gap-2 text-xs font-medium transition',
    activeTab === tab.id
      ? 'text-tc-text'
      : 'text-tc-muted hover:bg-tc-surface/50 hover:text-tc-sub'
  )}
>
  <span className="h-4 w-4">{tab.icon}</span>
  <span className="hidden min-[360px]:inline">{tab.label}</span>

  {activeTab === tab.id ? (
    <span className="absolute bottom-0 left-4 right-4 h-[2px] rounded-full bg-tc-green" />
  ) : null}
</button>
```

## Important

Do not use filled button backgrounds for active tabs.
The active indicator should be an underline / bottom border.
This should feel like a normal professional app tab design.

---

# 4. SVG Icons

Use inline SVG icons. Do not install an icon package unless the project already has one.

Create icons locally using `currentColor`.

Needed icons:

```txt
RefreshIcon
PinIcon
DashboardIcon
ChatIcon
ClockIcon
BookIcon
ChevronDownIcon
SendIcon
StopIcon
PaperclipIcon
ChartIcon
ScaleIcon
QuestionIcon
CameraIcon
NoteIcon
ConnectionIcon
CheckDoubleIcon
```

Example icon style:

```tsx
function RefreshIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 5v4h4" />
      <path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 19v-4h-4" />
    </svg>
  )
}
```

Keep all icons visually consistent:

- `viewBox="0 0 24 24"`
- `fill="none"`
- `stroke="currentColor"`
- `strokeWidth="1.7"` or `1.8`
- rounded stroke caps and joins

---

# 5. Chat Status Row

## Current Problem

The provider/status row works but looks too plain.

## Required Change

In `src/sidepanel/Chat.tsx`, refactor the chat status/header row.

It should be a slim status bar between the tabs and messages.

### Left Side

- Small green dot
- Provider/model name, e.g. `GPT-4o`
- Chevron-down icon if provider/model switching exists

### Right Side

Show current state:

```txt
Connected
Streaming
Not connected
Error
```

With a small connection/link/status icon.

## Example

```tsx
<div className="flex h-11 items-center justify-between border-b border-tc-border/50 bg-tc-bg px-4">
  <div className="flex min-w-0 items-center gap-2">
    <span className={cn(
      'h-2 w-2 rounded-full',
      isConnected ? 'bg-tc-green' : 'bg-tc-muted'
    )} />
    <button className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-tc-text">
      <span className="truncate">{providerLabel}</span>
      <ChevronDownIcon className="h-3.5 w-3.5 text-tc-muted" />
    </button>
  </div>

  <div className="flex items-center gap-1.5 text-[11px] text-tc-muted">
    <ConnectionIcon className={cn('h-3.5 w-3.5', isConnected && 'text-tc-green')} />
    <span>{statusLabel}</span>
  </div>
</div>
```

Do not make this row a big card.
It should be slim and app-like.

---

# 6. Chat Message Area

## Required Layout

The message list should:

- Fill available height.
- Scroll naturally.
- Auto-scroll to latest message when new content arrives.
- Not make the whole extension page scroll unnecessarily.
- Have enough bottom padding so the composer does not cover messages.

Example wrapper:

```tsx
<div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
  <div className="space-y-3">
    {messages.map(...)}
  </div>
</div>
```

Use custom scrollbar styling if already available.
If not, add a small utility in `index.css`.

---

# 7. Message Bubble Refactor

## Current Problem

Messages are readable but still feel like generic blocks.
They should feel more like real chat bubbles.

## Required Change

Refactor `MessageBubble` in `src/sidepanel/Chat.tsx`.

### User Bubble

- Align right.
- Green-tinted background.
- Rounded corners.
- Slight chat-tail effect using one corner like `rounded-br-sm`.
- Timestamp in bottom-right.
- Optional double-check icon.

Suggested classes:

```tsx
'bg-tc-green/15 border border-tc-green/20 text-tc-text rounded-2xl rounded-br-sm px-3.5 py-2.5 max-w-[82%]'
```

### Assistant Bubble

- Align left.
- Dark elevated background.
- Subtle border.
- TC avatar to the left.
- Slight tail effect using `rounded-bl-sm`.
- Timestamp in bottom-left.

Suggested classes:

```tsx
'bg-tc-elevated border border-tc-border/70 text-tc-text rounded-2xl rounded-bl-sm px-3.5 py-2.5 max-w-[84%]'
```

### Assistant Avatar

For assistant messages, show a small avatar:

```tsx
<div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-tc-green/15 text-[11px] font-bold text-tc-green">
  TC
</div>
```

### Bubble Content

Support:

- Multiline text
- Links if already supported
- Code blocks if already supported
- Long wrapping text
- Streaming cursor
- Typing dots before first token

Use:

```tsx
whitespace-pre-wrap break-words leading-relaxed
```

### Streaming Cursor

When assistant is streaming and content exists:

```tsx
<span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse rounded-full bg-tc-green align-[-2px]" />
```

### Typing Dots

If assistant bubble exists but has no content yet:

```tsx
<div className="flex items-center gap-1 py-1">
  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-tc-muted" />
  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-tc-muted [animation-delay:120ms]" />
  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-tc-muted [animation-delay:240ms]" />
</div>
```

---

# 8. Quick Prompt Chips

## Current Problem

The quick actions are cramped and look like small raw buttons.

## Required Change

Refactor quick prompts into compact Telegram-style chips.

Current actions:

```txt
Review chart
Check playbook
Am I forcing this?
What is missing?
Capture screenshot
Log trade idea
```

Better labels:

```txt
Show chart
Check playbook
Am I forcing this?
What is missing?
Capture
Log idea
```

## Prompt Config

```tsx
const QUICK_PROMPTS = [
  { id: 'review-chart', label: 'Show chart', prompt: 'Review chart', icon: <ChartIcon /> },
  { id: 'check-playbook', label: 'Check playbook', prompt: 'Check playbook', icon: <BookIcon /> },
  { id: 'forcing', label: 'Am I forcing this?', prompt: 'Am I forcing this?', icon: <ScaleIcon /> },
  { id: 'missing', label: 'What is missing?', prompt: 'What is missing?', icon: <QuestionIcon /> },
  { id: 'capture', label: 'Capture', prompt: 'Capture screenshot', icon: <CameraIcon /> },
  { id: 'log-idea', label: 'Log idea', prompt: 'Log trade idea', icon: <NoteIcon /> },
]
```

## Chip Design

```tsx
<div className="scrollbar-none flex gap-2 overflow-x-auto px-4 py-3">
  {QUICK_PROMPTS.map((item) => (
    <button
      key={item.id}
      type="button"
      onClick={() => handleQuickPrompt(item.prompt)}
      className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-tc-border/70 bg-tc-surface/70 px-3 text-xs font-medium text-tc-sub transition hover:border-tc-green/50 hover:bg-tc-green/10 hover:text-tc-text"
    >
      <span className="h-3.5 w-3.5 text-tc-green">{item.icon}</span>
      <span>{item.label}</span>
    </button>
  ))}
</div>
```

## Behavior Rules

Preserve existing behavior:

- `Capture screenshot` must still trigger screenshot logic.
- `Log trade idea` must still open or route to the relevant session/manual trade form.
- AI prompt chips must still send the correct prompt text.
- Do not turn all chips into normal AI messages if some chips currently have special handlers.

---

# 9. Composer/Input Refactor

## Current Problem

The input currently looks like a native textarea with a visible raw scrollbar.
That makes the chat feel unfinished.

## Required Change

Refactor `ChatInput` to look like a real messaging composer.

### Composer Layout

- Outer rounded container.
- Textarea inside with no raw border.
- Attachment icon button inside composer.
- Circular green send button.
- Stop button while streaming.
- Disabled state when input is empty or no provider is connected.

## Suggested Markup

```tsx
<form onSubmit={handleSubmit} className="border-t border-tc-border/50 bg-tc-bg px-4 py-3">
  <div className="flex items-end gap-2 rounded-2xl border border-tc-border/70 bg-tc-panel p-2 transition focus-within:border-tc-green/50">
    <button
      type="button"
      title="Attach"
      className="mb-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-tc-muted transition hover:bg-tc-surface hover:text-tc-text"
    >
      <PaperclipIcon className="h-4 w-4" />
    </button>

    <textarea
      value={input}
      onChange={(event) => setInput(event.target.value)}
      onKeyDown={handleKeyDown}
      placeholder="Ask TC about this chart..."
      rows={1}
      className="max-h-28 min-h-[36px] flex-1 resize-none bg-transparent px-1 py-2 text-sm leading-5 text-tc-text outline-none placeholder:text-tc-faint scrollbar-none"
    />

    {isStreaming ? (
      <button
        type="button"
        onClick={handleStop}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-500/15 text-red-300 transition hover:bg-red-500/25"
        title="Stop response"
        aria-label="Stop response"
      >
        <StopIcon className="h-4 w-4" />
      </button>
    ) : (
      <button
        type="submit"
        disabled={!canSend}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-tc-green text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-tc-surface disabled:text-tc-muted"
        title="Send"
        aria-label="Send"
      >
        <SendIcon className="h-4 w-4" />
      </button>
    )}
  </div>
</form>
```

## Keyboard Behavior

Keep this behavior:

- `Enter` sends message.
- `Shift + Enter` creates a new line.
- Empty input should not send.
- Sending disabled if provider is not connected.
- Streaming can be cancelled if the current code supports cancellation.

## Auto Height

If the textarea already auto-resizes, preserve it.
If not, add a small safe auto-height handler:

```tsx
function resizeTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 112)}px`
}
```

Call it on change and after send reset.

---

# 10. Empty State

## Required Change

Improve `EmptyChat` in `Chat.tsx`.

There should be two states:

---

## Connected Empty State

Show:

```txt
Ask your trading assistant
Review the active chart, check your playbook, or challenge your trade idea.
```

Then show quick prompt chips.

---

## Disconnected Empty State

Show:

```txt
No AI provider connected
Connect GPT-4o or Claude to start live trade reviews.
```

CTA:

```txt
Connect AI Provider
```

Click behavior:

```tsx
chrome.runtime.openOptionsPage()
```

Only use this if `chrome.runtime.openOptionsPage` exists in the current environment.
Guard it safely:

```tsx
function openProviderSettings() {
  if (chrome?.runtime?.openOptionsPage) {
    chrome.runtime.openOptionsPage()
  }
}
```

Do not add fake chat examples.
Do not add mock AI messages.

---

# 11. Provider Missing State

When no AI provider is connected:

- Disable composer send.
- Keep textarea readable but do not allow send.
- Show a small inline warning or status.
- Provide a clear CTA to connect provider.

Example text:

```txt
No AI provider connected.
```

Button:

```txt
Connect AI Provider
```

Click:

```tsx
chrome.runtime.openOptionsPage()
```

Do not silently fail.
Do not fallback to fake AI.
Do not generate local dummy responses.

---

# 12. Error Bubble

If an AI request fails, show a clean assistant-side error bubble.

Requirements:

- Align left.
- Red/amber-tinted subtle border.
- Show the real error message.
- Do not crash the UI.
- Do not hide the error.

Example:

```tsx
<div className="rounded-2xl rounded-bl-sm border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-100">
  {errorMessage}
</div>
```

The goal is clear feedback, not a scary full-screen error.

---

# 13. Footer Polish

Keep the bottom footer but refine it.

Current concept:

```txt
Manual | Updated 19:28
```

Final design:

```tsx
<footer className="flex h-7 items-center justify-between px-4 text-[10px] text-tc-muted">
  <span>{modeLabel}</span>
  <span>Updated {updatedTime}</span>
</footer>
```

Rules:

- Muted text.
- Compact height.
- No heavy border unless needed.
- Do not make footer visually compete with the composer.

---

# 14. Scrollbar Styling

The screenshot shows ugly scroll behavior and raw scrollbars in the composer area.
Fix this.

Add to `src/index.css` if missing:

```css
.scrollbar-none {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.scrollbar-none::-webkit-scrollbar {
  display: none;
}

.scrollbar-thin-custom {
  scrollbar-width: thin;
  scrollbar-color: rgba(148, 163, 184, 0.25) transparent;
}

.scrollbar-thin-custom::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.scrollbar-thin-custom::-webkit-scrollbar-track {
  background: transparent;
}

.scrollbar-thin-custom::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.22);
  border-radius: 999px;
}

.scrollbar-thin-custom::-webkit-scrollbar-thumb:hover {
  background: rgba(148, 163, 184, 0.35);
}
```

Use:

- `scrollbar-none` for quick prompt chips and textarea.
- `scrollbar-thin-custom` for message list if needed.

---

# 15. Responsive/Sidepanel Width Rules

The UI must remain usable in narrow extension width.

Rules:

- Do not make header actions wrap.
- Do not make tab labels overflow.
- On very narrow width, labels may shrink or hide, but active tab should remain obvious.
- Quick prompt chips should horizontal-scroll.
- Message bubbles should never exceed width.
- Text should wrap cleanly.

Suggested widths:

```tsx
max-w-[82%] // user messages
max-w-[84%] // assistant messages
```

Do not use fixed pixel widths for bubbles.

---

# 16. Preserve Existing Behavior

This refactor must preserve all existing app behavior.

Specifically:

## AI Streaming

- User message should appear immediately.
- Assistant bubble should appear when request starts.
- Assistant response should stream into the same bubble.
- Do not wait until the full response is complete.
- Stop/cancel should still work if currently supported.

## Provider Logic

- No provider = no send.
- Show connect CTA.
- Do not generate fallback response.
- Do not guess provider behavior.

## Screenshot Logic

- Any existing screenshot capture flow must remain wired.
- `Capture screenshot` quick action should still trigger the real capture logic.

## Session / Trade Idea Logic

- `Log trade idea` should still open the correct session/manual trade flow if currently implemented.
- Do not convert it into a normal AI prompt unless that is already how the app works.

## Extension Scope

- Do not make the chat run on every tab.
- Do not activate global listeners unnecessarily.
- Chat should only run when the user opens the sidepanel/chat tab.
- Avoid unnecessary background work.

---

# 17. Suggested File-Level Implementation Plan

## Step 1 — Inspect Current Code

Before editing, inspect:

```txt
src/sidepanel/App.tsx
src/sidepanel/Chat.tsx
src/index.css
tailwind.config.js
```

Identify:

- Current tab state type
- Current header component
- Current button component usage
- Current chat state and streaming flow
- Current quick prompt handlers
- Current screenshot/session handlers
- Current provider connection check

Do not guess. Preserve names and logic.

---

## Step 2 — Add Local Icons

Add local SVG icon components either:

- At the bottom of `App.tsx` and `Chat.tsx`, or
- In a small shared local file if the project already has that pattern.

Use `currentColor` for all icons.

Do not add a dependency just for icons.

---

## Step 3 — Refactor Header

Replace text action buttons with icon buttons.

Before:

```txt
Refresh
Unpin
```

After:

```txt
[refresh icon] [pin icon]
```

Use `title` and `aria-label` for accessibility.

---

## Step 4 — Refactor Tabs

Replace big button grid with slim professional tabs.

Keep the current active tab state and tab switching behavior.

---

## Step 5 — Refactor Chat Header/Status Row

Make provider/status row slim and readable.

Add connection icon and streaming/not-connected state.

---

## Step 6 — Refactor Bubbles

Update `MessageBubble` only.

Do not rewrite the full chat state machine.

---

## Step 7 — Refactor Quick Prompts

Add icon-based quick chips.

Preserve special action handlers.

---

## Step 8 — Refactor Composer

Update input appearance.

Remove raw textarea scrollbar.

Preserve keyboard behavior.

Preserve send/stop behavior.

---

## Step 9 — Add/Update CSS Utilities

Add scrollbar utilities only if missing.

Do not globally override every scrollbar if that could damage the rest of the extension.

---

## Step 10 — Manual QA

Test:

- Sidepanel opens.
- Header action buttons still work.
- Tabs switch correctly.
- Chat tab renders correctly.
- Provider connected state displays correctly.
- Provider missing state displays correctly.
- Sending message works.
- Streaming works.
- Stop streaming works if supported.
- Quick prompts work.
- Screenshot action works.
- Log idea action works.
- Composer does not show raw textarea scrollbar.
- Message list scrolls but whole app does not jump.

---

# 18. Final UI Description

The final interface should look like this:

- Top compact header with green `TC` logo, app title, and manual-attached indicator.
- Header action buttons are only icons: refresh, pin/unpin, close if available.
- Tab row is clean: Dashboard, Chat, Session, Playbook with icons.
- Active tab is shown using a green underline, not a filled button.
- Provider row shows `GPT-4o` on the left and `Connected` on the right.
- Chat body uses modern message bubbles.
- User bubble is right-aligned and green-tinted.
- Assistant bubble is left-aligned with TC avatar.
- Quick actions are compact horizontal chips with icons.
- Bottom composer is a rounded chat input with attach icon and circular send button.
- Footer is minimal: mode on the left, updated time on the right.

The result should feel like a real product UI, not a demo dashboard.

---

# 19. Hard Rules

Do not violate these:

```txt
NO dummy AI messages.
NO fake fallback responses.
NO hardcoded assistant replies.
NO global chat activation on every tab.
NO new icon package unless already installed.
NO broad architecture rewrite.
NO broken screenshot logic.
NO broken streaming logic.
NO raw textarea-looking composer.
NO bulky tab buttons.
```

---

# 20. Deliverable

Return the implementation changes as code edits.

After implementation, summarize:

- Files changed
- UI components refactored
- Behaviors preserved
- Any known limitations

Do not claim behavior works unless it has been verified in the code.
