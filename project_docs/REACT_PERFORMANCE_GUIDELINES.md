<!--
SPDX-FileCopyrightText: 2026 Atanas G. Rusev
SPDX-License-Identifier: AGPL-3.0-or-later
-->

Created: 2026-04-02 10:20 EEST

# React Performance Guidelines

Dedicated React/frontend performance guide for future agents adding or extending web modules in Kids Games Platform.

Use this document when:
1. adding a new browser route or module
2. changing an existing React interaction flow
3. reviewing a suspected frontend hotspot
4. doing the upfront or closeout performance review required by `docs/add-game-guide.md`

Use it as the default React/web implementation guide for future agents, not only when a task is already known to be performance-heavy.

## Core rules

1. Measure first, then optimize.
2. Prefer simple React data flow over abstraction unless measurement proves the abstraction helps.
3. Avoid adding performance complexity that future agents will have to maintain without a measured benefit.
4. Keep route-specific before/after evidence when changing a user-visible hotspot.

## What agents must review before implementation

For every new React-heavy module or game, identify:
1. likely hot routes
2. likely rerender-heavy components
3. likely hover, tap, motion, canvas, or drag interactions
4. likely expensive derived values
5. likely network-driven loading states
6. whether the route is browser-local or backend-backed

## What agents must review after implementation

After implementation, verify:
1. route load remains acceptable
2. interaction latency feels stable on slower browsers
3. no obvious rerender chain was introduced
4. any new animation or motion is still worth its cost
5. any new fetch path is still proportionate to the UI need

## Design Safety Rules

These rules apply whenever an agent creates, touches, or reviews React UI, especially forms, modals, panels, and responsive board/history surfaces.

1. Form containment is mandatory. Every input, select, textarea, file picker, checkbox row, action row, and interactive list must stay inside its modal/panel boundaries at desktop, narrow desktop, and compact/mobile widths. Any changed form needs targeted tests or viewport checks that prove there is no horizontal overflow or clipped control.
2. Adaptive layout is mandatory. If a surface can be used below its original desktop width, it must wrap, stack, or otherwise adapt at the real transition bands, not only at very wide and very small breakpoints. Prefer min-width removal, grid/flex wrapping, and container-aware layout over hidden overflow.
3. Panel content must be reachable. Important controls must be visible by default when viewport height allows it, or reachable through an internal scroll region with the header/tabs/actions still controllable. Background scrolling must not steal scroll while a modal or panel is open.
4. Scrollbars must stay visually inside rounded shells. Reuse shared scroll-shell styles and clipping for modal/panel scroll regions instead of ad hoc scrollbar rules that can protrude through rounded corners.
5. Icon buttons must be centered and consistent. Use the standard icon system, fixed square hit areas, centered SVGs, consistent padding, and accessible labels. Checkbox rows must align the control first, then a small gap, then wrapping label text inside the container.
6. Blocked workflows need escape paths. When a business rule can block the user's primary task, the UI must expose safe alternatives and tests for each meaningful state transition. If multiple product-safe escape paths are possible, ask the user; if proceeding by assumption, document the assumption in the active phase plan.
7. No horizontal clipping above the supported mobile baseline. Any touched board, history, modal, panel, form, or admin surface must be checked around real breakpoints, including the just-above/just-below transition band and common mobile widths such as `400px`, `390px`, and `375px` where practical. Use wrapping, stacking, `minmax(0, 1fr)`, `min-width: 0`, and bounded internal scroll regions before accepting overflow.
8. Sticky action surfaces must be duplicated or fixed when the workflow is critical. If a modal has long, tabbed, or height-constrained content and saving is a primary action, keep bottom actions reachable and consider a top action near Close so users are not trapped by scroll position.

## Rerender checklist

Always inspect:
1. parent rerenders that force a whole route subtree to repaint
2. prop identity churn from inline arrays, objects, and handlers
3. repeated state writes that set the same value again and again
4. state that could be a cheap derived value instead
5. over-coupled state that causes unrelated UI to rerender

Questions to answer:
1. Is this rerender caused by meaningful state change?
2. Is this rerender happening on every hover, move, or frame?
3. Would a ref, derived value, or smaller component boundary remove the cost?

## Memoization rules

### Add memoization only when justified

Use `memo`, `useMemo`, or stable identity only when:
1. a derivation is measurably expensive
2. stable identity prevents downstream rerenders
3. the component is small and hot enough that memoization clearly helps

### Remove memoization when pointless

Avoid or remove memoization when:
1. the derived value is trivial
2. the dependency list is more complex than the calculation
3. no downstream rerender benefit exists
4. the memo makes the code harder to reason about without measured gain

## State-shape rules

1. Prefer local derived booleans over extra stored booleans when possible.
2. Prefer one meaningful state update over chains of dependent state updates.
3. Avoid introducing state machines or factory-heavy state wrappers unless behavior complexity actually requires them.
4. Keep fast-changing animation or pointer state out of broad React render paths when refs or canvas-local state are more appropriate.

## Event-handler rules

1. Do not treat every inline handler as a problem by default.
2. Care when handler recreation happens inside hot lists or high-frequency interactions.
3. Avoid repeated state writes from pointer move, touch move, drag, scroll, or keyboard repeat when the value is already current.

## Motion and animation rules

1. Prefer CSS transforms and opacity for lightweight interactive feedback.
2. Be careful with JS-driven motion on dense interactive grids or frequently hovered elements.
3. Use broad `transition-all` only when the UI genuinely needs it.
4. For browser-local games, canvas or DOM animation paths should avoid unnecessary React rerenders.
5. If motion is decorative rather than functional, it should be the first thing to simplify when a route feels janky.

## Canvas and game-loop rules

1. Keep frame-by-frame simulation and rendering out of normal React state when practical.
2. Use refs for active run state that must update every frame.
3. Use React state for route UI and user-facing summaries, not for every animation tick.
4. If the canvas route is already healthy, avoid speculative rewrites.

## Data-fetching rules

1. The repo currently uses React Router plus a custom fetch client.
2. TanStack Query is not a default requirement.
3. Consider TanStack Query only if measured duplication, invalidation pain, or shared caching needs justify it.
4. Do not add WebSockets for browser-local games or simple request/response routes without a real-time requirement.

## Global state rules

1. Avoid Redux by default.
2. Prefer local state, refs, and narrow shared helpers.
3. Only consider global state expansion when repeated cross-route synchronization becomes a measured problem.

## Route-specific heuristics for this repo

### Tic-Tac-Toe style routes

Watch for:
1. hover/tap animation overhead on many small cells
2. rerenders caused by status panels or parent wrappers
3. repeated creation of small presentation props or sets

### Snake style routes

Watch for:
1. repeated state writes during pointer or touch movement
2. React state being used for frame-by-frame loop updates
3. unnecessary layout work around the canvas shell

### Flashcards style routes

Watch for:
1. fetch-driven state churn
2. excessive rerenders from progress updates
3. avoidable loading-state complexity

## Keep / Fix Now / Defer framework

Every React performance review should classify findings as:
1. keep as-is
2. fix now
3. defer

Use `defer` when:
1. the route is already healthy
2. the change adds complexity without strong measured gain
3. the current problem is visible but not yet well-isolated

## Required references

Pair this guide with:
1. `project_docs/RnD_docs/ARCHITECTURE.md`
2. `project_docs/RnD_docs/USAGE.md`
3. `project_docs/RnD_docs/PUBLIC_BENCHMARK_SUMMARY.md`
4. Historical benchmark and performance evidence when available

For any future significant frontend optimization pass, keep guidance concise and use measured historical evidence to validate improvements.
