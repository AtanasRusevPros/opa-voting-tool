<!-- SPDX-FileCopyrightText: 2026 Atanas G. Rusev -->
<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Responsive UI verification

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
| Phone landscape / reduced available height | 800×360, 915×412 |
| Tablet | 768×1024, 1024×768 |
| Laptop / desktop | 1280×800, 1440×900, 1920×1080 |

Core journeys cover login, chooser, About, Account/deletion, idle/active/revealed voting, title editor and Team Admin People/Stats/Import-export. Additional journeys cover all Platform tabs, trial welcome/registration/policies/workspace statistics, timer/team settings/profile/switch-team/history search and resize/refresh gestures. Boundary sweeps check either side of 480, 640, 720, 960, 1080 and 1280px.

Assertions check page/dialog bounds, board/history and phone control ordering, header height, real interactions, console errors and continuous touch resize/persistence. Screenshots complement assertions: a page can have no overflow and still waste most of its usable area. Inspect representative phone, short landscape and desktop captures after visual changes. A mocked email-code response is used only to render registration repeatedly without exhausting signup throttles; workspace reporting uses real signup/API authorization.

## Layout rules

- CSS chooses presentation; the existing board viewport state and ResizeObserver measure the geometry that actually needs JavaScript. There is no application-wide resize context or new layout dependency.
- At 960px and above, history stays beside the board. Below it, history stacks beneath the board with a resizable grip.
- At 640px and below, the compact header keeps all actions; voting controls precede a scrollable participant grid. Large-team cards cannot push controls indefinitely down the page.
- At short landscape heights (500px or less), document scrolling keeps the board reachable. Dialog/menu contents scroll within the available dynamic viewport.
- Resize grips own their pointer gesture, use `touch-action: none`, and support arrow keys. Ordinary scrolling remains available elsewhere. A deliberate downward touch on unused board header space offers release-to-refresh; controls and resize handles do not trigger it.

## Device acceptance

Emulation is not a physical phone. On the Galaxy S23 Ultra, check portrait/landscape, browser bars expanded/collapsed, keyboard open, enlarged text, menu scrolling, continuous history dragging and header refresh. On iOS, repeat with the actual browser. Record device findings separately from local test passes. See [Playwright emulation](https://playwright.dev/docs/emulation) and [pointer gesture handling](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/touch-action).
