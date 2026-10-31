<!-- SPDX-FileCopyrightText: 2026 Atanas G. Rusev -->
<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Responsive UI verification

[Documentation index](../README.md) · [Project home](../../README.md)

<details>
<summary>Contents</summary>

- [Run](#run)
- [Viewport matrix](#viewport-matrix)
- [Layout rules](#layout-rules)
- [Mobile functional and performance coverage](#mobile-functional-and-performance-coverage)
- [Device acceptance](#device-acceptance)
- [Additional regression checkpoint — 2026-10-20](#additional-regression-checkpoint--2026-10-20)
- [Workspace identity coverage](#workspace-identity-coverage)
- [Self-hosted entry and mode differences](#self-hosted-entry-and-mode-differences)

</details>

Use this opt-in suite when changing UI, CSS, dialogs or pointer interactions. It is separate from regular browser tests, `test:full` and simulator suites.

## Run

```sh
./dev.sh test:e2e:responsive
```

Requires Node 22, installed project dependencies and Playwright Chromium. The command builds the app and starts two disposable localhost servers (3137 self-hosted, 3138 trial), each with temporary SQLite/config files. It never uses the deployed database or packaged simulator stack. Keep these ports free; run one instance at a time. Screenshots and geometry attachments are stored in the Playwright results; failed tests retain traces. Test credentials belong only to these disposable fixtures.

## Viewport matrix

All sizes are **CSS pixels**, not hardware pixels or exact phone models.

| Group | Width × height |
| --- | --- |
| Narrow and Android portrait | 320×568, 360×800, 384×832, 412×915 |
| iPhone-sized portrait | 375×667, 375×812, 390×844, 393×852, 414×896, 430×932 |
| Phone landscape | 568×320, 800×360, 667×375, 812×375, 832×384, 844×390, 852×393, 915×412, 896×414, 932×430 |
| Tablet | 768×1024, 1024×768 |
| Laptop / desktop | 1280×800, 1440×900, 1920×1080 |

Core journeys cover login, chooser, About, Account/deletion, idle/active/revealed voting, title editor and Team Admin People/Stats/Import-export. Additional journeys cover all Platform tabs, trial welcome/registration/policies/workspace statistics, timer/team settings/profile/switch-team/history search and resize/refresh gestures. Boundary sweeps check either side of 480, 640, 720, 960, 1080 and 1280px.

Assertions check page/dialog bounds, board/history and phone control ordering, header height, real interactions, console errors and continuous touch resize/persistence. Screenshots complement assertions: a page can have no overflow and still waste most of its usable area. Inspect representative phone, short landscape and desktop captures after visual changes. A mocked email-code response is used only to render registration repeatedly without exhausting signup throttles; workspace reporting uses real signup/API authorization.

## Layout rules

- `apps/web/src/app/boardViewport.ts` centralizes board layout decisions: phone layout at widths up to 640px, or up to 959px when height is at most 640px. Wider-than-tall phones use side history; portrait phones use bottom history. Tablets below 960px retain stacked history; desktop retains the participant ring and side history.
- A 56px phone header shows the team name and a **board-controls hamburger**. It opens a scrollable overlay containing the existing actions. Voting controls precede a bounded, scrollable participant grid in both phone orientations.
- Phone history starts collapsed to its 44px grip. Tap to toggle half-screen/collapsed, hold for a quarter-second then drag to an intermediate size, or use arrow keys. A quick swipe does not resize or toggle. Portrait and landscape sizes are remembered separately. Hidden history is removed from the accessibility tree; desktop preferences are independent.
- A single visual-viewport listener publishes available height and vertical offset as CSS variables. The phone board is viewport-anchored, and its controls overlay follows browser/keyboard panning. Board orientation remains stable through height-only keyboard/browser-bar changes; changing width permits rotation. Drafts are retained across rotation. No application-wide React resize context or layout library is added.
- Resize grips own their pointer gesture, use `touch-action: none`, and support arrow keys. Mobile taps tolerate up to eight CSS pixels of initial movement; SVG grips avoid dependence on arrow-font rendering. Ordinary scrolling remains available elsewhere. A deliberate downward touch on unused board header space offers release-to-refresh; controls and resize handles do not trigger it.

## Mobile functional and performance coverage

`mobileMatrix.ts` is the shared 10-portrait/10-landscape test matrix. Tests exercise typed issue titles, blank-title validation, Deal, vote/reveal, retained drafts after rotation, simulated keyboard-height reduction, history tap/continuous touch drag, timer settings and actionable menu forms. Team Admin People/Stats/Import-export tabs are exercised with 20 and 40 live members. Login/chooser, Account, trial registration/workspace reports and Platform tabs use the same phone matrix, with additional tablet/desktop cases.

The dense-board cases use one rendered touch browser and 19/39 authenticated API/WebSocket clients. All vote in each round; assertions check every member's status and the result. This measures a populated board, not 40 simultaneous rendered browsers or real-device capacity. The 40-member case adds 4× Chromium CPU throttling. Warm local board navigation timing, action latency and long-task samples are attached, with regression limits of 10 seconds per board load or complete round interaction and 1 second per main-thread long task. These generous failure limits detect stalls; they are not a phone-speed guarantee.

The keyboard test reduces the viewport while editing; headless Chromium does not provide a real Android/iOS software keyboard. Console/page errors, menu geometry and screenshots complement functional checks. Desktop/tablet cases remain in the same opt-in suite to catch regressions.

## Device acceptance

**2026-10-27 owner acceptance:** the owner tested mobile and accepted the current solution as good enough for now. This closes the current mobile milestone; it does not claim separate physical iOS/WebKit testing. Dated checkpoints below retain their original verification scope.

Emulation is not a physical phone. On the Galaxy S23 Ultra, check portrait/landscape, browser bars expanded/collapsed, keyboard open, enlarged text, menu scrolling, continuous history dragging and header refresh. On iOS, repeat with the actual browser. Record device findings separately from local test passes. See [Playwright emulation](https://playwright.dev/docs/emulation) and [pointer gesture handling](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/touch-action).


## Additional regression checkpoint — 2026-10-20

The full non-browser suite passed (56 API unit, 117 API integration, 94 web, five simulator unit tests and shell/deployment contracts). Separate packaged simulator runs passed seven performance checks, 17 distribution/smoke checks and all 198 strict 21-person viewport cases; these suites ran serially. Root typecheck also passed.

The regular packaged Chromium run passed 55 tests but failed the super-admin Demo activation scenario. Slow container-backed demo seeding reaches the client request timeout and a failed session refresh clears UI state. The test now waits explicitly for save completion and uses a normal Open click; it still fails, so this checkpoint is **not an all-green release verdict**. Physical-device and WebKit acceptance remain separate. Earlier responsive and hosted-trial results were not rerun in this additional pass.


### Demo/session follow-up — 2026-10-20

The packaged Demo activation failure above is now **locally fixed**. Atomic SQLite seeding removes per-write durable commit overhead. Temporary session-refresh failures preserve UI/drafts and retry; explicit HTTP 401 still clears authentication. The complete packaged self-hosted suite now passes **61 tests**, including the formerly failing demo case and five new network/server/timeout/rejection/initial-restoration scenarios. Its 226 mode-specific skips are not passes. A separate hosted-trial server passes all five trial checks. API integration (118), API unit (56), frontend (94), frontend performance (9), production build and root typecheck also pass. The earlier responsive and heavy simulator matrices were not rerun for this focused fix; physical-device acceptance remains outstanding.


### Samsung-sized browser-chrome and tap regressions

`mobile-chrome.spec.ts` adds portrait/landscape checks at 412×915, 384×832 and 360×800, using touch and DPR 3. It models a document taller than the visible viewport and pans the document before checking header/menu reachability. CDP touch taps include a two-pixel movement and must toggle history exactly once; visible SVG grips are checked too. A separate mocked VisualViewport scroll/offset test checks browser/keyboard pan and recovery. These are targeted browser-behavior reproductions, not a claim to have operated a physical Galaxy S23 Ultra.

Verification: all 109 responsive Chromium cases passed in a single full run, plus 94 frontend tests, nine frontend-performance tests, production build and typecheck. The header-pan and two-pixel touch regressions failed before the fix and passed afterward in both 412×915 and 915×412. Physical S23 Ultra/browser acceptance remains separate.

### History controls and overlay regression coverage

`history-controls.spec.ts` checks desktop/tablet circular arrow toggles and restored sizes, phone tap versus hold-and-drag, compact control-panel geometry, accessible icon-only close, nested blurred layers, and actionable versus informational borders for member/admin/super-admin rendering. Desktop dragging remains immediate; its separate arrow button does not occupy the middle of the drag grip. Phone dragging requires a 250ms hold and more than eight pixels of movement. Intentional touch-drag tests include the hold; jitter tests deliberately do not.

The phone controls panel fits its contents, bounded by the visible viewport. Its X shares the title area. Main controls and submenus have distinct borders with a lightly blurred backdrop; keyboard traversal stays inside the active controls/submenu. Status chips and disabled controls keep neutral styling; enabled controls use a thin blue outline, while destructive actions and borderless inline title pencils retain their established treatment.

### Verification checkpoint — 2026-10-20 history/menu follow-up

- Complete opt-in responsive run: **120 passed**, including 20/40-person phone journeys and the throttled 40-person performance budget.
- Full packaged browser run: **60 passed**, with one old notification test still trying to click the covered mobile trigger. Updated that case to tap the mobile backdrop; its complete ten-width journey passed against the disposable native server. Desktop still tests trigger toggling.
- Hosted-trial browser checks: **5 passed**. Simulator layout: **17 passed**; strict viewport matrix: **198 passed**.
- Full non-browser verification, root typecheck, production build and **9 frontend performance tests** passed.
- Simulator performance: **7 passed** after correcting startup heartbeat timing. Periodic heartbeats must run while the 950-bot scenario is connecting, not only after startup completes; otherwise the simulator visibility lease can expire during a 400-person voting burst. State-read failures now include HTTP status/body and still fail immediately without retries.

The earlier failing runs are retained in the work history; the notification correction was a targeted rerun, not a second complete packaged run. Physical Galaxy S23 Ultra and iOS acceptance remains separate from local Chromium verification.


## Workspace identity coverage

`workspace-context.spec.ts` covers the full phone portrait/landscape matrix, the 640×900 transition, tablets and desktop (26 sizes). Each uses short, medium, long multiword and unbroken 80-character workspace names, with collapsed/expanded board and Team Admin labels, touch/click and keyboard disclosure, rename controls and starting a vote. Additional cases cover absent labels in ordinary self-hosting and collaborator workspace switching/live renames. The disposable trial fixture raises signup rate limits to permit isolated accounts per viewport; production limits are unchanged.

## Self-hosted entry and mode differences

`self-hosted.spec.ts` covers the built self-hosted login at 320×568, 360×800, 390×844, 412×915, 800×360, 768×1024, 1280×800 and 1920×1080. It checks aligned actions with access requests on/off and email/manual onboarding, real admin and password sign-in, account/workspace separation, About, reset/setup inputs and long configured company attribution. Delivery variants mock bootstrap/reset responses explicitly; no real SMTP delivery is claimed. Existing full-suite journeys cover the remaining chooser, board/history, Team Admin and Platform screens, plus trial-mode regressions. Tests use temporary local data, not an operator's installation.

Trial mode is a deployment setting, not a hostname test: an ordinary company deployment receives the same compact entry on localhost or HTTPS. Trial branding, signup, consent and workspace controls remain specific to trial configuration.

2026-10-28 local checkpoint: full responsive run passed 158 cases; the additional long-company-attribution case passed separately, as did two regular trial login/chooser regressions. Frontend tests (94), workspace typechecks and the production build passed. Representative login, chooser, Account, board and administration screenshots were inspected. Physical-device and external SMTP verification remain separate.

The self-hosted entry suite also verifies the default author/repository/documentation/license credit on both `/` and `/admin` across its eight entry sizes, including keyboard focus, 44px link targets and overflow. Configured company attribution coexists with project credit.

2026-10-31 attribution follow-up: all 12 focused self-hosted Chromium tests, 94 frontend tests, frontend typecheck and production build passed. Phone and desktop credit layouts were visually inspected. The full matrix above was not repeated for this small footer-only change.
