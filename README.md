# Mind Maps Helper

Write an indented list, get a mind map. Labels take a little Markdown; readers can reshape
the map, fold branches away and drag nodes around. One script tag, no build step, no
dependencies.

Made for authors of educational sites (course pages, lecture notes, handbooks) who write
their own HTML or Markdown but are not web developers.

**Live docs and examples: <https://se-education.org/mind-maps-helper/>**

## Use it

Add the script once per page:

```html
<script src="https://se-education.org/mind-maps-helper/mindmap.js"></script>
```

Then write a map wherever you want one:

```html
<pre class="mindmap">
Software Engineering
  Requirements
    Elicitation
    Specification
  Design
    Architecture
    Design Patterns
  Testing
    Unit Testing
    Integration Testing
</pre>
```

In a Markdown source file, the `<pre class="mindmap">` form above still works and needs
nothing from your site generator. Fenced blocks work too, but the exact spelling depends
on the generator, because each one records the language differently:

| Generator | Write this |
|---|---|
| Jekyll / GitHub Pages, MkDocs, Docusaurus, most others | ```` ```mindmap ```` |
| MarkBind | ```` ```mindmap {.mindmap} ```` |

MarkBind hands fenced blocks to its syntax highlighter and drops the language name from
the output, leaving nothing for the script to find; the `{.mindmap}` suffix adds a class
that survives. Verified against MarkBind 7.1.

Avoid `<div class="mindmap">` in Markdown — processors reinterpret the indented lines
inside it.

## Syntax

Indentation is the whole syntax. A line indented further than the one above it becomes
its child.

- The first line is the centre of the map. There can be only one such line.
- Any consistent indent step works — 2 spaces, 4 spaces, or tabs.
- A leading `-`, `*` or `+` followed by a space is treated as a bullet and dropped.
- Blank lines are ignored.
- A line starting with `//` is a comment.
- Node text understands a little inline Markdown (below). No HTML.

Bad input produces a short on-page message naming the problem and the line, rather than
a blank space.

## Collapsing and expanding

Any node with children gets a small **&minus;** button on its outer edge. Clicking the
node or the button folds that branch away and leaves a **+**; clicking again restores it.
Keyboard works too: <kbd>Tab</kbd> to a node, then <kbd>Enter</kbd> or <kbd>Space</kbd>.

The map animates as it re-flows, and honours `prefers-reduced-motion`.

Big maps read better opening as an overview — `data-collapse-level="1"` shows the centre
and its branches, with everything deeper one click away. `data-interactive="false"`
turns it all off for a plain static diagram.

## Formatting inside a node

Labels understand a small slice of inline Markdown. Everything else is shown as typed.

| Write | Get |
|---|---|
| `**text**` / `__text__` | Bold |
| `*text*` / `_text_` | Italic |
| `` `text` `` | Monospace on a tinted chip |
| `~~text~~` | Struck through |
| `[text](url)` | A link |
| `![alt](url)` | An image |
| `\n` | A line break where you want it |
| `\*` | A literal marker character |

The rules are conservative, because course material is full of characters that only look
like markup: `snake_case_name`, `2 * 3 * 4`, `unclosed **bold` and `[not a link]` all stay
exactly as typed. `data-markup="false"` turns the whole thing off.

**Links.** Clicking the link text follows it; clicking elsewhere on the node folds the
branch; dragging does neither. Links also appear in the outline screen readers use. Only
`http`, `https`, `mailto` and relative paths are accepted — `javascript:` is refused.

**Images.** An image sits inline with the text, so one alone on a line becomes the node's
whole content. Unsized images fit within 120x90; `![logo](logo.png =80x60)` sets it
yourself, and `=80x` fixes the width alone. Maps draw immediately and re-flow when images
report their size.

Note that an image referenced by URL is the one thing that stops a map being a
self-contained SVG — saved elsewhere, the picture is a link rather than part of the file.
Use a `data:` URI if that matters.

## Blocks of your own HTML

For content that will not fit in a line — a marks table, a worked example, a styled
callout — write the block on the page, give it an `id`, and address it the way you would
address a picture. A `#` means "the element with this id" rather than a file:

```
![Grade breakdown](#marks-box)
```

The block is *copied* into the node, so the original stays put and one block can serve
several maps. It keeps your classes and your CSS, so it looks in the node exactly as it
looks on the page.

Keep the source out of the way with a `<template>`, which the browser never renders, or
with `class="mm-source"`, which this script hides:

```html
<template id="tip-box">
  <div class="tip"><b>Watch out</b> — coupling is not dependency.</div>
</template>

<div id="marks-box" class="mm-source"> ... </div>
```

A block meant to be visible on the page needs neither — point at it and it appears in
both places.

Blocks lay out within 260px unless told otherwise: `data-embed-max-width` sets that for a
map, `![](#id =240x160)` fixes one block exactly.

Inside such a node, clicking the block no longer folds the branch — the **&minus;** button
does that — because the block is there to be read and used. Links in it work normally, and
the node can still be dragged by any other part of it. `id`s are dropped from the copy, so
no id ends up duplicated, and so is anything that would start running when the copy is
inserted: `<script>`, `<iframe>`, `<object>`, `<embed>`, `<base>`, `<meta>`, `<link>`,
`on*` handlers and `javascript:` URLs. Inside a `<template>` none of those has ever been
live, so the copy is where they would start.

Two caveats: an embedded block leans on the page's stylesheet, so the map is no longer a
self-contained SVG; and the id must be in the page's HTML, since a block added later by
another script is not there when the map is drawn (call `MindMap.renderAll()` afterwards
in that case).

## Choosing the shape

Balanced is compact and reads as a figure; one-sided reads top-to-bottom like an indented
outline. Rather than deciding for every reader, each map carries a small switch in its top
corner that fades in on hover. The two shapes share one outline, because they are
alternatives rather than two separate settings: picking one drops the other.

`data-direction` still sets the shape the map *opens* in — the switch just offers the other
one. Folded branches survive a switch; drags are cleared, since a nudged position means
nothing in the other arrangement. `data-controls="false"` pins one shape and hides the
switch.

By keyboard the switch is a single tab stop, and the arrow keys move between the two
shapes, the way a set of radio buttons works.

## Moving nodes

Readers can drag any node somewhere clearer. Its subtree comes along and the connecting
curves follow; the rest of the map stays put. The centre node is the exception — it moves
on its own, since taking its branches along would just slide the whole map. Drag past the
edge and the canvas grows to fit on release. A click is still a click — only a real drag
moves a node, so folding keeps working. With a keyboard, focus any node with children (or
the centre) and use the arrow keys (<kbd>Shift</kbd> for fine steps).

Moves last for the visit only; a reload restores the computed layout.
`MindMap.resetPositions(el)` does the same on demand, and `data-draggable="false"` keeps
folding while stopping moves.

## Options

Set these as attributes on the container.

| Attribute | Default | Effect |
|---|---|---|
| `data-direction` | `balanced` | Shape the map *opens* in; readers can switch. `balanced` splits branches either side of the centre, `right`/`left` puts them all on one side. |
| `data-max-node-width` | `190` | Pixel width at which a label wraps to another line. |
| `data-column-gap` | `46` | Horizontal space between levels. |
| `data-embed-max-width` | `260` | Pixel width within which an embedded block of your own HTML lays itself out. |
| `data-collapse-level` | off | Show only this many levels at first; deeper nodes start folded. |
| `data-markup` | `true` | `false` takes every character literally — no bold, links or images. |
| `data-controls` | `true` | `false` hides the shape switch and pins your chosen shape. |
| `data-draggable` | `true` | `false` keeps folding but stops readers moving nodes. |
| `data-interactive` | `true` | `false` for a plain static diagram — no folding, no dragging. |
| `data-theme` | follows the page | `light` or `dark`, to pin one map regardless of the site's theme. |

## Containers recognised

- `<pre class="mindmap">` — works everywhere, accepts options
- `<div class="mindmap">` — fine in hand-written HTML, avoid in Markdown
- fenced code blocks, in the output shapes produced by markdown-it, kramdown, Rouge,
  Prism and highlight.js

## Styling

Colours are CSS custom properties, so a few lines of CSS match the map to your site.

Light and dark are both handled. If your site has its own dark-mode toggle, the map
follows it (MarkBind, Bootstrap 5.3, Docusaurus and Tailwind are detected); otherwise it
follows the reader's system setting. `data-theme` on a map overrides both.

```css
.mm-container {
  --mm-surface:   #ffffff;  /* box fill           */
  --mm-text:      #1f2933;  /* label text         */
  --mm-muted:     #5b6976;  /* deepest-level text */
  --mm-root-bg:   #2c3e50;  /* centre node fill   */
  --mm-root-text: #ffffff;  /* centre node text   */
  --mm-code-bg:   #eceff2;  /* code chip fill     */
  --mm-code-text: #8a3033;  /* code text          */
  --mm-link:      #2563a8;  /* link text          */
}
```

Branch accents cycle through a built-in palette in the order the top-level branches
appear. Override `window.MindMap.palette` (an array of `[light, dark]` pairs) to change
them.

## JavaScript API

Only needed for maps added after page load.

| Call | Effect |
|---|---|
| `MindMap.renderAll()` | Draws every unrendered map on the page. Runs automatically on load. |
| `MindMap.renderAll(el)` | Same, scoped to `el`. |
| `MindMap.render(el)` | Draws one element. |
| `MindMap.parse(text)` | Returns the parsed tree without drawing. |
| `MindMap.collapseAll(el)` | Folds every branch of one rendered map. |
| `MindMap.expandAll(el)` | Unfolds every branch of one rendered map. |
| `MindMap.resetPositions(el)` | Undoes every drag, restoring the computed layout. |
| `MindMap.setDirection(el, dir)` | Switches shape: `balanced`, `right` or `left`. |
| `MindMap.refresh(el)` | Re-measures one map's embedded blocks, after their content changed. |

## Notes

- Output is SVG: sharp at any zoom, prints cleanly.
- Maps shrink to fit a narrow column, down to 70% of natural size, then scroll sideways
  instead of becoming illegible. A scrolled map starts centred on the root.
- Screen readers get the map as a nested list, and toggles report their expanded state.
- No dependencies and no network calls after the script loads.

## Development

There is no build step — `mindmap.js` is the shipped file.

Open `tests.html` in a browser. It runs 98 checks over the rendered DOM and prints a
pass/fail summary at the top of the page.

## Versioning

The URL above always serves the current release. Any future breaking change will ship
under a new path (`/v2/mindmap.js`) so existing pages keep working.

## Roadmap

Collapse/expand, dragging, inline formatting and embedded HTML blocks have shipped.
Possible next steps:

- per-node colour overrides
- saving a reader's folds and moves across visits

## Licence

MIT
