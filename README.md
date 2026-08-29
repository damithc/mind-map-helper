# Mind Maps Helper

Write an indented list, get an interactive mind map. Labels take a little Markdown; readers
can reshape the map, fold branches away and drag nodes around. One script tag, no build
step, no dependencies.

Made for authors of educational sites (course pages, lecture notes, handbooks) who write
their own HTML or Markdown but are not web developers.

**The guide, with live examples, is the site itself:
<https://se-education.org/mind-maps-helper/>** — everything is documented there, on one
page. What follows is a quick look and enough to get a first map on your page.

## Quick start

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

That form works in hand-written HTML and in Markdown alike. Fenced blocks work too, but
how you write them depends on your site generator —
[Writing maps in Markdown](https://se-education.org/mind-maps-helper/#markdown) has the
spelling for each.

## The syntax, in brief

Indentation is the whole syntax: the first line is the centre of the map, and a line
indented further than the one above it becomes its child.

- A leading `-`, `*` or `+` followed by a space is treated as a bullet and dropped.
- Blank lines are ignored, and a line starting with `//` is a comment.
- `[+]` or `[-]` before the text starts that branch folded or open.
- `[blue]` paints a branch in a colour you name; `[dim]` fades one into the background and
  `[hot]` picks one out.
- Labels take inline Markdown: `**bold**`, `*italic*`, `` `code` ``, `~~struck~~`,
  `[text](url)`, `![alt](url)`, and `\n` for a line break.
- `![alt](#some-id)` copies a block of your own HTML from the page into the node, for
  content that will not fit in a line.

Bad input renders a short on-page message naming the problem and the line number, rather
than a blank space.

## Going further

Readers can fold branches away, drag nodes somewhere clearer, and switch between the
balanced and one-sided shapes, and attributes on the container adjust all of that. The
guide covers the rest:

- [Options](https://se-education.org/mind-maps-helper/#options) — every attribute, with
  its default
- [Blocks of your own HTML](https://se-education.org/mind-maps-helper/#embeds) inside nodes
- [Matching the map to your site](https://se-education.org/mind-maps-helper/#styling) with
  CSS, and replacing the branch colours
- [Calling it from JavaScript](https://se-education.org/mind-maps-helper/#api)

The guide is split in two: everything an author needs comes first, and the parts that
assume CSS or JavaScript sit behind a marked
[Advanced](https://se-education.org/mind-maps-helper/#advanced) divider.

## Versioning

The script URL carries no version and always serves the current release, so pages pick up
new releases as they ship. In exchange, existing maps keep working: any future breaking
change ships under a new path (`/v2/mindmap.js`) rather than landing on this one.

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

The cases below the summary double as a visual gallery: each one states what it should
look like, so a rendering regression that still passes its assertions is visible.

`AGENTS.md` has the rest — how a render works, what lives where, and the conventions this
repo follows.

## Roadmap

Collapse/expand, dragging, inline formatting, embedded HTML blocks, branch colours and
emphasis have shipped. Possible next steps:

- saving a reader's folds and moves across visits

## Licence

MIT
