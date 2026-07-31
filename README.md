# Mind Maps Helper

Write an indented list, get a mind map. Readers can collapse and expand branches.
One script tag, no build step, no dependencies.

Made for authors of educational sites (course pages, lecture notes, handbooks) who write
their own HTML or Markdown but are not web developers.

**Live docs and examples: <https://damithc.github.io/mind-map-helper/>**

## Use it

Add the script once per page:

```html
<script src="https://damithc.github.io/mind-map-helper/mindmap.js"></script>
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
- Node text is plain text. No Markdown, no HTML.

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

## Options

Set these as attributes on the container.

| Attribute | Default | Effect |
|---|---|---|
| `data-direction` | `balanced` | `balanced` splits branches either side of the centre. `right` or `left` puts them all on one side. |
| `data-max-node-width` | `190` | Pixel width at which a label wraps to another line. |
| `data-column-gap` | `46` | Horizontal space between levels. |
| `data-collapse-level` | off | Show only this many levels at first; deeper nodes start folded. |
| `data-interactive` | `true` | `false` for a static diagram with no toggles. |
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

## Notes

- Output is SVG: sharp at any zoom, prints cleanly.
- Maps shrink to fit a narrow column, down to 70% of natural size, then scroll sideways
  instead of becoming illegible. A scrolled map starts centred on the root.
- Screen readers get the map as a nested list, and toggles report their expanded state.
- No dependencies and no network calls after the script loads.

## Development

There is no build step — `mindmap.js` is the shipped file.

Open `tests.html` in a browser. It runs 39 checks over the rendered DOM and prints a
pass/fail summary at the top of the page.

## Versioning

The URL above always serves the current release. Any future breaking change will ship
under a new path (`/v2/mindmap.js`) so existing pages keep working.

## Roadmap

Collapse/expand has shipped. Still to come, without changing the syntax:

- dragging nodes to reposition them
- richer node content than plain text

## Licence

MIT
