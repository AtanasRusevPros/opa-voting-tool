<!--
SPDX-FileCopyrightText: 2026 Atanas G. Rusev
SPDX-License-Identifier: AGPL-3.0-or-later
-->

Created: 2026-04-02 10:20 EEST

# React Performance Guidelines

React/frontend guidance for OpaVoting: preserve responsive voting, history and administration without adding unnecessary layout or state machinery.

[Documentation index](README.md) · [Architecture](RnD_docs/ARCHITECTURE.md) · [Responsive matrix](RnD_docs/RESPONSIVE_TESTING.md)

Use this document when:
1. adding a new browser route or module
2. changing an existing React interaction flow
3. reviewing a suspected frontend hotspot
4. reviewing a voting/history/admin change against the existing performance and responsive suites

Use it as the default React/web implementation guide for future agents, not only when a task is already known to be performance-heavy.

## Core rules

1. Measure first, then optimize.
2. Prefer simple React data flow over abstraction unless measurement proves the abstraction helps.
3. Avoid adding performance complexity that future agents will have to maintain without a measured benefit.
4. Keep route-specific before/after evidence when changing a user-visible hotspot.

## What agents must review before implementation

For each substantial React surface change, identify:
1. likely hot routes
2. likely rerender-heavy components
3. likely hover, tap, motion, canvas, or drag interactions
4. likely expensive derived values
5. likely network-driven loading states
6. which API/WebSocket state and permissions the surface depends on

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
4. For board interactions, keep high-frequency pointer/animation work out of broad React rerender paths.
5. If motion is decorative rather than functional, it should be the first thing to simplify when a route feels janky.

## Data-fetching rules

1. OpaVoting uses its App shell, URL/team selection, a custom API client and scoped WebSocket subscriptions; it does not use React Router.
2. Preserve authoritative state reconciliation and permission checks. Avoid refetching entire board/history state after every vote when the existing delta path suffices.
3. Use bounded/coalesced reads for directory and statistics observers; observers must not count toward board presence/quorum.
4. Add a caching/state library only for a measured need that the current helpers cannot reasonably handle.

## Global state rules

1. Avoid Redux by default.
2. Prefer local state, refs, and narrow shared helpers.
3. Only consider global state expansion when repeated cross-route synchronization becomes a measured problem.

## Surface-specific checks

| Surface | Watch for |
| --- | --- |
| Board and participant cards | Vote attribution, optimistic/server reconciliation, unnecessary full-roster rerenders and dense 20/40-person layouts. |
| History and title editing | Stable IDs, paginated/search results, contained editors, touch capture and tap/hold-drag behavior. |
| Account, Team Admin and Platform | Form containment, long names, reachable actions, focus return and permissions on every entry path. |
| Statistics and directories | Coalesced invalidations, stale-response protection, bounded queries and no false board participation. |

Use `apps/web/src/app/boardViewport.ts` and the shared responsive test matrix for phone layout decisions. Available visual-viewport geometry is published through CSS variables; do not add a second global resize context without evidence. Preserve desktop/tablet behavior when reorganizing mobile controls.

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
1. [Architecture](RnD_docs/ARCHITECTURE.md)
2. [Usage](RnD_docs/USAGE.md)
3. [Benchmark evidence](RnD_docs/PUBLIC_BENCHMARK_SUMMARY.md)
4. Historical benchmark and performance evidence when available

For any future significant frontend optimization pass, keep guidance concise and use measured historical evidence to validate improvements.

Run the nearest web tests/typecheck and the separate responsive suite for UI changes; use frontend performance tests for render-cost changes. Simulator-backed suites share resources and run serially. See [development verification](RnD_docs/DEVELOPMENT.md#choosing-verification).
