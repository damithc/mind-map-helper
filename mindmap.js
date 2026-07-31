/*!
 * mind-maps-helper v1.0.0
 * Simple indented-text syntax -> interactive-ready SVG mind maps.
 * PlantUML-style geometry with a refined palette.
 * No dependencies. MIT licensed.
 * https://github.com/damithc/mind-maps-helper
 */
(function (global) {
  'use strict';

  var VERSION = '1.0.0';

  // ---------------------------------------------------------------- constants

  var FONT_STACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, ' +
    '"Helvetica Neue", Arial, sans-serif';

  // Accent per top-level branch. Descendants inherit their branch colour.
  // Each entry is [light-theme, dark-theme].
  var PALETTE = [
    ['#3b6ea5', '#7fb0e0'],
    ['#b0563a', '#e09070'],
    ['#3f7d5c', '#79c39a'],
    ['#7a5c9e', '#b79ee0'],
    ['#a8842c', '#ddb85c'],
    ['#2f7f8f', '#6fc0cf'],
    ['#9c4f6c', '#d98ba8'],
    ['#56657a', '#9fb0c4']
  ];

  // Smallest a map may be shrunk to fit its column before it scrolls instead.
  // Below roughly this, the deepest labels stop being legible.
  var MIN_SCALE = 0.7;

  var DEFAULTS = {
    direction: 'balanced',   // 'balanced' | 'right' | 'left'
    maxNodeWidth: 190,       // px, before a label wraps to a second line
    columnGap: 46,           // horizontal space between depth columns
    padding: 12              // space around the whole drawing
  };

  // Per-depth box metrics.
  function metrics(depth) {
    if (depth === 0) return { size: 15, weight: '600', padX: 14, padY: 9, radius: 8 };
    if (depth === 1) return { size: 13.5, weight: '600', padX: 11, padY: 7, radius: 6 };
    return { size: 12.5, weight: '400', padX: 10, padY: 6, radius: 5 };
  }

  // Vertical space between siblings, keyed by the siblings' own depth.
  function siblingGap(depth) {
    if (depth === 1) return 18;
    if (depth === 2) return 10;
    return 7;
  }

  function strokeWidth(depth) {
    if (depth === 1) return 2.2;
    if (depth === 2) return 1.6;
    return 1.2;
  }

  // ------------------------------------------------------------------- errors

  function MindMapError(message, lineNo) {
    this.name = 'MindMapError';
    this.message = message;
    this.lineNo = lineNo;
  }
  MindMapError.prototype = Object.create(Error.prototype);
  MindMapError.prototype.constructor = MindMapError;

  // ------------------------------------------------------------------- parser

  /**
   * Turns indented text into a tree. Depth comes from leading whitespace;
   * an optional `-`, `*` or `+` bullet is stripped from each label.
   */
  function parse(text) {
    var rawLines = String(text).replace(/\r\n?/g, '\n').split('\n');
    var lines = [];

    for (var i = 0; i < rawLines.length; i++) {
      var expanded = rawLines[i].replace(/\t/g, '    ');
      if (!expanded.trim()) continue;

      var body = expanded.replace(/^[ ]*/, '');
      if (body.indexOf('//') === 0) continue;           // comment line

      var indent = expanded.length - body.length;
      if (/^[-*+]\s*$/.test(body)) {
        throw new MindMapError('This line has a bullet but no text after it.', i + 1);
      }
      var label = body.replace(/^[-*+][ ]+/, '').trim();
      lines.push({ indent: indent, label: label, lineNo: i + 1 });
    }

    if (!lines.length) {
      throw new MindMapError('The mind map is empty — add at least one line of text.');
    }

    // Treat the first line's indent as the baseline, so a whole map can be
    // indented inside the surrounding HTML without changing its meaning.
    var base = lines[0].indent;
    for (var j = 0; j < lines.length; j++) {
      lines[j].indent = Math.max(0, lines[j].indent - base);
    }

    var root = null;
    var stack = [];

    for (var k = 0; k < lines.length; k++) {
      var ln = lines[k];
      var node = { label: ln.label, children: [], lineNo: ln.lineNo };

      while (stack.length && ln.indent <= stack[stack.length - 1].indent) stack.pop();

      if (!stack.length) {
        if (root) {
          throw new MindMapError(
            'A mind map needs exactly one starting line, but "' + ln.label +
            '" is not indented under anything. Indent it under "' + root.label + '".',
            ln.lineNo
          );
        }
        root = node;
      } else {
        stack[stack.length - 1].node.children.push(node);
      }
      stack.push({ indent: ln.indent, node: node });
    }

    assignDepth(root, 0);
    return root;
  }

  function assignDepth(node, depth) {
    node.depth = depth;
    for (var i = 0; i < node.children.length; i++) assignDepth(node.children[i], depth + 1);
  }

  // -------------------------------------------------------------- measurement

  var measureCtx = null;
  function textWidth(str, font) {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
    measureCtx.font = font;
    return measureCtx.measureText(str).width;
  }

  function wrapLabel(label, font, maxWidth) {
    var words = label.split(/\s+/);
    var out = [];
    var current = '';
    for (var i = 0; i < words.length; i++) {
      var candidate = current ? current + ' ' + words[i] : words[i];
      if (current && textWidth(candidate, font) > maxWidth) {
        out.push(current);
        current = words[i];
      } else {
        current = candidate;
      }
    }
    if (current) out.push(current);
    return out;
  }

  /** Fills in .lines, .w and .h on every node. */
  function measureTree(node, opts) {
    var m = metrics(node.depth);
    var font = m.weight + ' ' + m.size + 'px ' + FONT_STACK;
    var lineHeight = m.size * 1.35;

    node.lines = wrapLabel(node.label, font, opts.maxNodeWidth);
    node.fontSize = m.size;
    node.fontWeight = m.weight;
    node.lineHeight = lineHeight;
    node.radius = m.radius;

    var widest = 0;
    for (var i = 0; i < node.lines.length; i++) {
      widest = Math.max(widest, textWidth(node.lines[i], font));
    }
    node.w = Math.ceil(widest + 2 * m.padX);
    node.h = Math.ceil(node.lines.length * lineHeight + 2 * m.padY);

    for (var j = 0; j < node.children.length; j++) measureTree(node.children[j], opts);
  }

  // ------------------------------------------------------------------- layout

  function leafCount(node) {
    if (!node.children.length) return 1;
    var n = 0;
    for (var i = 0; i < node.children.length; i++) n += leafCount(node.children[i]);
    return n;
  }

  /**
   * Splits top-level branches into a right group and a left group, preserving
   * the author's order and cutting where the two sides are closest in size.
   * Ties favour the right side, matching PlantUML's habit.
   */
  function splitBranches(branches) {
    var weights = branches.map(leafCount);
    var total = 0;
    for (var i = 0; i < weights.length; i++) total += weights[i];

    var best = branches.length;
    var bestDiff = Infinity;
    var run = 0;
    for (var k = 1; k <= branches.length; k++) {
      run += weights[k - 1];
      var diff = Math.abs(run - (total - run));
      if (diff <= bestDiff) { bestDiff = diff; best = k; }
    }
    return { right: branches.slice(0, best), left: branches.slice(best) };
  }

  // Pass 1: how much vertical room each subtree needs.
  function computeExtent(node) {
    var kids = node.children;
    if (!kids.length) {
      node.extent = node.h;
      node.childrenTotal = 0;
      return node.extent;
    }
    var gap = siblingGap(kids[0].depth);
    var total = 0;
    for (var i = 0; i < kids.length; i++) {
      total += computeExtent(kids[i]);
      if (i) total += gap;
    }
    node.childrenTotal = total;
    node.childGap = gap;
    node.extent = Math.max(total, node.h);
    return node.extent;
  }

  // Pass 2: place each subtree inside the band starting at `top`.
  // A parent lands at its band's centre, which is also the midpoint of its
  // children, because the children block is centred inside the same band.
  function placeVertical(node, top) {
    node.cy = top + node.extent / 2;
    var kids = node.children;
    if (!kids.length) return;
    var y = top + (node.extent - node.childrenTotal) / 2;
    for (var i = 0; i < kids.length; i++) {
      placeVertical(kids[i], y);
      y += kids[i].extent + node.childGap;
    }
  }

  function collectByDepth(node, bucket) {
    (bucket[node.depth] || (bucket[node.depth] = [])).push(node);
    for (var i = 0; i < node.children.length; i++) collectByDepth(node.children[i], bucket);
  }

  function columnWidths(branches) {
    var bucket = [];
    for (var i = 0; i < branches.length; i++) collectByDepth(branches[i], bucket);
    var widths = [];
    for (var d = 0; d < bucket.length; d++) {
      var max = 0;
      var nodes = bucket[d] || [];
      for (var j = 0; j < nodes.length; j++) max = Math.max(max, nodes[j].w);
      widths[d] = max;
    }
    return widths;
  }

  function eachNode(node, fn) {
    fn(node);
    for (var i = 0; i < node.children.length; i++) eachNode(node.children[i], fn);
  }

  /** Assigns .x (left edge), .cy, .side and .accentIndex to every node. */
  function layout(root, opts) {
    var branches = root.children;
    var groups;

    if (opts.direction === 'right') {
      groups = { right: branches.slice(), left: [] };
    } else if (opts.direction === 'left') {
      groups = { right: [], left: branches.slice() };
    } else {
      groups = splitBranches(branches);
    }

    // Branch accents follow the author's original order, not the split.
    for (var b = 0; b < branches.length; b++) {
      var idx = b % PALETTE.length;
      eachNode(branches[b], function (n) { n.accentIndex = idx; });
    }

    var sides = [
      { nodes: groups.right, sign: 1 },
      { nodes: groups.left, sign: -1 }
    ];

    // Vertical: stack each side's branches, then centre both against the root.
    var totals = sides.map(function (side) {
      var gap = siblingGap(1);
      var total = 0;
      for (var i = 0; i < side.nodes.length; i++) {
        total += computeExtent(side.nodes[i]);
        if (i) total += gap;
      }
      side.gap = gap;
      side.total = total;
      return total;
    });

    var height = Math.max(totals[0], totals[1], root.h);

    sides.forEach(function (side) {
      var y = (height - side.total) / 2;
      for (var i = 0; i < side.nodes.length; i++) {
        placeVertical(side.nodes[i], y);
        y += side.nodes[i].extent + side.gap;
      }
    });

    root.cy = height / 2;
    root.x = 0;
    root.side = 0;

    // Horizontal: one column per depth, per side. Boxes align on the edge
    // facing the root, which keeps the columns visually crisp.
    sides.forEach(function (side) {
      if (!side.nodes.length) return;
      var widths = columnWidths(side.nodes);
      var edge = side.sign > 0
        ? root.x + root.w + opts.columnGap
        : root.x - opts.columnGap;

      var edges = [];
      for (var d = 1; d < widths.length; d++) {
        edges[d] = edge;
        edge = side.sign > 0
          ? edge + widths[d] + opts.columnGap
          : edge - widths[d] - opts.columnGap;
      }

      for (var i = 0; i < side.nodes.length; i++) {
        eachNode(side.nodes[i], function (n) {
          n.side = side.sign;
          n.x = side.sign > 0 ? edges[n.depth] : edges[n.depth] - n.w;
        });
      }
    });

    // Normalise so the drawing starts at (padding, padding).
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    eachNode(root, function (n) {
      minX = Math.min(minX, n.x);
      maxX = Math.max(maxX, n.x + n.w);
      minY = Math.min(minY, n.cy - n.h / 2);
      maxY = Math.max(maxY, n.cy + n.h / 2);
    });

    var dx = opts.padding - minX;
    var dy = opts.padding - minY;
    eachNode(root, function (n) { n.x += dx; n.cy += dy; });

    return {
      width: Math.ceil(maxX - minX + 2 * opts.padding),
      height: Math.ceil(maxY - minY + 2 * opts.padding)
    };
  }

  // ------------------------------------------------------------------ drawing

  var SVG_NS = 'http://www.w3.org/2000/svg';

  function svgEl(name, attrs) {
    var el = document.createElementNS(SVG_NS, name);
    for (var key in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, key)) {
        el.setAttribute(key, attrs[key]);
      }
    }
    return el;
  }

  function edgePath(parent, child) {
    var fromRight = child.side > 0;
    var x1 = fromRight ? parent.x + parent.w : parent.x;
    var x2 = fromRight ? child.x : child.x + child.w;

    // Root sits between both sides, so it always exits from the facing edge.
    if (parent.depth === 0) x1 = fromRight ? parent.x + parent.w : parent.x;

    var y1 = parent.cy;
    var y2 = child.cy;
    var cx = (x2 - x1) * 0.5;
    return 'M' + x1 + ',' + y1 +
      ' C' + (x1 + cx) + ',' + y1 + ' ' + (x2 - cx) + ',' + y2 + ' ' + x2 + ',' + y2;
  }

  function drawEdges(node, group) {
    for (var i = 0; i < node.children.length; i++) {
      var child = node.children[i];
      var pair = PALETTE[child.accentIndex % PALETTE.length];
      var path = svgEl('path', {
        'class': 'mm-edge',
        d: edgePath(node, child),
        'stroke-width': strokeWidth(child.depth)
      });
      path.style.setProperty('--mm-a', pair[0]);
      path.style.setProperty('--mm-a-dark', pair[1]);
      group.appendChild(path);
      drawEdges(child, group);
    }
  }

  function drawNode(node, group) {
    var isRoot = node.depth === 0;
    var g = svgEl('g', {
      'class': 'mm-node ' + (isRoot ? 'mm-root' : 'mm-d' + Math.min(node.depth, 3))
    });

    if (!isRoot) {
      var pair = PALETTE[node.accentIndex % PALETTE.length];
      g.style.setProperty('--mm-a', pair[0]);
      g.style.setProperty('--mm-a-dark', pair[1]);
    }

    g.appendChild(svgEl('rect', {
      'class': 'mm-box',
      x: round(node.x),
      y: round(node.cy - node.h / 2),
      width: node.w,
      height: node.h,
      rx: node.radius,
      ry: node.radius
    }));

    var text = svgEl('text', {
      'class': 'mm-label',
      x: round(node.x + node.w / 2),
      'text-anchor': 'middle',
      'font-size': node.fontSize,
      'font-weight': node.fontWeight
    });

    var blockTop = node.cy - (node.lines.length * node.lineHeight) / 2;
    for (var i = 0; i < node.lines.length; i++) {
      var baseline = blockTop + i * node.lineHeight + node.lineHeight / 2 + node.fontSize * 0.35;
      var tspan = svgEl('tspan', {
        x: round(node.x + node.w / 2),
        y: round(baseline)
      });
      tspan.textContent = node.lines[i];
      text.appendChild(tspan);
    }

    g.appendChild(text);
    group.appendChild(g);

    for (var j = 0; j < node.children.length; j++) drawNode(node.children[j], group);
  }

  function round(n) { return Math.round(n * 100) / 100; }

  function buildSvg(root, size) {
    var svg = svgEl('svg', {
      'class': 'mm-svg',
      xmlns: SVG_NS,
      viewBox: '0 0 ' + size.width + ' ' + size.height,
      width: size.width,
      height: size.height,
      role: 'img',
      'aria-label': 'Mind map: ' + root.label
    });

    var title = svgEl('title', {});
    title.textContent = 'Mind map: ' + root.label;
    svg.appendChild(title);

    var edges = svgEl('g', { 'class': 'mm-edges' });
    drawEdges(root, edges);
    svg.appendChild(edges);

    var nodes = svgEl('g', { 'class': 'mm-nodes' });
    drawNode(root, nodes);
    svg.appendChild(nodes);

    // Scale down to fit a narrow column, but only so far — past MIN_SCALE the
    // labels stop being readable, so the container scrolls sideways instead.
    svg.style.maxWidth = size.width + 'px';
    svg.style.minWidth = Math.round(size.width * MIN_SCALE) + 'px';
    return svg;
  }

  /** A plain nested list, hidden visually, so screen readers get the content. */
  function buildOutline(root) {
    var wrap = document.createElement('div');
    wrap.className = 'mm-a11y';

    (function build(node, parent) {
      var ul = document.createElement('ul');
      for (var i = 0; i < node.children.length; i++) {
        var li = document.createElement('li');
        li.textContent = node.children[i].label;
        if (node.children[i].children.length) build(node.children[i], li);
        ul.appendChild(li);
      }
      parent.appendChild(ul);
    })(root, wrap);

    var heading = document.createElement('p');
    heading.textContent = root.label;
    wrap.insertBefore(heading, wrap.firstChild);
    return wrap;
  }

  function buildError(err, source) {
    var box = document.createElement('div');
    box.className = 'mm-error';

    var head = document.createElement('strong');
    head.textContent = 'Mind map could not be drawn';
    box.appendChild(head);

    var msg = document.createElement('p');
    msg.textContent = err && err.message ? err.message : String(err);
    box.appendChild(msg);

    if (err && err.lineNo) {
      var lines = String(source).replace(/\r\n?/g, '\n').split('\n');
      var offending = lines[err.lineNo - 1];
      if (offending !== undefined) {
        var pre = document.createElement('pre');
        pre.textContent = 'Line ' + err.lineNo + ': ' + offending;
        box.appendChild(pre);
      }
    }
    return box;
  }

  // ------------------------------------------------------------------ styling

  var STYLE_ID = 'mind-maps-helper-styles';

  var CSS = [
    '.mm-container{',
    '--mm-surface:#ffffff;--mm-text:#1f2933;--mm-muted:#5b6976;',
    '--mm-root-bg:#2c3e50;--mm-root-text:#ffffff;',
    'display:block;margin:1.25em 0;overflow-x:auto;',
    // min-width:0 stops the SVG's own min-width from blowing out a flex or
    // grid track on the host page.
    'min-width:0;max-width:100%;',
    'font-family:' + FONT_STACK + ';}',

    '.mm-svg{display:block;width:100%;height:auto;}',

    '.mm-node{--mm-accent:var(--mm-a);}',
    '.mm-box{fill:var(--mm-surface);stroke:var(--mm-accent);stroke-width:1.1;}',
    '.mm-label{fill:var(--mm-text);}',

    '.mm-d1 .mm-box{fill:var(--mm-surface);',
    'fill:color-mix(in srgb, var(--mm-accent) 11%, var(--mm-surface));',
    'stroke-width:1.6;}',
    '.mm-d2 .mm-box{fill:var(--mm-surface);',
    'fill:color-mix(in srgb, var(--mm-accent) 5%, var(--mm-surface));}',
    '.mm-d3 .mm-label{fill:var(--mm-muted);}',

    '.mm-root .mm-box{fill:var(--mm-root-bg);stroke:var(--mm-root-bg);stroke-width:1.5;}',
    '.mm-root .mm-label{fill:var(--mm-root-text);}',

    '.mm-edge{--mm-accent:var(--mm-a);fill:none;stroke:var(--mm-accent);',
    'stroke-linecap:round;opacity:.85;}',

    '.mm-a11y{position:absolute;width:1px;height:1px;overflow:hidden;',
    'clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;}',

    '.mm-error{margin:1.25em 0;padding:.85em 1em;border:1px solid #d98ba8;',
    'border-left-width:4px;border-radius:4px;background:#fdf3f6;color:#5a2033;',
    'font-family:' + FONT_STACK + ';font-size:.9rem;line-height:1.5;}',
    '.mm-error p{margin:.4em 0 0;}',
    '.mm-error pre{margin:.6em 0 0;padding:.5em .7em;background:#fff;',
    'border-radius:3px;overflow-x:auto;font-size:.85em;}',

    '@media (prefers-color-scheme: dark){',
    darkRules('.mm-container', '.mm-node,.mm-edge', '.mm-error', '.mm-error pre'),
    '}',

    // A host page with its own dark-mode toggle must win over the system
    // preference, in both directions — a light page on a dark-preferring
    // machine has to stay light, or the map clashes with everything round it.
    themeOverrides()
  ].join('');

  function lightVars() {
    return '--mm-surface:#ffffff;--mm-text:#1f2933;--mm-muted:#5b6976;' +
      '--mm-root-bg:#2c3e50;--mm-root-text:#ffffff;';
  }
  function darkVars() {
    return '--mm-surface:#1b2027;--mm-text:#e4e9ef;--mm-muted:#a7b3c0;' +
      '--mm-root-bg:#dfe6ee;--mm-root-text:#161b22;';
  }

  function darkRules(container, accent, error, errorPre) {
    return container + '{' + darkVars() + '}' +
      accent + '{--mm-accent:var(--mm-a-dark);}' +
      error + '{background:#2a1a20;color:#f3d7df;border-color:#9c4f6c;}' +
      errorPre + '{background:#161b22;}';
  }
  function lightRules(container, accent, error, errorPre) {
    return container + '{' + lightVars() + '}' +
      accent + '{--mm-accent:var(--mm-a);}' +
      error + '{background:#fdf3f6;color:#5a2033;border-color:#d98ba8;}' +
      errorPre + '{background:#fff;}';
  }

  /**
   * Attributes common dark-mode implementations put on <html>, plus a
   * data-theme escape hatch on the map itself.
   *   MarkBind      data-dark-mode="true|false"
   *   Bootstrap 5.3 data-bs-theme="dark|light"
   *   Docusaurus    data-theme="dark|light"
   *   Tailwind      class="dark"
   */
  function themeOverrides() {
    var DARK = ['[data-dark-mode="true"]', '[data-bs-theme="dark"]', '[data-theme="dark"]', '.dark'];
    var LIGHT = ['[data-dark-mode="false"]', '[data-bs-theme="light"]', '[data-theme="light"]'];

    function block(prefixes, rules) {
      function sel(suffix) {
        return prefixes.map(function (p) {
          return suffix === '.mm-container' ? p : p + ' ' + suffix;
        }).join(',');
      }
      return rules(sel('.mm-container'), sel('.mm-node') + ',' + sel('.mm-edge'),
                   sel('.mm-error'), sel('.mm-error pre'));
    }

    function hostPrefixes(hosts) {
      return hosts.map(function (h) { return ':root' + h + ' .mm-container'; });
    }
    // Doubling the class lifts specificity above the host selectors; emitting
    // these last settles any remaining tie in the author's favour.
    function ownPrefix(value) {
      return ['.mm-container.mm-container[data-theme="' + value + '"]'];
    }

    return block(hostPrefixes(LIGHT), lightRules) +
           block(hostPrefixes(DARK), darkRules) +
           block(ownPrefix('light'), lightRules) +
           block(ownPrefix('dark'), darkRules);
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  // ------------------------------------------------------------- element glue

  // Markdown toolchains wrap fenced blocks differently, and put the language
  // name in different places:
  //   markdown-it / kramdown  <pre><code class="language-mindmap">
  //   Rouge (GitHub Pages)    <div class="language-mindmap"><div class="highlight"><pre><code>
  //   Docusaurus / Prism      <pre class="language-mindmap"><code>
  //   MarkBind                drops the language, so authors add {.mindmap}
  //                           which lands as <code class="mindmap hljs">
  // Matching all of them, then resolving up to the outermost wrapper, is what
  // lets one recipe work across hosts.
  var SELECTOR = [
    'pre.mindmap',
    'div.mindmap',
    'code.mindmap',
    'code.language-mindmap',
    'code.lang-mindmap',
    '.language-mindmap',
    '.lang-mindmap'
  ].join(',');

  var WRAPPER_CLASS = /(^|\s)(highlight|highlighter-rouge|code-toolbar|language-[\w-]+|lang-[\w-]+)(\s|$)/;

  function classNameOf(el) {
    // SVG elements expose className as an object, not a string.
    return typeof el.className === 'string' ? el.className : '';
  }

  /**
   * Given a matched element, finds the outermost element that exists only to
   * wrap this code block. That whole wrapper is what gets replaced, so no
   * empty highlighter chrome is left behind.
   */
  function resolveTarget(el) {
    var target = el;
    if (target.tagName === 'CODE' && target.parentElement &&
        target.parentElement.tagName === 'PRE') {
      target = target.parentElement;
    }
    while (true) {
      var parent = target.parentElement;
      if (!parent || parent === document.body || parent.tagName !== 'DIV') break;
      if (parent.children.length !== 1) break;
      if (!WRAPPER_CLASS.test(classNameOf(parent))) break;
      target = parent;
    }
    return target;
  }

  /** The element whose text is the mind map source. */
  function resolveSource(el) {
    if (el.tagName === 'CODE') return el;
    return el.querySelector('code') || el;
  }

  /**
   * Reads data-* options. `els` is searched in order, so an attribute on the
   * <code> wins over the same attribute on its wrapping <pre>.
   */
  function readOptions(els) {
    function attr(name) {
      for (var i = 0; i < els.length; i++) {
        var value = els[i].getAttribute(name);
        if (value !== null && value !== '') return value;
      }
      return null;
    }

    var opts = {
      direction: DEFAULTS.direction,
      maxNodeWidth: DEFAULTS.maxNodeWidth,
      columnGap: DEFAULTS.columnGap,
      padding: DEFAULTS.padding
    };

    var dir = attr('data-direction');
    if (dir === 'right' || dir === 'left' || dir === 'balanced') opts.direction = dir;

    var width = parseFloat(attr('data-max-node-width'));
    if (width > 40) opts.maxNodeWidth = width;

    var gap = parseFloat(attr('data-column-gap'));
    if (gap >= 0) opts.columnGap = gap;

    var theme = attr('data-theme');
    if (theme === 'light' || theme === 'dark') opts.theme = theme;

    return opts;
  }

  /**
   * Renders one element in place. `el` may be the container itself or any
   * element inside a fenced Markdown block's wrapper — the whole wrapper is
   * replaced either way.
   */
  function render(el) {
    injectStyles();

    var target = resolveTarget(el);
    var sourceEl = resolveSource(el);

    // Options may sit on any element between the source and the wrapper;
    // innermost wins.
    var optionSources = [sourceEl];
    for (var node = sourceEl; node && node !== target; node = node.parentElement) {
      if (optionSources.indexOf(node) === -1) optionSources.push(node);
    }
    if (optionSources.indexOf(target) === -1) optionSources.push(target);

    var source = sourceEl.textContent;
    var container = document.createElement('div');
    container.className = 'mm-container';
    if (target.id) container.id = target.id;

    try {
      var opts = readOptions(optionSources);
      if (opts.theme) container.setAttribute('data-theme', opts.theme);
      var root = parse(source);
      measureTree(root, opts);
      var size = layout(root, opts);
      container.appendChild(buildSvg(root, size));
      container.appendChild(buildOutline(root));
    } catch (err) {
      if (!(err instanceof MindMapError)) throw err;
      container.appendChild(buildError(err, source));
    }

    container.setAttribute('data-mindmap-rendered', '');
    target.parentNode.replaceChild(container, target);
    centreOnRoot(container);
    return container;
  }

  /**
   * When a map is too wide for its column it scrolls. Start that scroll with
   * the centre node in view rather than at the far left edge.
   */
  function centreOnRoot(container) {
    var run = function () {
      var svg = container.querySelector('.mm-svg');
      if (!svg) return;
      var overflow = container.scrollWidth - container.clientWidth;
      if (overflow <= 0) return;

      var rootRect = svg.querySelector('.mm-root rect');
      if (!rootRect) return;

      var scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
      var centre = (parseFloat(rootRect.getAttribute('x')) +
                    parseFloat(rootRect.getAttribute('width')) / 2) * scale;

      container.scrollLeft = Math.max(0, Math.min(overflow, centre - container.clientWidth / 2));
    };
    if (global.requestAnimationFrame) global.requestAnimationFrame(run);
    else run();
  }

  function renderAll(root) {
    var scope = root || document;
    var found = scope.querySelectorAll(SELECTOR);

    // Several selectors can match nested parts of the same block (a
    // div.language-mindmap and the code inside it, say). Collapse them to one
    // entry per resolved wrapper, keeping the innermost match as the source.
    var targets = [];
    var sources = [];
    for (var i = 0; i < found.length; i++) {
      var el = found[i];
      if (!el.isConnected) continue;
      if (el.closest('[data-mindmap-rendered]')) continue;

      var target = resolveTarget(el);
      var seen = targets.indexOf(target);
      if (seen === -1) {
        targets.push(target);
        sources.push(el);
      } else if (sources[seen].contains(el)) {
        sources[seen] = el;
      }
    }

    var out = [];
    for (var j = 0; j < targets.length; j++) {
      if (!targets[j].isConnected) continue;
      out.push(render(sources[j]));
    }
    return out;
  }

  function boot() {
    // Wait for webfonts where possible: text measurement drives box sizes.
    if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
      document.fonts.ready.then(function () { renderAll(); }, function () { renderAll(); });
    } else {
      renderAll();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  global.MindMap = {
    version: VERSION,
    parse: parse,
    render: render,
    renderAll: renderAll,
    palette: PALETTE
  };
})(typeof window !== 'undefined' ? window : this);
