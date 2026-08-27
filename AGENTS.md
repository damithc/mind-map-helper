# Working on this repo

Notes for coding agents. Written to save you from rediscovering things the hard way;
`README.md` is the user-facing documentation and is the better place to learn what the
library *does*.

## What this is

A script that turns an indented list into an interactive SVG mind map. It is published as
a *provider site* on GitHub Pages: other people's pages link one script tag at
`https://se-education.org/mind-maps-helper/mindmap.js`, so **every page on the internet
that uses this library loads whatever is on `main`.** A broken commit is a broken
production deploy for everyone at once.

The audience is authors of educational sites — course pages, lecture notes, handbooks.
They write their own HTML or Markdown but are not web developers. That shapes most design
decisions: no build step for them, no npm, no configuration file, sensible defaults, and
error messages that say what to fix rather than what went wrong.

## Layout

| File | Role |
|---|---|
| `mindmap.js` | The entire library. The only shipped code. |
| `index.html` | The provider site — docs, live demos, the thing GitHub Pages serves. |
| `tests.html` | The test suite. Open in a browser; it prints a pass/fail line at the top. |
| `README.md` | GitHub-facing docs, roughly mirroring `index.html`. |
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
   `{ label, children, parent, depth, lineNo, collapsed, fold, accent }`. It knows nothing
   about inline markup yet; the label is still raw text here.
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

The `state` object built at the end — `root`, `opts`, `sides`, `size`, `svg`,
`direction`, `container` — is the handle for everything afterwards, and is parked on the
container as `container.mindMap`. Folding and dragging take it as their first argument.

Re-renders are partial, and which stages re-run is the thing to get right:

- **Folding** (`relayout`) re-runs `markVisible` and `layout` only, then animates from
  the old positions to the new ones. Sizes and sides are reused.
- **The shape switch** (`setDirection`) re-runs `assignSides` first, then `relayout`.
  It is the only thing that moves branches across the root, which is why a collapse
  cannot reshuffle the map under the reader.
- **Nothing re-measures** after the first pass except the embed and image callbacks,
  which do it precisely because their content arrived late.

### Node fields worth knowing

| Field | Set by | Meaning |
|---|---|---|
| `children` | parser | Every child, folded away or not. |
| `fold` | parser | The author's `[+]` / `[-]` marker, or `null`. Sets the opening fold state in `render`, beating `data-collapse-level`. |
| `accent` | parser | The palette slot the author named, or `null`. Overrides the branch accent from this node down. |
| `kids` | `refreshVisibility` | The *visible* children — `[]` when the node is collapsed. |
| `w`, `h` | measurement | Box size. |
| `x`, `cy` | layout | Where the node belongs once the map settles. |
| `tx`, `tcy` | `relayout` | Where the current animation is taking it. |
| `ax`, `acy` | animation | Where it is drawn *this frame*. |
| `dx`, `dy` | dragging | One node's own manual offset. |
| `edx`, `edy` | `accumulateOffsets` | `dx`/`dy` plus every ancestor's, so dragging a node carries its subtree. |
| `vis` | `markVisible` | Whether some ancestor has folded it out of sight. |

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

A feature is not done until all five of these are true:

1. `mindmap.js` implements it.
2. `tests.html` has checks for it, and the whole suite passes.
3. `README.md` documents it.
4. `index.html` documents it *and* demonstrates it with a live map.
5. Any new `data-` attribute is in the options table of both docs.

Docs and demos are not optional extras here — the site is the product.

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

Read the result out of `#results`, which reads `all N checks pass` or `N FAILING`.
Two things will bite you:

- **Cache.** The static server serves stale HTML happily. Append a changing
  `?bust=<n>` to every navigation.
- **`pending`.** Near the top of the script block, `var pending = 7;` counts the
  asynchronous case groups. Add an async group and you must increment it, or the suite
  finishes early and silently skips your checks.

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

## Releasing

Ask before deploying. Every push to `main` is live for every downstream site immediately.

Releases are one commit each, and history is linear — work on a branch, then
`git merge --ff-only`. Bump the version in three places before merging, since a deployed
build must not advertise itself as a dev build:

- the header comment of `mindmap.js`
- `var VERSION` in `mindmap.js`
- the `mindmap.js?v=1.5.0` cache-buster in `index.html` (this is what makes readers pick
  up a new release; the site prints `MindMap.version` as a badge so the deployed version
  is visible)

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
