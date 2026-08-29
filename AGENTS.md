# Working on this repo

Notes for coding agents. Written to save you from rediscovering things the hard way;
`index.html` is the user guide and is the better place to learn what the library
*does*.

## What this is

A script that turns an indented list into an interactive SVG mind map. It is published as
a *provider site* on GitHub Pages: other people's pages link one script tag at
`https://se-education.org/mind-maps-helper/mindmap.js`, so any page using this library
loads whatever is on `main`.

**It is pre-release, and nothing external links it yet.** That is a fact about today, not
a design goal, and it cuts one way: structural work is cheap *now* and expensive later.
Do not decline a refactor on the grounds that it would risk downstream pages — there are
none. Once adoption starts, this paragraph is the thing to change, and the calculus with
it: a broken commit becomes a broken production deploy for everyone at once.

The audience is authors of educational sites — course pages, lecture notes, handbooks.
They write their own HTML or Markdown but are not web developers. That shapes most design
decisions: no build step for them, no npm, no configuration file, sensible defaults, and
error messages that say what to fix rather than what went wrong.

## Layout

| File | Role |
|---|---|
| `mindmap.js` | The entire library. The only shipped code. |
| `index.html` | The provider site — the user guide, live demos, the thing GitHub Pages serves. |
| `tests.html` | The fixtures — one map per case, each with an `id`, and a gallery to look at. |
| `tests.js` | The assertions over those fixtures. Loaded by `tests.html`; never shipped. |
| `README.md` | The GitHub landing page: what this is, a quick start, and a link to the guide. Not a second copy of the docs. |
| `.nojekyll` | Stops Pages running Jekyll over the site. Do not delete. |

The repo is `se-edu/mind-maps-helper`, and the local directory matches.

## How a render works

`render()` in *element glue* is the whole pipeline, and each stage hangs more fields on
the same node objects rather than producing a new shape. Reading it top to bottom is the
fastest way into the file.

1. **Resolve the target.** `resolveTarget` walks up from the matched element to the
   outermost wrapper that exists only to hold this code block — that whole wrapper is
   what gets replaced. `resolveSource` finds the element whose text is the map, and
   `readOptions` reads `data-*` off everything between the two, innermost winning.
2. **Parse.** `parse` turns indented lines into a tree of
   `{ label, children, parent, depth, lineNo, collapsed, fold, accent, mode }`. It knows
   nothing about inline markup yet; the label is still raw text here. `paintModes` then
   runs each node's `mode` down its subtree into `emphasis` — before measurement, because
   a highlighted label is a heavier one and weight decides how wide a box has to be.
3. **Measure.** `measureTree` parses each label into styled *runs*, resolves embedded
   HTML, wraps the runs into lines, and arrives at `node.w` / `node.h`. Nothing can be
   laid out before this, because every position downstream is derived from box sizes.
4. **Split sides.** `assignSides` decides which top-level branches go left and which go
   right, and gives each branch its accent — the author's where a node named one, and
   that name holds for the subtree under it.
5. **Lay out.** `layout` assigns `node.x` (left edge) and `node.cy` (vertical centre) in
   two passes: one computing each subtree's vertical extent, one placing each subtree
   inside the band that extent earned it.
6. **Draw and attach.** `buildSvg` builds the SVG, `paint` sets the viewBox, then
   interaction, images, embeds and controls attach.

The `state` object built at the end is the handle for everything afterwards, and is
parked on the container as `container.mindMap`. Folding and dragging take it as their
first argument. It is declared complete in one literal — `root`, `opts`, `sides`, `size`,
`svg`, `direction`, `container`, plus `bounds`, `controls`, `suppressClick` and
`animation` at their resting values — so what the handle carries can be read off the
declaration rather than gathered by grepping for the functions that assign to it.

Re-renders are partial, and which stages re-run is the thing to get right:

- **Folding** (`relayout`) re-runs `markVisible` and `layout` only, then animates from
  the old positions to the new ones. Sizes and sides are reused.
- **The shape switch** (`setDirection`) re-runs `assignSides` first, then `relayout`.
  It is the only thing that moves branches across the root, which is why a collapse
  cannot reshuffle the map under the reader.
- **Nothing re-measures** after the first pass except the embed and image callbacks,
  which do it precisely because their content arrived late.

An animation in flight lives in `state.animation` — `frame`, `nodes`, `bounds` — set and
cleared together, because a half-cleared set is what strands nodes part of the way to
where they were going. `targetBounds` reads a node's landing place through an accessor
rather than writing targets into the live coordinates and putting them back afterwards;
check 206 holds it to that.

### Node fields worth knowing

| Field | Set by | Meaning |
|---|---|---|
| `children` | parser | Every child, folded away or not. |
| `fold` | parser | The author's `[+]` / `[-]` marker, or `null`. Sets the opening fold state in `render`, beating `data-collapse-level`. |
| `accent` | parser | The palette slot the author named, or `null`. Overrides the branch accent from this node down — and on the centre node, where there is no branch accent, fills that one box with the bright half of the pair instead. |
| `mode` | parser | The author's `[dim]` / `[hot]` / `[normal]` marker, or `null`. |
| `emphasis` | `paintModes` | The mode in force here: `'dim'`, `'hot'` or `null`. Inherited from the nearest `mode` above, which `[normal]` clears. |
| `key` | `nodeKey` | A number, handed out on first use, for keying a node across a re-layout. |
| `kids` | `refreshVisibility` | The *visible* children — `[]` when the node is collapsed. |
| `w`, `h` | measurement | Box size. |
| `x`, `cy` | layout | Where the node belongs once the map settles. |
| `tx`, `tcy` | `relayout` | Where the current animation is taking it. |
| `ax`, `acy` | animation | Where it is drawn *this frame*. |
| `dx`, `dy` | dragging | One node's own manual offset. |
| `edx`, `edy` | `accumulateOffsets` | `dx`/`dy` plus every ancestor's, so dragging a node carries its subtree. |
| `vis` | `markVisible` | Whether some ancestor has folded it out of sight. |

`newNode` in the parser writes out every field a node leaves the parser with, resting
values included — that is the shape `MindMap.parse` hands back, and the only one anything
outside the file sees, so renaming one of those fields is a breaking change. Everything
below `emphasis` in the table is added later by the stage that owns it.

`children` versus `kids` is the pair that bites. The parser builds `children` and never
touches it again; layout walks `kids` and so only ever sees the unfolded tree. Walk the
wrong one and collapsed nodes either disappear from a count or get laid out invisibly.

## Code style in `mindmap.js`

One IIFE, `'use strict'`, no dependencies, no build step, no ES6. `var` and `function`
only — no `const`, `let`, arrow functions, template literals or classes. This is
deliberate: the file is served raw to unknown browsers on other people's sites, and there
is no transpiler in the path.

The file is divided by banner comments (`// ---- parser`, `// ---- layout`, and so on):
constants, errors, parser, inline markup, embedded HTML, measurement, layout, drawing,
interaction, styling, element glue. Put new code in the section it belongs to.

CSS lives in a string array near the bottom and is injected once, eagerly, at script load
(not at first render) so that `.mm-source` hides embed sources before first paint.

Comments explain *why*, not what. Match the surrounding density — the existing comments
carry real reasoning and are worth reading before changing nearby code.

## Changing anything

A feature is not done until all four of these are true:

1. `mindmap.js` implements it.
2. `tests.html` has checks for it, and the whole suite passes.
3. `index.html` documents it *and* demonstrates it with a live map.
4. Any new `data-` attribute is in the options table there.

Docs and demos are not optional extras here — the site is the product.

`index.html` is the only copy of the documentation. `README.md` is a landing page for
GitHub: a quick start, and links into the guide. Adding a feature does not mean writing it
up twice — put it in the guide, and leave the README alone unless the *quick start itself*
changed.

### Where a section goes in the guide

The guide is in two parts, split by a divider at `<h2 id="advanced">`. Above it is
everything an author needs, written for someone who edits Markdown or basic HTML and does
not program: no CSS, no JavaScript, no browser internals. Below it is the material that
assumes one of those — CSS custom properties and the palette, the JavaScript API, what a
copied HTML block loses, Content Security Policy.

The divider is a promise that a reader may stop there, so anything an ordinary author has
to know belongs above it, however technical the *reason* behind it is. Say what to do
above the line; explain the mechanism below it, and link down to it. Where a paragraph in
the everyday half really is only for a developer, mark it with
`<div class="note tech"><p><span class="tech-label">For developers</span>…` so it can be
skipped without being read first.

Both parts are listed in the contents at the top, in their own column each. Check 228
compares the two lists against the two halves of the page, so a new section in the wrong
column, or missing from the list, fails the suite.

Checks 196-201 enforce points 3-4 and the release version as far as text comparison can:
they fetch `mindmap.js`, `README.md` and `index.html` and compare the options
`readOptions` reads, the calls `MindMap` exports, the defaults a bare map ends up with,
and the four places the version is written. An option added to the script but not to the
guide's table fails the suite — and so does an option name reappearing in the README,
which is how the two copies drifted before.

## Running the tests

There is a preview server configured in `.claude/launch.json`. Start it with the preview
tools (`preview_start` with `{name: "mindmap-static"}`) rather than Bash, then open
`http://127.0.0.1:8099/tests.html`. `file://` will not do: some behaviour depends on a
real HTTP origin.

Without those tools it is the same server by hand, from the repo root:

```
python3 -m http.server 8099 --bind 127.0.0.1
```

There is nothing to install and nothing to build — the page loads `mindmap.js` straight
off disk.

Read the result out of `#results`, which reads `all N checks pass` or `N FAILING`, and
may add `, M skipped` for a lane that could not run at all. Three things will bite you:

- **Cache.** The static server serves stale HTML happily. Append a changing
  `?bust=<n>` to every navigation.
- **Asynchronous groups.** An async group opens with `var done = group('<name>');` and
  must call that `done` on every path out. Registering is what makes the suite wait for
  it, so a group that skips the call is named as a failure after 30 seconds rather than
  leaving the page on `running…`.
- **Waiting.** Never sleep for an animation. `settled(map, cb)` polls the state the
  animation clears, so it is exact and costs nothing under reduced motion; `until(ready,
  cb)` is the general form, and gives up after five seconds so a condition that never
  arrives fails its own check instead of hanging the suite. Check 203 holds `settled`
  to that contract.
- **Fixtures by id.** Every `.case` carries one, and assertions reach for it by name.
  Nothing indexes the `.case` list — inserting a fixture used to redirect a dozen later
  assertions at the wrong map, silently. Check 202 keeps every case named and the
  heading numbers in order.
- **Viewport.** The real-pointer lane hit tests with `elementFromPoint`, which needs a
  viewport with a size. A pane or headless tab reporting `innerWidth` of 0 skips those
  seven checks rather than failing them — give the tab a size (`resize_window`) to run
  them.

### The `matchMedia` shim in `tests.html`

The `<head>` overrides `window.matchMedia` to report `prefers-reduced-motion` whenever
the tab is hidden. Leave it alone. A backgrounded tab stops servicing
`requestAnimationFrame`, so every check that waits on an animated re-layout fails for
reasons unrelated to the code; reduced motion is the library's own switch for completing
a re-layout in one synchronous step. Without the shim, seven checks fail in any headless
or background tab.

If you see failures, confirm they are yours before changing code — `git stash`, re-run,
compare. That check has already saved one debugging session in this repo.

## Verifying interaction changes

Folding, dragging, the shape switch and embedded blocks all depend on real pointer
behaviour, and have broken in ways no DOM assertion caught. Drive real clicks and drags
through the browser tools rather than dispatching synthetic events.

One trap worth knowing: `setPointerCapture` **retargets the following `click` to the
capturing element**, so a listener on a descendant never hears it. That is why
`NO_DRAG_FROM` exists — presses on the fold badge, links, or controls inside an embedded
block take no capture at all.

The `realinput` case drives that contract as far as page script can: the press target
comes from `elementFromPoint`, capture is recorded as the library takes it, and the
click afterwards goes to the capturing element the way a browser sends it. It is a
rebuild of the contract, not the real thing — page script cannot make a trusted event —
so a change to folding or dragging still wants one pass of genuine input through the
browser tools before it ships.

When driving that input by hand, hide `#results` first. Once the run finishes it holds a
line per check, and a sticky block that tall covers the whole viewport — every real click
lands on it, and the map underneath never hears a thing.

## Releasing

Ask before deploying — pushing to `main` publishes the site, which is the user's call to
make, not yours. Nothing external consumes it yet, so a bad push is an embarrassment
rather than an outage.

Releases are one commit each, and history is linear — work on a branch, then
`git merge --ff-only`. Bump the version in three places before merging, since a deployed
build must not advertise itself as a dev build:

- the header comment of `mindmap.js`
- `var VERSION` in `mindmap.js`
- the `mindmap.js?v=1.5.0` cache-buster in `index.html` (this is what makes readers pick
  up a new release; the site prints `MindMap.version` as a badge so the deployed version
  is visible)

Check 201 compares all three, so a half-done bump fails the suite rather than shipping.

Commit messages follow the SE-EDU conventions: imperative mood, capitalised, no trailing
period, under ~50 characters. Release commits end with `; release vX.Y.Z` —
`Support blocks of page HTML inside nodes; release v1.5.0`. Use a body for anything
non-trivial, explaining what changed and why.

The URL always serves the current release. A future breaking change ships under a new
path (`/v2/mindmap.js`) so existing pages keep working — do not break the current one.

### Checking a deploy

```bash
gh api repos/se-edu/mind-maps-helper/pages/builds/latest --jq '{commit:.commit,status:.status,error:.error.message}'
```

Wait for `status: "built"`, and check the commit matches what you pushed — the API
sometimes reports the parent commit for a while.

Then confirm the deploy by fetching the live files, which *is* reachable:

```bash
curl -s https://se-education.org/mind-maps-helper/mindmap.js | head -3
```

The version badge on the landing page is written by script, so a fetch of the HTML will
not show it; check `VERSION` in the served `mindmap.js` instead, and ask the user to
confirm the badge in a real browser.

**The org and the domain are spelled differently.** The GitHub org is `se-edu`; the site
is served from the custom domain `se-education.org`, not `se-edu.github.io` — that host
redirects, but only for URLs that exist. `gh api` wants `se-edu`, `curl` wants
`se-education.org`, and swapping them gives a 404 that looks exactly like a missing
deploy or a blocked network.

## Design commitments

Worth knowing before proposing something that will be rejected:

- **No dependencies, ever**, and no network calls of the script's own after it loads.
  Author-referenced images and embedded blocks are fetched by the browser as usual.
- **Syntax the author already knows.** New syntax reuses Markdown shapes rather than
  inventing tokens. `![alt](#id)` for embedded HTML was chosen over `{{id}}` (collides
  with Nunjucks/MarkBind) and bare `#id`/`@id` (`#include` and `@Override` are plausible
  node labels in CS course material).
- **Conservative markup parsing.** Course material is full of things that only look like
  markup; `snake_case`, `2 * 3 * 4` and `[not a link]` must survive as typed.
- **Degrade, don't blank.** Bad input renders a short on-page message naming the problem
  and the line number.
- **Embedded HTML keeps the page's own styling.** Do not push map theme colours onto
  author content — a themed map fighting an author's card looks broken. Copies are
  sanitised (scripts, `id`s and `on*` attributes removed) because a `<template>`'s script
  has never run and its clone *would* execute on insertion.
