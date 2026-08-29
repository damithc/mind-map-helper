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

To get it on every page instead of pasting it into each one, use whatever your generator
offers for site-wide scripts. In MarkBind that is `externalScripts` in `site.json`:

```json
{
  "externalScripts": [
    "https://se-education.org/mind-maps-helper/mindmap.js"
  ]
}
```

In Jekyll, add the `<script>` tag to the layout your pages use.

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
- `[+]` before the text makes that branch start folded; `[-]` makes it start open.
- `[blue]` in front of the text paints that branch — or the centre node — in an accent
  you name.
- `[dim]` fades a branch into the background; `[hot]` picks one out.
- Node text understands a little inline Markdown (below). No HTML.

Bad input produces a short on-page message naming the problem and the line, rather than
a blank space.

## Collapsing and expanding

Any node with children gets a small **&minus;** button on its outer edge. Clicking the
node or the button folds that branch away and leaves a **+**; clicking again restores it.
Keyboard works too: <kbd>Tab</kbd> to a node, then <kbd>Enter</kbd> or <kbd>Space</kbd>.

The map animates as it re-flows, and honours `prefers-reduced-motion`.

Big maps read better opening as an overview — `data-collapse-level="1"` shows the centre
and its branches, with everything deeper one click away.

To fold one branch rather than a whole level, put `[+]` in front of its text. It is the
sign the fold badge itself shows, so what you write is the state the reader opens on.

```
Testing
  Unit Testing
    Stubs
  [+] Integration Testing
    Top-down
    Bottom-up
```

`[-]` does the opposite: it holds a branch open where `data-collapse-level` would have
folded it, so a map can open as an overview and still show the one branch the page is
about.

A marker goes after any bullet — `- [+] Design` — and never reaches the label. It sets
only the state the map *opens* in; the reader folds and unfolds as usual afterwards. A
node with nothing under it has nothing to fold, so there the marker is simply dropped.

Like a bullet, a marker needs a space after it, which leaves `[+](notes.html)` a link.
Write `\[+]` for a label that really does begin with one. Markers are part of how the
list is built rather than markup inside a label, so both the marker and its escape work
whatever `data-markup` says.

`data-interactive="false"` turns it all off for a plain static diagram.

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
`http`, `https`, `mailto` and relative paths are accepted. `javascript:` is refused, and
so is a `javascript:` spelled to look like something else — the scheme is read the way a
browser reads it, not off the raw text.

**Images.** An image sits inline with the text, so one alone on a line becomes the node's
whole content. Unsized images fit within 120x90; `![logo](logo.png =80x60)` sets it
yourself, and `=80x` fixes the width alone. Maps draw immediately and re-flow when images
report their size.

Note that a drawn map is not a standalone file. Its colours and fonts come from a
stylesheet the script puts in the page, so an `<svg>` copied out on its own renders
unstyled; and an image referenced by URL is a link rather than part of the SVG, so a
saved copy loses the picture too. A `data:` URI carries the picture with it.

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

Blocks lay out within 260px unless told otherwise. `data-embed-max-width` sets that width
for a whole map; `![](#id =240x160)` fixes one block's size exactly.

Height is capped too: a block you have not sized gets at most 400px of it. Nothing is lost
when the content is taller — the block keeps all of it and scrolls inside the node. Sizing
the block yourself replaces that cap with the height you asked for, so
`![](#id =240x600)` lays out 600px tall, and scrolls only if the content outgrows even
that.

The words in front of the `#` are what names the block for a screen reader, which meets
the map as an outline rather than a drawing: `![Grade breakdown](#marks-box)` reads as
"Grade breakdown". Leave them out and the block's own opening words stand in, shortened —
so write them whenever those first words would not say what the node is.

Inside such a node, clicking the block no longer folds the branch — the **&minus;** button
does that — because the block is there to be read and used. Links in it work normally, and
the node can still be dragged by any other part of it. `id`s are dropped from the copy, so
no id ends up duplicated, and so is anything that would start running when the copy is
inserted: `<script>`, `<iframe>`, `<object>`, `<embed>`, `<base>`, `<meta>`, `<link>`,
`<style>`, `on*` handlers, and `javascript:` URLs however they are spelled. Inside a `<template>`
none of those has ever been live, so the copy is where they would start.

Two caveats: an embedded block leans on your own stylesheet as well as the script's, so it
is one more thing that does not travel with an `<svg>` copied out of the page; and the
element must already exist when the map is *first* drawn.

That second one does not forgive lateness. A map naming an id that is not there yet fails
with an on-page message, and the message takes the place of the map's source — so there is
nothing left for a later `MindMap.renderAll()` to find, and no way for it to retry. If a
script builds the block, keep the map out of the automatic pass that runs on load and draw
it yourself once the block is in the page:

```html
<pre id="later" class="mindmap-pending">
Grades
  ![Breakdown](#marks-box)
</pre>
<script>
  buildMarksBox();                     // creates #marks-box
  var el = document.getElementById('later');
  el.className = 'mindmap';            // now the script will match it
  MindMap.render(el);
</script>
```

What the copy is, is a copy. Anything wired up with `addEventListener` stays behind on
the original, so a button whose handler was attached that way does nothing in the node.
A delegated listener can still catch it, but only where it is bound to an ancestor of the
*copy* — a shared page container the map itself sits inside. Bound to an ancestor of the
original block instead, it never hears the copy, which lives over in the map. Dropping the
`id`s costs whatever depended on them: a `<label for>`, an `aria-labelledby`, a link to
`#somewhere` inside the block, a rule written as `#id .thing`.
Blocks meant to be read — a table, a card, a worked example — copy cleanly; a working
widget is worth checking in the node.

## Colouring the map

Branches take an accent from a built-in palette, in the order they appear. To choose one
yourself, name it in front of the text, the way you would a fold marker:

```
Software Engineering
  [blue] Requirements
    Elicitation
  [green] Design
  [pink] Testing
```

The eight names are the palette's own accents — `blue`, `orange`, `green`, `purple`,
`gold`, `teal`, `pink` and `slate` — so a named branch still has a light and a dark
version and follows the page's theme like any other. `red`, `grey` and `gray` are
accepted as well, for orange and slate.

A name holds from that node down. On a top-level branch it colours the branch; further in
it recolours the rest of that branch, which is how one sub-topic gets picked out from the
rest.

Naming one branch leaves the others as they were: the unnamed ones still follow branch
order, so adding a colour recolours what you named and nothing else.

The centre node takes a name too, and wears it differently. It is the one box drawn as a
solid slab rather than a tint of an accent, so it fills with the *bright* half of the pair
— the counterpart of the colour the same name gives a branch — and writes in an ink dark
enough to read on it, which for every colour in the built-in palette is a near-black:

```
[gold] Software Engineering
  Requirements
  Design
  Testing
```

That is the same colour in both themes, unlike the default centre node, which flips from
dark to light with the page. The bright halves are the ones picked to carry a dark page,
and they carry a light one as well, so there is nothing to flip to; the ink on them stays
put for the same reason.

A name there is about that one box. It takes no slot from the branches, so the first
branch is still the first accent, and it overrides `--mm-root-bg` and `--mm-root-text`
for that map — an author naming a colour outranks the theme underneath it.

Colour markers follow the fold markers' rules, and the two stack in either order —
`[+] [green] Design` and `[green] [+] Design` are the same node. Both go after any bullet,
both need a space after them, both are read whatever `data-markup` says, and `\[green]`
gives you a label that really does begin with one. A bracketed word that names no accent
is left alone, so `[TODO] Revise this` stays as typed.

## Dimming and highlighting

Two more markers change how loudly a node is drawn. `[dim]` fades a node and everything
under it into the background. `[hot]` picks one out: a deeper fill in the branch's own
accent, a thicker outline, a bolder label, and a heavier curve arriving at it.

```
Syllabus
  [dim] Requirements
    Elicitation
  [hot] Design
    Architecture
  Testing
```

The ordinary look sits between the two, so a dimmed topic reads as one you are past and a
highlighted one as the one to look at, with everything else left alone. A lecture map can
dim what the course has covered, highlight what today is about, and leave what is still
ahead exactly as it was.

Emphasis holds from that node down, the way a colour does. `[normal]` takes a node and its
own descendants back out of it, which is how one sub-topic stays at full strength inside a
chapter you have dimmed:

```
Requirements
  [dim] Elicitation
    Interviews
    [normal] Prototyping
      Throwaway prototypes
  Specification
```

Highlighting deepens the branch's own accent rather than bringing a colour of its own, so
a picked-out node still says which branch it belongs to, still has a dark version, and
still follows a replaced palette. A marker on the centre node is dropped, unlike a colour
name there: emphasis is a node standing out from the ones around it, and the centre node
has nothing to stand out from.

Dimming fades the box and the curve into it, and moves the label to the muted text colour
rather than fading it as well. A dimmed topic is one the reader is past, not one they
cannot read, so it stays comfortably above the contrast a reader needs; links and code
inside a dimmed node keep their own colours for the same reason.

Both carry into print — which topics are behind and which are today's is often the reason
a map is on paper at all. And because emphasis says something about the material rather
than merely decorating it, the hidden outline behind the map names it too, once where it
changes, so it reaches a screen reader.

Emphasis markers follow the other markers' rules, and all three stack in any order —
`[+] [green] [dim] Design` and `[dim] [green] [+] Design` are the same node. They go after
any bullet, need a space after them, are read whatever `data-markup` says, and `\[dim]`
gives you a label that really does begin with one. A bracketed word that names no emphasis
is left alone, so `[Draft] Notes` stays as typed.

## Choosing the shape

Balanced is compact and reads as a figure; one-sided reads top-to-bottom like an indented
outline. To avoid making the decision for every reader, each map carries a small switch in
its top corner that fades in on hover. The two shapes share one outline, because they are
alternatives rather than two separate settings: picking one drops the other.

`data-direction` still sets the shape the map *opens* in — the switch just offers the other
one. Folded branches survive a switch; drags are cleared, since a nudged position means
nothing in the other arrangement. `data-controls="false"` pins one shape and hides the
switch.

By keyboard the switch is a single tab stop, and the arrow keys move between the two
shapes, the way a set of radio buttons works. The switch does not print: a printed map
keeps whichever shape the reader left it in, which is the one they chose to print.

## Moving nodes

Readers can drag any node somewhere clearer. Its subtree comes along and the connecting
curves follow; the rest of the map stays put. The centre node is the exception — it moves
on its own, since taking its branches along would just slide the whole map. Drag past the
edge and the canvas grows to fit on release. A click is still a click — only a real drag
moves a node, so folding keeps working. With a keyboard, focus any node with children (or
the centre) and use the arrow keys (<kbd>Shift</kbd> for fine steps). On a touch screen a
straight-up-or-down swipe scrolls the page as usual, even starting on a node; anything
else drags.

Moves last for the visit only; a reload restores the computed layout.
`MindMap.resetPositions(el)` does the same on demand, and `data-draggable="false"` keeps
folding while stopping moves.

## Credit link

A small caption sits under the bottom right of every map, reading *« Made with Mind Maps
Helper »* and linking back to this site. A reader who runs into a mind map on somebody's
course page has no other way of finding out what drew it.

The caption is chrome rather than part of the drawing, so a wide map scrolls underneath it
rather than carrying it off the screen, and the link opens in a new tab rather than taking
a reader off the page they were reading. Where there is a mouse it rests faint and comes up
to full strength while the pointer is inside the map; on a touch screen, where no pointer
can come inside, it stays legible. It does not print, since a link nobody can click is dead
ink. `data-credit="false"` drops it from the screen as well.

## Options

Set these as attributes on the container.

| Attribute | Default | Effect |
|---|---|---|
| `data-direction` | `balanced` | Shape the map *opens* in; readers can switch. `balanced` splits branches either side of the centre, `right`/`left` puts them all on one side. |
| `data-max-node-width` | `190` | Pixel width at which a label wraps to another line. |
| `data-column-gap` | `46` | Horizontal space between levels. |
| `data-embed-max-width` | `260` | Pixel width within which an embedded block of your own HTML lays itself out. |
| `data-collapse-level` | off | Show only this many levels at first; deeper nodes start folded. A node's own `[+]`/`[-]` wins over it. |
| `data-markup` | `true` | `false` takes the label text literally — no bold, links or images. Bullets, comments and fold markers are structure, and stay. |
| `data-controls` | `true` | `false` hides the shape switch and pins your chosen shape. |
| `data-draggable` | `true` | `false` keeps folding but stops readers moving nodes. |
| `data-interactive` | `true` | `false` for a plain static diagram — no folding, no dragging. |
| `data-theme` | follows the page | `light` or `dark`, to pin one map regardless of the site's theme. |
| `data-credit` | `true` | `false` drops the small caption linking back to this project from under the map. |

**Where they may sit.** An option is read from the code block itself, from its `<pre>`, or
from any highlighter wrapper the script already recognises around it — innermost wins. A
wrapper of your own making is *not* consulted, so this does nothing:

````markdown
<div data-direction="right">      <!-- ignored: not a wrapper the script knows -->

```mindmap
Software Engineering
  Requirements
```

</div>
````

With a fenced block, whether an option reaches the map depends on where your generator
puts the attribute, and generators differ. **When you need options, write the map as
`<pre class="mindmap" ...>`** — that form carries them in every generator and is worth the
few extra characters:

```html
<pre class="mindmap" data-direction="right" data-collapse-level="1">
Software Engineering
  Requirements
  Design
</pre>
```

If you would rather keep the fence, both common generators can carry options, because both
put them somewhere the script reads:

| Generator | Write this | The attribute lands on |
|---|---|---|
| MarkBind | ```` ```mindmap {.mindmap data-direction="right"} ```` | the `<code>`, beside the class |
| Jekyll / kramdown | `{: data-direction="right"}` on the line after the fence | the highlighter wrapper |

Either way, confirm it before trusting it: inspect the drawn map in your browser and check
the attribute really is on the `<code>`, the `<pre>`, or the wrapper the script replaced.

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

A colour named on the centre line wins over the two `--mm-root-*` values for that map.

Branch accents cycle through a built-in palette in the order the top-level branches
appear. Override `window.MindMap.palette` (an array of `[light, dark]` pairs, written as
hex, `rgb()`, `hsl()` or a colour word) to change them. The names an author writes point
at positions in that array rather than at colour values, so a replaced palette recolours
the named branches — and a named centre node — along with the rest. The centre node's
ink is picked from the colour underneath it, so a dark colour in that half gets white
text rather than a label lost in its own box. A colour only the page can work out, such
as `var(--brand)`, is one the ink cannot read, and that centre node falls back to dark
text.

The palette is read as each map is drawn, so it has to be set **before the maps it should
affect are rendered**. Maps already on the page are drawn once the document has been
parsed, which any inline script placed after the library will beat:

```html
<script src="https://se-education.org/mind-maps-helper/mindmap.js"></script>
<script>
  window.MindMap.palette = [
    ['#2f6f4f', '#7fc3a1'],   /* first branch:  light, dark */
    ['#8a3033', '#e29a9c'],   /* second branch              */
    ['#2563a8', '#8fbdf0']    /* third branch               */
  ];
</script>
```

Setting it later recolours nothing by itself — re-render the maps that should pick it up.

## JavaScript API

Nothing here is needed for an ordinary page: maps already in the HTML are drawn on load.
Use `render()` or `renderAll()` for maps added *after* that. The rest inspect, control or
refresh maps that have already been drawn.

| Call | Effect | Returns |
|---|---|---|
| `MindMap.renderAll()` | Draws every unrendered map on the page. Runs automatically on load. | Array of the containers drawn |
| `MindMap.renderAll(el)` | Same, but only inside `el`. | Array of the containers drawn |
| `MindMap.render(el)` | Draws one map. | The container that replaced it |
| `MindMap.parse(text)` | Parses the source without drawing anything. | The root node |
| `MindMap.collapseAll(el)` | Folds every branch of one drawn map. | `true`, or `false` if `el` holds no map |
| `MindMap.expandAll(el)` | Unfolds every branch of one drawn map. | `true`, or `false` if `el` holds no map |
| `MindMap.resetPositions(el)` | Undoes every drag, restoring the computed layout. | `true`, or `false` if `el` holds no map |
| `MindMap.setDirection(el, dir)` | Switches shape: `balanced`, `right` or `left`. | `true` if the shape changed |
| `MindMap.refresh(el)` | Re-measures one map's embedded blocks, after their content changed. | `true` if anything was re-measured |

**What `el` may be.** For the two drawing calls it is the map's *source* — the
`<pre class="mindmap">`, or any element inside a fenced block's wrapper; `renderAll(el)`
instead takes an element to search *within*. For every other call it is a map that has
already been drawn: the container returned by `render()`, any element inside it, or an
ancestor holding exactly one map. Hand one of those calls a source that was never drawn,
or an element with no map in it, and it changes nothing and returns `false`.

**The booleans mean "something changed", not "it worked".** `setDirection()` returns
`false` for a direction the map is already in, and equally for a misspelt one — `'right'`,
`'left'` and `'balanced'` are the only values accepted, and anything else is ignored rather
than reported. `refresh()` returns `false` when a map has no embedded blocks to re-measure.

**Drawing a map yourself:**

```html
<pre id="late" class="mindmap-pending">
Topics
  Requirements
  Design
</pre>
<script>
  var el = document.getElementById('late');
  el.className = 'mindmap';     // the script only matches maps it recognises
  MindMap.render(el);
</script>
```

`render()` replaces the element it is given, so hold on to what it returns if you mean to
control the map afterwards. It does not throw on a bad map: it returns a container showing
an on-page error instead. `parse()` is the one call that does throw — a `MindMapError`,
carrying the offending line number — since it has no page to put a message on.

## Troubleshooting

**The map is still showing as indented text.** The script did not run, or it did not
recognise the block. Check the console for a failed request to `mindmap.js`, then check
that the block really carries one of the forms under *Containers recognised* — with a
fenced block, that the language name survived your generator.

**A Content Security Policy can block the drawing without blocking the script.** Two
separate directives matter:

- `script-src` has to allow `https://se-education.org`, or the script never loads at all.
- `style-src` has to allow the stylesheet the script injects. The map's CSS is added as a
  `<style>` element at load, which counts as an inline style, so a policy without
  `'unsafe-inline'` blocks it. The map still *draws* — the SVG is built either way — but it
  arrives with none of its styling: wrong colours, no sideways scrolling, and the outline
  meant for screen readers showing up as visible text. The browser names the offending
  directive in the console, along with a hash you could allow instead; the hash changes
  with every release, and there is no nonce hook today, so `'unsafe-inline'` is in practice
  the only stable answer.

Node positions are set through the CSSOM rather than written into markup, and CSP does not
police that, so those survive a strict policy — it is the stylesheet that goes. Loosen only
the directive you need, and only for the pages carrying maps.

**"This node asks for the page element with id …".** The map names a block that was not in
the page when it was drawn — a typo in the id, or an element some other script adds later.
See the caveats under *Blocks of your own HTML*.

**Anything else.** A map that fails for a reason you cannot act on says so on the page and
puts the details in the browser console; a map that fails for a reason you *can* act on
names the problem and the line number on the page itself.

## Notes

- Output is SVG: sharp at any zoom, prints cleanly. The drawing is all that prints —
  the shape switch and the credit caption are for a reader who can click, so they stay
  off the page.
- Maps shrink to fit a narrow column, down to 70% of natural size, then scroll sideways
  instead of becoming illegible. A scrolled map starts centred on the root.
- Screen readers get the map as a nested list, and toggles report their expanded state.
- No dependencies, and the script makes no calls of its own once it has loaded. Images
  you point at by URL, and whatever is inside an embedded block, are fetched by the
  browser as usual.
- Nesting goes 100 levels deep. Past that a map reports the offending line rather than
  running out of stack part-way through drawing.

## Development

There is no build step and nothing to install — `mindmap.js` is the shipped file, and
`tests.html` loads it straight off disk, along with the assertions in `tests.js`.

The suite needs a real HTTP origin, so serve the repo rather than opening the file:

```
python3 -m http.server 8099 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8099/tests.html`. It renders every case, checks the resulting
DOM, and prints a summary at the top of the page — `all N checks pass`, or `N FAILING`,
plus `, M skipped` for a lane that could not run at all — over a line per check. Two
things to know:

- The page hit tests with `elementFromPoint`, so a tab with no viewport size skips the
  real-pointer checks rather than failing them. Give the window a size to run them.
- Folding and dragging depend on real pointer behaviour, and have broken in ways no DOM
  assertion caught. After changing either, click and drag a map yourself as well —
  a fold, a drag, a drag that starts on the fold badge, and the shape switch.

The cases below double as a visual gallery: each one states what it should look like, so
a rendering regression that still passes its assertions is visible.

## Versioning

The script URL carries no version, and always serves the current release. That cuts both
ways, and it is worth being plain about: your pages pick up new releases automatically, as
they ship, without you changing anything and without a chance to try them first.

What you get in exchange is that existing maps keep working. Any future breaking change
ships under a new path (`/v2/mindmap.js`) rather than landing on this one, so a page that
never touches its script tag keeps the behaviour it was built against.

## Roadmap

Collapse/expand, dragging, inline formatting, embedded HTML blocks, branch colours and
emphasis have shipped. Possible next steps:

- saving a reader's folds and moves across visits

## Licence

MIT
