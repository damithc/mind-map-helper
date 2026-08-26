/*!
 * mind-maps-helper v1.6.0
 * Simple indented-text syntax -> interactive-ready SVG mind maps.
 * PlantUML-style geometry with a refined palette.
 * No dependencies. MIT licensed.
 * https://github.com/se-edu/mind-maps-helper
 */
(function (global) {
  'use strict';

  var VERSION = '1.6.0';

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

  function isArray(v) {
    return Object.prototype.toString.call(v) === '[object Array]';
  }

  /**
   * The palette in force. Read through here rather than closed over, because
   * the documented way to change the accents is to assign a new array to
   * `MindMap.palette`, and an assignment cannot reach a captured variable.
   * Anything that is not a usable palette falls back to the built-in one, the
   * same way an unusable data-* value falls back to its default.
   */
  function palette() {
    var custom = global.MindMap && global.MindMap.palette;
    if (!isArray(custom) || !custom.length) return PALETTE;
    for (var i = 0; i < custom.length; i++) {
      var pair = custom[i];
      if (!isArray(pair) || pair.length < 2 ||
          typeof pair[0] !== 'string' || typeof pair[1] !== 'string') return PALETTE;
    }
    return custom;
  }

  var TOGGLE_R = 7.5;

  // The largest length an author can ask for, in any of the places one can be
  // asked for. Well past any map a reader can take in, and short of the point
  // where the numbers stop describing something a browser will draw.
  var MAX_LENGTH = 4000;

  // Every stage of a render walks the tree recursively, so nesting depth is
  // call-stack depth. Far past anything readable as a mind map, and far short
  // of where a browser gives up, so a runaway file gets a message with a line
  // number instead of a RangeError from somewhere in the middle of a render.
  var MAX_DEPTH = 100;

  // Smallest a map may be shrunk to fit its column before it scrolls instead.
  // Below roughly this, the deepest labels stop being legible.
  var MIN_SCALE = 0.7;

  var DEFAULTS = {
    direction: 'balanced',   // 'balanced' | 'right' | 'left'
    maxNodeWidth: 190,       // px, before a label wraps to a second line
    columnGap: 46,           // horizontal space between depth columns
    padding: 12,             // space around the whole drawing
    embedMaxWidth: 260       // px, widest an embedded block may lay itself out
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

      if (stack.length > MAX_DEPTH) {
        throw new MindMapError(
          'This line is nested ' + stack.length + ' levels deep, and a mind map ' +
          'can go ' + MAX_DEPTH + ' deep. Check the indenting — a line indented ' +
          'further than the one above it starts a new level.',
          ln.lineNo
        );
      }

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

  function assignDepth(node, depth, parent) {
    node.depth = depth;
    node.parent = parent || null;
    node.collapsed = false;
    for (var i = 0; i < node.children.length; i++) {
      assignDepth(node.children[i], depth + 1, node);
    }
  }

  // ------------------------------------------------------- inline markup

  var MONO_STACK = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';

  var IMAGE_MAX_W = 120;
  var IMAGE_MAX_H = 90;
  // Space held for an image whose size is not yet known, so the map can be
  // drawn immediately and settle once the file arrives.
  var IMAGE_PLACEHOLDER_W = 64;
  var IMAGE_PLACEHOLDER_H = 48;

  /**
   * Only schemes that cannot execute script. Relative paths and anchors have
   * no scheme at all and are always fine.
   */
  function safeUrl(raw, allowData) {
    var url = String(raw || '').trim();
    if (!url) return null;
    var scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url);
    if (!scheme) return url;                       // relative, absolute path, or #anchor
    var name = scheme[1].toLowerCase();
    if (name === 'http' || name === 'https' || name === 'mailto') return url;
    if (allowData && name === 'data' && /^data:image\//i.test(url)) return url;
    return null;
  }

  function textRun(text, style) {
    return {
      type: 'text', text: text,
      bold: !!style.bold, italic: !!style.italic,
      code: !!style.code, strike: !!style.strike,
      href: style.href || null
    };
  }

  function extend(style, changes) {
    var out = {};
    for (var k in style) if (Object.prototype.hasOwnProperty.call(style, k)) out[k] = style[k];
    for (var c in changes) if (Object.prototype.hasOwnProperty.call(changes, c)) out[c] = changes[c];
    return out;
  }

  /** Underscores only delimit emphasis at word boundaries, so snake_case survives. */
  function wordChar(ch) { return !!ch && /[\w]/.test(ch); }

  /**
   * Finds the closing run of `marker` starting at `from`, skipping escapes and
   * code spans. Returns -1 when the marker is never closed, in which case the
   * opener is treated as literal text.
   */
  function findClose(text, marker, from, underscore) {
    for (var i = from; i <= text.length - marker.length; i++) {
      if (text.charAt(i) === '\\') { i++; continue; }
      if (text.charAt(i) === '`') {
        var end = text.indexOf('`', i + 1);
        if (end === -1) return -1;
        i = end;
        continue;
      }
      if (text.substr(i, marker.length) !== marker) continue;
      if (/\s/.test(text.charAt(i - 1))) continue;              // no space before closer
      if (underscore && wordChar(text.charAt(i + marker.length))) continue;
      return i;
    }
    return -1;
  }

  /** Matching bracket that tolerates nesting, e.g. [see [note]](x). */
  function matchBracket(text, start, open, close) {
    var depth = 0;
    for (var i = start; i < text.length; i++) {
      var ch = text.charAt(i);
      if (ch === '\\') { i++; continue; }
      if (ch === open) depth++;
      else if (ch === close) { depth--; if (!depth) return i; }
    }
    return -1;
  }

  // `![](#notes-box)` — the "file" is an element already on the page.
  var ELEMENT_REF = /^#([A-Za-z][\w:.-]*)$/;

  function parseSizeHint(target) {
    var m = /^(.*?)\s+=(\d*)x(\d*)$/.exec(target);
    if (!m) return { url: target.trim(), w: 0, h: 0 };
    return {
      url: m[1].trim(),
      w: Math.min(parseInt(m[2], 10) || 0, MAX_LENGTH),
      h: Math.min(parseInt(m[3], 10) || 0, MAX_LENGTH)
    };
  }

  /**
   * Turns one label into a flat list of styled runs. Deliberately a small
   * subset of Markdown: emphasis, code, strikethrough, links, images and an
   * explicit break. Anything unmatched stays literal, so a stray asterisk in a
   * label renders as an asterisk rather than eating the rest of the line.
   */
  function parseInline(text, style, out) {
    style = style || {};
    out = out || [];
    var buffer = '';

    function flush() {
      if (buffer) { out.push(textRun(buffer, style)); buffer = ''; }
    }

    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      var rest = text.substr(i);

      if (ch === '\\') {                                   // escaped literal
        var next = text.charAt(i + 1);
        if (next === 'n') { flush(); out.push({ type: 'break' }); i++; continue; }
        if (next) { buffer += next; i++; continue; }
        buffer += ch;
        continue;
      }

      if (ch === '`') {                                    // code span wins over all
        var codeEnd = text.indexOf('`', i + 1);
        if (codeEnd > i) {
          flush();
          out.push(textRun(text.slice(i + 1, codeEnd), extend(style, { code: true })));
          i = codeEnd;
          continue;
        }
      }

      if (ch === '!' && text.charAt(i + 1) === '[') {       // image or embed
        var altEnd = matchBracket(text, i + 1, '[', ']');
        if (altEnd > -1 && text.charAt(altEnd + 1) === '(') {
          var srcEnd = matchBracket(text, altEnd + 1, '(', ')');
          if (srcEnd > -1) {
            var hint = parseSizeHint(text.slice(altEnd + 2, srcEnd));

            // `#some-id` addresses an element on this page rather than a file,
            // so the same "embed what is at this address" syntax covers both.
            var ref = ELEMENT_REF.exec(hint.url);
            if (ref) {
              flush();
              out.push({
                type: 'embed', ref: ref[1], alt: text.slice(i + 2, altEnd),
                askedW: hint.w, askedH: hint.h
              });
              i = srcEnd;
              continue;
            }

            var src = safeUrl(hint.url, true);
            if (src) {
              flush();
              out.push({
                type: 'image', src: src, alt: text.slice(i + 2, altEnd),
                askedW: hint.w, askedH: hint.h, href: style.href || null
              });
              i = srcEnd;
              continue;
            }
          }
        }
      }

      if (ch === '[' && !style.href) {                      // link (never nested)
        var labelEnd = matchBracket(text, i, '[', ']');
        if (labelEnd > -1 && text.charAt(labelEnd + 1) === '(') {
          var hrefEnd = matchBracket(text, labelEnd + 1, '(', ')');
          if (hrefEnd > -1) {
            var href = safeUrl(text.slice(labelEnd + 2, hrefEnd), false);
            if (href) {
              flush();
              parseInline(text.slice(i + 1, labelEnd), extend(style, { href: href }), out);
              i = hrefEnd;
              continue;
            }
          }
        }
      }

      var marker = null;
      var changes = null;
      if (rest.indexOf('**') === 0 && !style.bold) { marker = '**'; changes = { bold: true }; }
      else if (rest.indexOf('__') === 0 && !style.bold) { marker = '__'; changes = { bold: true }; }
      else if (rest.indexOf('~~') === 0 && !style.strike) { marker = '~~'; changes = { strike: true }; }
      else if (ch === '*' && !style.italic) { marker = '*'; changes = { italic: true }; }
      else if (ch === '_' && !style.italic && !wordChar(text.charAt(i - 1))) {
        marker = '_'; changes = { italic: true };
      }

      if (marker) {
        var after = text.charAt(i + marker.length);
        var underscore = marker.charAt(0) === '_';
        if (after && !/\s/.test(after)) {
          var close = findClose(text, marker, i + marker.length + 1, underscore);
          if (close > -1) {
            flush();
            parseInline(text.slice(i + marker.length, close), extend(style, changes), out);
            i = close + marker.length - 1;
            continue;
          }
        }
      }

      buffer += ch;
    }

    flush();
    return out;
  }

  /** Collapses to a single plain run when a label has no markup at all. */
  function parseLabel(label, enabled) {
    if (!enabled || !/[*_`~\[\]!\\]/.test(label)) {
      return [textRun(label, {})];
    }
    var runs = parseInline(label, {}, []);
    return runs.length ? runs : [textRun('', {})];
  }

  /** Plain-text form of a label, for aria-labels and the outline. */
  function runsToText(runs) {
    var out = '';
    for (var i = 0; i < runs.length; i++) {
      var r = runs[i];
      if (r.type === 'text') out += r.text;
      else if (r.type === 'image') out += r.alt || '';
      else if (r.type === 'embed') out += r.plain || r.alt || '';
      else if (r.type === 'break') out += ' ';
    }
    return out.trim();
  }

  // ------------------------------------------------------------ embedded HTML

  /**
   * A node can hold a block of the page's own HTML — a table, a card, a
   * formatted definition — pulled in by element id. The content is copied
   * rather than moved, so the source element stays where the author put it and
   * one block can appear in several maps.
   */

  // Room an embedded block gets to lay itself out before it is left to overflow.
  var EMBED_MAX_H = 400;

  // Elements that run code or bring a document of their own with them. The
  // reasoning is the same one that drops <script>: inside a <template> none of
  // these has ever been live, so the copy is where they would start — and an
  // <iframe srcdoc> or a <base href> starting late is a surprise the author
  // did not ask for by writing a node label. <base>, <meta> and <link> also
  // reach past the node and retarget or restyle the whole page. Matched
  // case-insensitively because an SVG <script> reports a lower-case tagName
  // and runs just as happily as an HTML one.
  var ACTIVE_TAGS =
    /^(script|iframe|frame|frameset|object|embed|applet|portal|base|meta|link)$/i;

  // Attributes a `javascript:` URL can hide in. Checked by name rather than by
  // scanning every attribute, so a title reading "javascript: the language"
  // survives as typed.
  var URL_ATTRS =
    /^(xlink:)?(href|src|srcdoc|srcset|action|formaction|data|poster|ping|background)$/i;

  // Leading control characters and whitespace are ignored by URL parsers, so
  // `java\tscript:` is still a javascript: URL and has to be seen as one.
  var UNSAFE_URL = /^[\u0000-\u0020]*(javascript|vbscript)[\u0000-\u0020]*:/i;

  /** Strips anything that would misbehave once copied into the page a second time. */
  function cleanEmbed(wrap) {
    var all = wrap.querySelectorAll('*');
    for (var i = all.length - 1; i >= 0; i--) {
      var el = all[i];

      if (ACTIVE_TAGS.test(el.tagName)) {
        if (el.parentNode) el.parentNode.removeChild(el);
        continue;
      }

      // Duplicate ids would break getElementById on the author's own page.
      if (el.id) el.removeAttribute('id');

      var attrs = el.attributes;
      for (var j = attrs.length - 1; j >= 0; j--) {
        var name = attrs[j].name;
        if (/^on/i.test(name)) { el.removeAttribute(name); continue; }
        if (URL_ATTRS.test(name) && UNSAFE_URL.test(attrs[j].value)) {
          el.removeAttribute(name);
        }
      }
    }
  }

  /**
   * The copy of the referenced element, ready to be planted in a node.
   * A <template> gives up its contents; anything else is copied whole, so the
   * author's own classes still style it, minus whatever was keeping it hidden.
   */
  function embedSource(id) {
    var el = document.getElementById(id);
    if (!el) return null;

    var wrap = document.createElement('div');
    wrap.className = 'mm-embed-body';

    if (el.tagName === 'TEMPLATE' && el.content) {
      wrap.appendChild(el.content.cloneNode(true));
    } else {
      var copy = el.cloneNode(true);
      if (copy.classList) copy.classList.remove('mm-source');
      if (copy.removeAttribute) copy.removeAttribute('hidden');
      if (copy.style && copy.style.display === 'none') copy.style.display = '';
      wrap.appendChild(copy);
    }

    cleanEmbed(wrap);
    return wrap;
  }

  /**
   * Measuring happens in a copy parked off-screen next to where the map will
   * land, so the page's own CSS applies exactly as it will once drawn.
   */
  function makeHost(near) {
    var host = document.createElement('div');
    host.className = 'mm-container';
    host.setAttribute('data-mindmap-rendered', '');   // never look for maps in here
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = 'position:absolute;left:-99999px;top:0;width:auto;' +
      'max-width:none;margin:0;padding:0;visibility:hidden;';
    (near || document.body).appendChild(host);
    return host;
  }

  /** Created on demand, so a map with no embeds never touches the page. */
  function hostOf(ref) {
    if (!ref.el) ref.el = makeHost(ref.near);
    return ref.el;
  }

  function releaseHost(ref) {
    if (ref.el && ref.el.parentNode) ref.el.parentNode.removeChild(ref.el);
    ref.el = null;
  }

  /** The box an embedded block will occupy, laid out as it will really appear. */
  function sizeEmbed(run, host, opts) {
    var box = document.createElement('div');
    box.className = 'mm-embed';
    box.style.cssText = 'display:inline-block;max-width:' +
      (run.askedW || opts.embedMaxWidth) + 'px;';
    box.appendChild(run.dom.cloneNode(true));

    host.appendChild(box);
    var rect = box.getBoundingClientRect();
    host.removeChild(box);

    run.w = Math.max(1, run.askedW || Math.ceil(rect.width));
    run.h = Math.max(1, run.askedH || Math.min(EMBED_MAX_H, Math.ceil(rect.height)));
  }

  /** Short stand-in text, for the outline and the node's accessible name. */
  function embedText(run) {
    if (run.alt) return run.alt;
    var text = (run.dom.textContent || '').replace(/\s+/g, ' ').trim();
    return text.length > 80 ? text.slice(0, 79) + '…' : text;
  }

  function resolveEmbeds(node, opts, ref) {
    for (var i = 0; i < node.runs.length; i++) {
      var run = node.runs[i];
      if (run.type !== 'embed') continue;

      if (!run.dom) {
        run.dom = embedSource(run.ref);
        if (!run.dom) {
          throw new MindMapError(
            'This node asks for the page element with id "' + run.ref + '", but no ' +
            'element with that id exists. Check the spelling, and that the element ' +
            'appears in the page rather than being added later by a script.',
            node.lineNo);
        }
        run.plain = embedText(run);
      }

      sizeEmbed(run, hostOf(ref), opts);
      node.hasEmbed = true;
    }
  }

  // -------------------------------------------------------------- measurement

  var measureCtx = null;
  function textWidth(str, font) {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
    measureCtx.font = font;
    return measureCtx.measureText(str).width;
  }

  /** The CSS font string for a run, given the node's base metrics. */
  function runFont(run, m) {
    var size = run.code ? m.size * 0.92 : m.size;
    var weight = run.bold ? '700' : m.weight;
    var style = run.italic ? 'italic ' : '';
    return style + weight + ' ' + size + 'px ' + (run.code ? MONO_STACK : FONT_STACK);
  }

  function runFontSize(run, m) { return run.code ? m.size * 0.92 : m.size; }

  // A code run carries a chip behind it, which needs a little breathing room.
  var CODE_PAD_X = 3.5;

  function imageSize(run) {
    var w = run.askedW, h = run.askedH;
    if (w && h) return { w: w, h: h };

    var natW = run.natW || 0, natH = run.natH || 0;
    if (!natW || !natH) {
      // Not loaded yet: hold a placeholder honouring whichever side was given.
      if (w) return { w: w, h: Math.round(w * 0.75) };
      if (h) return { w: Math.round(h * 1.33), h: h };
      return { w: IMAGE_PLACEHOLDER_W, h: IMAGE_PLACEHOLDER_H };
    }

    var ratio = natW / natH;
    if (w) return { w: w, h: Math.round(w / ratio) };
    if (h) return { w: Math.round(h * ratio), h: h };

    var scale = Math.min(1, IMAGE_MAX_W / natW, IMAGE_MAX_H / natH);
    return { w: Math.round(natW * scale), h: Math.round(natH * scale) };
  }

  /**
   * Splits runs into atomic items: whole words, single spaces, images and
   * explicit breaks. Wrapping then happens between items, so a line can break
   * anywhere a space falls even in the middle of a bold phrase.
   */
  function runsToItems(runs, m) {
    var items = [];
    for (var i = 0; i < runs.length; i++) {
      var run = runs[i];

      if (run.type === 'break') { items.push({ kind: 'break' }); continue; }

      if (run.type === 'image') {
        var size = imageSize(run);
        items.push({ kind: 'image', run: run, w: size.w, h: size.h });
        continue;
      }

      if (run.type === 'embed') {
        items.push({ kind: 'embed', run: run, w: run.w, h: run.h });
        continue;
      }

      var font = runFont(run, m);
      var size2 = runFontSize(run, m);
      // Keep the spaces as items so widths stay exact after wrapping, and so
      // the rendered text still reads correctly when copied.
      var parts = run.text.split(/(\s+)/);
      var first = items.length;
      for (var p = 0; p < parts.length; p++) {
        if (!parts[p]) continue;
        var isSpace = /^\s+$/.test(parts[p]);
        var text = isSpace ? ' ' : parts[p];
        items.push({
          kind: isSpace ? 'space' : 'word',
          run: run, text: text, font: font, w: textWidth(text, font),
          h: size2 * 1.35, size: size2
        });
      }
      // The chip's breathing room belongs to the run as a whole.
      if (run.code && items.length > first) {
        items[first].w += CODE_PAD_X;
        items[items.length - 1].w += CODE_PAD_X;
      }
    }
    return items;
  }

  /** Greedy wrap of items into lines, honouring explicit breaks. */
  function layoutLines(items, maxWidth) {
    var lines = [];
    var line = [];
    var width = 0;

    function push() {
      // Trailing spaces should not count towards the line's width.
      while (line.length && line[line.length - 1].kind === 'space') {
        width -= line.pop().w;
      }
      lines.push({ items: line, width: width });
      line = [];
      width = 0;
    }

    for (var i = 0; i < items.length; i++) {
      var it = items[i];

      if (it.kind === 'break') { push(); continue; }
      if (it.kind === 'space' && !line.length) continue;      // no leading space

      if (line.length && width + it.w > maxWidth && it.kind !== 'space') {
        push();
        if (it.kind === 'space') continue;
      }
      line.push(it);
      width += it.w;
    }
    push();

    // An entirely empty label still occupies one line.
    if (!lines.length) lines.push({ items: [], width: 0 });
    return lines;
  }

  /** Positions items within each line and returns the block's size. */
  function placeLines(lines, m) {
    var y = 0;
    var widest = 0;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var height = 0;
      for (var j = 0; j < line.items.length; j++) {
        height = Math.max(height, line.items[j].h);
      }
      if (!height) height = m.size * 1.35;

      var x = 0;
      for (var k = 0; k < line.items.length; k++) {
        line.items[k].x = x;
        x += line.items[k].w;
      }
      line.top = y;
      line.height = height;
      y += height;
      widest = Math.max(widest, line.width);
    }
    return { width: widest, height: y };
  }

  /** Fills in .runs, .lines, .w and .h on every node. */
  function measureNode(node, opts) {
    var m = metrics(node.depth);
    node.metrics = m;
    node.radius = m.radius;
    node.fontSize = m.size;

    var items = runsToItems(node.runs, m);
    node.lines = layoutLines(items, opts.maxNodeWidth);
    var block = placeLines(node.lines, m);

    node.textWidth = block.width;
    node.w = Math.ceil(block.width + 2 * m.padX);
    node.h = Math.ceil(block.height + 2 * m.padY);
  }

  function measureTree(node, opts, ref) {
    node.runs = parseLabel(node.label, opts.markup);
    if (ref) resolveEmbeds(node, opts, ref);
    node.plain = runsToText(node.runs);
    measureNode(node, opts);
    for (var j = 0; j < node.children.length; j++) measureTree(node.children[j], opts, ref);
  }

  // ------------------------------------------------------------------- layout

  function leafCount(node) {
    var kids = node.kids;
    if (!kids.length) return 1;
    var n = 0;
    for (var i = 0; i < kids.length; i++) n += leafCount(kids[i]);
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
    var kids = node.kids;
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
    var kids = node.kids;
    if (!kids.length) return;
    var y = top + (node.extent - node.childrenTotal) / 2;
    for (var i = 0; i < kids.length; i++) {
      placeVertical(kids[i], y);
      y += kids[i].extent + node.childGap;
    }
  }

  function collectByDepth(node, bucket) {
    (bucket[node.depth] || (bucket[node.depth] = [])).push(node);
    for (var i = 0; i < node.kids.length; i++) collectByDepth(node.kids[i], bucket);
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

  /** Every node in the tree, collapsed or not. */
  function eachNode(node, fn) {
    fn(node);
    for (var i = 0; i < node.children.length; i++) eachNode(node.children[i], fn);
  }

  /** Only the nodes currently on screen. */
  function eachVisible(node, fn) {
    fn(node);
    for (var i = 0; i < node.kids.length; i++) eachVisible(node.kids[i], fn);
  }

  /** Refreshes node.kids from the collapsed flags, before a layout pass. */
  function refreshVisibility(root) {
    eachNode(root, function (n) { n.kids = n.collapsed ? [] : n.children; });
  }

  /** Assigns .x (left edge), .cy, .side and .accentIndex to every node. */
  /**
   * Decides which branches sit on which side, and paints each branch with its
   * accent. Done once per map: if the split were recomputed after every
   * collapse, branches would jump across the root and lose the reader.
   */
  function assignSides(root, direction) {
    refreshVisibility(root);
    var branches = root.children;
    var groups;

    if (direction === 'right') {
      groups = { right: branches.slice(), left: [] };
    } else if (direction === 'left') {
      groups = { right: [], left: branches.slice() };
    } else {
      groups = splitBranches(branches);
    }

    // Branch accents follow the author's original order, not the split.
    for (var b = 0; b < branches.length; b++) {
      var idx = b % palette().length;
      eachNode(branches[b], function (n) { n.accentIndex = idx; });
    }

    root.side = 0;
    groups.right.forEach(function (b) { eachNode(b, function (n) { n.side = 1; }); });
    groups.left.forEach(function (b) { eachNode(b, function (n) { n.side = -1; }); });

    return [
      { nodes: groups.right, sign: 1 },
      { nodes: groups.left, sign: -1 }
    ];
  }

  function layout(root, opts, sides) {
    refreshVisibility(root);

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
        eachVisible(side.nodes[i], function (n) {
          n.x = side.sign > 0 ? edges[n.depth] : edges[n.depth] - n.w;
        });
      }
    });

    // Normalise so the drawing starts at (padding, padding).
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    eachVisible(root, function (n) {
      // A toggle sits on the outward edge and pokes past the box, so it has to
      // count towards the canvas or it clips at the extremes.
      var bulge = (opts.interactive && n.depth > 0 && n.children.length) ? TOGGLE_R + 1 : 0;
      minX = Math.min(minX, n.x - (n.side < 0 ? bulge : 0));
      maxX = Math.max(maxX, n.x + n.w + (n.side > 0 ? bulge : 0));
      minY = Math.min(minY, n.cy - n.h / 2);
      maxY = Math.max(maxY, n.cy + n.h / 2);
    });

    var dx = opts.padding - minX;
    var dy = opts.padding - minY;
    eachVisible(root, function (n) { n.x += dx; n.cy += dy; });

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

  /** Uses the animated position (ax/acy), which equals the layout when idle. */
  function edgePath(parent, child) {
    var fromRight = child.side > 0;
    var x1 = fromRight ? nx(parent) + parent.w : nx(parent);
    var x2 = fromRight ? nx(child) : nx(child) + child.w;

    var y1 = ny(parent);
    var y2 = ny(child);
    var cx = (x2 - x1) * 0.5;
    return 'M' + x1 + ',' + y1 +
      ' C' + (x1 + cx) + ',' + y1 + ' ' + (x2 - cx) + ',' + y2 + ' ' + x2 + ',' + y2;
  }

  function round(n) { return Math.round(n * 100) / 100; }

  /** Wraps, so a palette shorter than the one in force at layout still fits. */
  function accentPair(index) {
    var list = palette();
    return list[index % list.length];
  }

  /**
   * Builds one <g> per node, positioned by transform so a collapse can animate
   * it without rebuilding the DOM. Every node is created up front, including
   * ones that start collapsed — toggling only changes visibility.
   */
  function drawNode(node, group, opts) {
    var isRoot = node.depth === 0;
    var g = svgEl('g', {
      'class': 'mm-node ' + (isRoot ? 'mm-root' : 'mm-d' + Math.min(node.depth, 3))
    });

    if (!isRoot) {
      var pair = accentPair(node.accentIndex);
      g.style.setProperty('--mm-a', pair[0]);
      g.style.setProperty('--mm-a-dark', pair[1]);
    }

    g.appendChild(svgEl('rect', {
      'class': 'mm-box',
      x: 0, y: 0, width: node.w, height: node.h,
      rx: node.radius, ry: node.radius
    }));

    g.appendChild(buildLabel(node));

    // Root has children on both sides, so a toggle there would be ambiguous
    // and would only ever hide the whole map. Leaves have nothing to hide.
    var canToggle = opts.interactive && !isRoot && node.children.length > 0;
    if (canToggle) g.appendChild(buildToggle(node));

    node.el = g;
    group.appendChild(g);

    for (var j = 0; j < node.children.length; j++) drawNode(node.children[j], group, opts);
  }

  /**
   * Merges consecutive items belonging to the same run into one drawable, so a
   * styled phrase becomes a single <text> with its spaces intact. Without this
   * the SVG's textContent would run words together.
   */
  function groupItems(items) {
    var groups = [];
    var current = null;

    function close() {
      if (!current) return;
      // SVG trims leading whitespace when it draws text, so a run beginning
      // with a space would slide left and butt against its neighbour. Anchor
      // the drawn text on its first real word instead, and keep the space
      // aside to be re-inserted as an unrendered node so the element's text
      // content still reads as separate words.
      var words = current.parts.filter(function (p) { return p.kind !== 'space'; });
      if (!words.length) { current = null; return; }

      var lead = '';
      for (var i = 0; i < current.parts.length && current.parts[i].kind === 'space'; i++) {
        lead += current.parts[i].text;
      }
      var text = '';
      for (var j = 0; j < current.parts.length; j++) text += current.parts[j].text;

      groups.push({
        kind: 'text',
        run: current.run,
        x: words[0].x,                  // first drawable glyph, not the space
        w: current.w - (words[0].x - current.parts[0].x),
        h: current.h,
        size: current.size,
        lead: lead,
        text: text.slice(lead.length)
      });
      current = null;
    }

    for (var i = 0; i < items.length; i++) {
      var it = items[i];

      if (it.kind === 'image' || it.kind === 'embed') {
        close();
        groups.push({ kind: it.kind, run: it.run, x: it.x, w: it.w, h: it.h });
        continue;
      }
      if (current && current.run === it.run) {
        current.parts.push(it);
        current.w += it.w;
        continue;
      }
      close();
      current = {
        run: it.run, parts: [it], w: it.w, h: it.h, size: it.size
      };
    }
    close();
    return groups;
  }

  /**
   * Draws the label as positioned runs rather than one text element, so bold,
   * italic, code chips, links and images can sit side by side on a line.
   * Lines are centred within the box, matching the plain-text look.
   */
  function buildLabel(node) {
    var wrap = svgEl('g', { 'class': 'mm-label' });
    var m = node.metrics;
    var blockHeight = 0;
    var i;

    for (i = 0; i < node.lines.length; i++) blockHeight += node.lines[i].height;
    var top = node.h / 2 - blockHeight / 2;

    for (i = 0; i < node.lines.length; i++) {
      var line = node.lines[i];
      // A bare newline between lines is not rendered by SVG, but it keeps the
      // element's text content readable when copied or extracted.
      if (i) wrap.appendChild(document.createTextNode('\n'));
      var lineTop = top + line.top;
      var originX = (node.w - line.width) / 2;
      var baseline = lineTop + line.height / 2 + m.size * 0.35;

      var groups = groupItems(line.items);

      for (var j = 0; j < groups.length; j++) {
        var it = groups[j];

        var host = wrap;
        if (it.run && it.run.href) {
          host = svgEl('a', { 'class': 'mm-link' });
          host.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', it.run.href);
          host.setAttribute('href', it.run.href);
          wrap.appendChild(host);
        }

        if (it.kind === 'embed') {
          // <foreignObject> is the one place real HTML is allowed inside SVG.
          var fo = svgEl('foreignObject', {
            'class': 'mm-embed-host',
            x: round(originX + it.x),
            y: round(lineTop + (line.height - it.h) / 2),
            width: it.w, height: it.h
          });
          var body = document.createElement('div');
          body.className = 'mm-embed';
          body.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
          body.style.width = it.w + 'px';
          body.style.height = it.h + 'px';
          body.appendChild(it.run.dom.cloneNode(true));
          fo.appendChild(body);
          host.appendChild(fo);
          continue;
        }

        if (it.kind === 'image') {
          var img = svgEl('image', {
            'class': 'mm-image',
            x: round(originX + it.x),
            y: round(lineTop + (line.height - it.h) / 2),
            width: it.w, height: it.h,
            preserveAspectRatio: 'xMidYMid meet'
          });
          img.setAttribute('href', it.run.src);
          img.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', it.run.src);
          if (it.run.alt) {
            var title = svgEl('title', {});
            title.textContent = it.run.alt;
            img.appendChild(title);
          }
          host.appendChild(img);
          continue;
        }

        // Unrendered, but keeps the copied text reading as separate words.
        if (it.lead) wrap.appendChild(document.createTextNode(it.lead));

        var textX = originX + it.x;
        if (it.run.code) {
          host.appendChild(svgEl('rect', {
            'class': 'mm-code-chip',
            x: round(textX),
            y: round(baseline - it.size * 0.95),
            width: round(it.w),
            height: round(it.size * 1.28),
            rx: 3, ry: 3
          }));
          textX += CODE_PAD_X;      // text starts inside the chip's padding
        }

        var t = svgEl('text', {
          x: round(textX),
          y: round(baseline),
          'font-size': round(it.size),
          'font-weight': it.run.bold ? '700' : m.weight
        });
        if (it.run.italic) t.setAttribute('font-style', 'italic');
        if (it.run.code) t.setAttribute('font-family', MONO_STACK);
        if (it.run.strike) t.setAttribute('text-decoration', 'line-through');

        var cls = [];
        if (it.run.code) cls.push('mm-code');
        if (it.run.href) cls.push('mm-link-text');
        if (cls.length) t.setAttribute('class', cls.join(' '));

        t.textContent = it.text;
        host.appendChild(t);
      }
    }
    return wrap;
  }

  /**
   * Rebuilds a node's box and label from its current measurements. Needed when
   * a re-measure changes the node's size, which happens once images load.
   */
  function redrawNodeBody(node) {
    if (!node.el) return;

    var box = node.el.querySelector('.mm-box');
    if (box) {
      box.setAttribute('width', node.w);
      box.setAttribute('height', node.h);
    }

    var old = node.el.querySelector('.mm-label');
    var fresh = buildLabel(node);
    if (old) node.el.replaceChild(fresh, old);
    else node.el.insertBefore(fresh, node.el.firstChild);
  }

  function buildToggle(node) {
    // Sits on the edge facing away from the root, where the subtree extends.
    var cx = node.side > 0 ? node.w : 0;
    var t = svgEl('g', {
      'class': 'mm-toggle',
      transform: 'translate(' + round(cx) + ',' + round(node.h / 2) + ')'
    });
    t.appendChild(svgEl('circle', { 'class': 'mm-toggle-bg', r: TOGGLE_R }));
    t.appendChild(svgEl('path', { 'class': 'mm-toggle-sign', d: 'M-3.4 0 H3.4' }));
    t.appendChild(svgEl('path', { 'class': 'mm-toggle-sign mm-toggle-v', d: 'M0 -3.4 V3.4' }));
    node.toggleEl = t;
    return t;
  }

  /** Toggles live on the outward edge, which flips when a branch changes side. */
  function syncTogglePositions(root) {
    eachNode(root, function (n) {
      if (!n.toggleEl) return;
      n.toggleEl.setAttribute('transform',
        'translate(' + round(n.side > 0 ? n.w : 0) + ',' + round(n.h / 2) + ')');
    });
  }

  /**
   * Drag offsets accumulate down the tree, so moving a node carries its whole
   * subtree along and the branch keeps its shape.
   */
  function accumulateOffsets(root) {
    eachNode(root, function (n) {
      // Offsets stop at the root: its "subtree" is the entire map, so passing
      // them down would slide everything at once and change nothing visible.
      // The centre node therefore moves alone.
      var from = (n.parent && n.parent.depth > 0) ? n.parent : null;
      n.edx = (from ? from.edx : 0) + (n.dx || 0);
      n.edy = (from ? from.edy : 0) + (n.dy || 0);
    });
  }

  function nx(n) { return n.ax + (n.edx || 0); }
  function ny(n) { return n.acy + (n.edy || 0); }

  function positionNode(node) {
    node.el.setAttribute('transform',
      'translate(' + round(nx(node)) + ',' + round(ny(node) - node.h / 2) + ')');
  }

  function drawEdges(node, group) {
    for (var i = 0; i < node.children.length; i++) {
      var child = node.children[i];
      var pair = accentPair(child.accentIndex);
      var path = svgEl('path', {
        'class': 'mm-edge',
        'stroke-width': strokeWidth(child.depth)
      });
      path.style.setProperty('--mm-a', pair[0]);
      path.style.setProperty('--mm-a-dark', pair[1]);
      child.edge = path;
      group.appendChild(path);
      drawEdges(child, group);
    }
  }

  function buildSvg(root, size, opts) {
    var svg = svgEl('svg', {
      'class': 'mm-svg',
      xmlns: SVG_NS,
      viewBox: '0 0 ' + size.width + ' ' + size.height,
      width: size.width,
      height: size.height,
      role: opts.interactive ? 'group' : 'img',
      'aria-label': 'Mind map: ' + (root.plain || root.label)
    });

    var title = svgEl('title', {});
    title.textContent = 'Mind map: ' + (root.plain || root.label);
    svg.appendChild(title);

    var edges = svgEl('g', { 'class': 'mm-edges' });
    drawEdges(root, edges);
    svg.appendChild(edges);

    var nodes = svgEl('g', { 'class': 'mm-nodes' });
    drawNode(root, nodes, opts);
    svg.appendChild(nodes);

    // Scale down to fit a narrow column, but only so far — past MIN_SCALE the
    // labels stop being readable, so the container scrolls sideways instead.
    svg.style.maxWidth = size.width + 'px';
    svg.style.minWidth = Math.round(size.width * MIN_SCALE) + 'px';
    return svg;
  }

  // -------------------------------------------------------------- interaction

  var ANIM_MS = 300;

  function prefersReducedMotion() {
    return global.matchMedia &&
      global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function easeInOut(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  /**
   * Marks which nodes are on screen. A node is visible when no ancestor is
   * collapsed; the collapsed node itself stays visible, holding its "+".
   */
  function markVisible(root) {
    eachNode(root, function (n) {
      n.vis = !n.parent ? true : (n.parent.vis && !n.parent.collapsed);
    });
  }

  /** Nearest ancestor that is still on screen — where a hidden node flies to. */
  function visibleAnchor(node) {
    var p = node.parent;
    while (p && !p.vis) p = p.parent;
    return p || node;
  }

  function syncToggleState(root) {
    eachNode(root, function (n) {
      if (!n.el) return;
      if (n.children.length && n.depth > 0) {
        n.el.classList.toggle('mm-collapsed', !!n.collapsed);
        // Usually the whole node is the button; a node holding embedded HTML
        // hands that role to its +/- badge instead.
        var ctl = n.ctl || n.el;
        ctl.setAttribute('aria-expanded', n.collapsed ? 'false' : 'true');
        ctl.setAttribute('aria-label',
          (n.plain || n.label) + ', ' + n.children.length + ' item' +
          (n.children.length === 1 ? '' : 's') +
          ', ' + (n.collapsed ? 'collapsed' : 'expanded'));
      }
    });
  }

  /**
   * Re-lays out after a collapse or expand and glides everything into place.
   * Nodes appearing grow out of their parent; nodes leaving shrink back into
   * it, which keeps the reader oriented about where the content went.
   */
  function relayout(state, animate) {
    finishAnimation(state);
    var root = state.root;
    var prev = {};
    eachNode(root, function (n) {
      prev[nodeKey(n)] = { x: n.ax, cy: n.acy, vis: n.vis, shown: n.shown };
    });
    var fromBounds = state.bounds || sizeBounds(state.size);

    markVisible(root);
    var size = layout(root, state.opts, state.sides);
    state.size = size;

    // Targets, plus a sensible start for anything that was not on screen.
    eachNode(root, function (n) {
      var before = prev[nodeKey(n)];
      n.tx = n.x;
      n.tcy = n.cy;
      if (n.vis && !before.vis) {
        var anchor = visibleAnchor(n);
        n.ax = anchor.tx !== undefined ? anchor.tx : n.x;
        n.acy = anchor.tcy !== undefined ? anchor.tcy : n.cy;
        n.fade = 0;
      } else if (!n.vis && before.vis) {
        var out = visibleAnchor(n);
        n.tx = out.tx !== undefined ? out.tx : n.ax;
        n.tcy = out.tcy !== undefined ? out.tcy : n.acy;
        n.fade = 1;
      } else {
        n.fade = n.vis ? 1 : 0;
      }
      n.fromX = n.ax;
      n.fromCy = n.acy;
      n.fromFade = n.fade;
      n.toFade = n.vis ? 1 : 0;
    });

    syncToggleState(root);

    var toBounds = targetBounds(state, size);

    if (!animate || prefersReducedMotion()) {
      eachNode(root, function (n) { n.ax = n.tx; n.acy = n.tcy; n.fade = n.toFade; });
      paint(state, toBounds);
      return;
    }

    state.pendingNodes = true;
    state.pendingBounds = toBounds;
    var start = null;

    function step(now) {
      if (start === null) start = now;
      var t = Math.min(1, (now - start) / ANIM_MS);
      var e = easeInOut(t);

      eachNode(root, function (n) {
        n.ax = n.fromX + (n.tx - n.fromX) * e;
        n.acy = n.fromCy + (n.tcy - n.fromCy) * e;
        n.fade = n.fromFade + (n.toFade - n.fromFade) * e;
      });

      paint(state, lerpBounds(fromBounds, toBounds, e));

      if (t < 1) state.raf = global.requestAnimationFrame(step);
      else {
        state.raf = null;
        state.pendingNodes = false;
        state.pendingBounds = null;
        paint(state, toBounds);
      }
    }
    state.raf = global.requestAnimationFrame(step);
  }

  var keySeq = 0;
  function nodeKey(n) {
    if (n.key === undefined) n.key = ++keySeq;
    return n.key;
  }

  function toggleBulge(n, opts) {
    return (opts.interactive && n.depth > 0 && n.children.length) ? TOGGLE_R + 1 : 0;
  }

  /**
   * The canvas is the laid-out area, widened to take in anything the reader has
   * dragged outside it. With nothing dragged this is exactly the layout box.
   */
  function boundsOf(state, size) {
    var pad = state.opts.padding;
    var x0 = 0, y0 = 0, x1 = size.width, y1 = size.height;
    eachNode(state.root, function (n) {
      if (n.fade <= 0.001 || (!n.edx && !n.edy)) return;
      var bulge = toggleBulge(n, state.opts);
      x0 = Math.min(x0, nx(n) - pad - (n.side < 0 ? bulge : 0));
      x1 = Math.max(x1, nx(n) + n.w + pad + (n.side > 0 ? bulge : 0));
      y0 = Math.min(y0, ny(n) - n.h / 2 - pad);
      y1 = Math.max(y1, ny(n) + n.h / 2 + pad);
    });
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  function sizeBounds(size) {
    return { x: 0, y: 0, w: size.width, h: size.height };
  }

  /** One frame: transforms, edge curves, opacity, canvas. */
  function paint(state, bounds) {
    var root = state.root;
    accumulateOffsets(root);

    eachNode(root, function (n) {
      var drawn = n.fade > 0.001;
      n.el.style.display = drawn ? '' : 'none';
      if (drawn) {
        n.el.style.opacity = n.fade < 0.999 ? n.fade : '';
        positionNode(n);
      }
      if (n.edge) {
        var edgeOn = drawn && n.parent.fade > 0.001;
        n.edge.style.display = edgeOn ? '' : 'none';
        if (edgeOn) {
          n.edge.style.opacity = n.fade < 0.999 ? n.fade : '';
          n.edge.setAttribute('d', edgePath(n.parent, n));
        }
      }
    });

    state.bounds = bounds;
    var svg = state.svg;
    svg.setAttribute('viewBox', round(bounds.x) + ' ' + round(bounds.y) + ' ' +
      round(bounds.w) + ' ' + round(bounds.h));
    svg.setAttribute('width', round(bounds.w));
    svg.setAttribute('height', round(bounds.h));
    svg.style.maxWidth = round(bounds.w) + 'px';
    svg.style.minWidth = Math.round(bounds.w * MIN_SCALE) + 'px';
  }

  function lerpBounds(a, b, e) {
    return {
      x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e,
      w: a.w + (b.w - a.w) * e, h: a.h + (b.h - a.h) * e
    };
  }

  /** Bounds the map will occupy once the pending animation finishes. */
  function targetBounds(state, size) {
    var saved = [];
    eachNode(state.root, function (n) {
      saved.push([n.ax, n.acy, n.fade]);
      n.ax = n.tx; n.acy = n.tcy; n.fade = n.toFade;
    });
    accumulateOffsets(state.root);
    var b = boundsOf(state, size);
    var i = 0;
    eachNode(state.root, function (n) {
      var s = saved[i++]; n.ax = s[0]; n.acy = s[1]; n.fade = s[2];
    });
    accumulateOffsets(state.root);
    return b;
  }

  /**
   * Jumps any in-flight animation to its end. Starting a new animation without
   * this would cancel the frame loop and strand nodes part-way there.
   */
  function finishAnimation(state) {
    if (!state.raf) return;
    global.cancelAnimationFrame(state.raf);
    state.raf = null;
    if (state.pendingNodes) {
      eachNode(state.root, function (n) {
        n.ax = n.tx; n.acy = n.tcy; n.fade = n.toFade;
      });
      state.pendingNodes = false;
    }
    if (state.pendingBounds) {
      paint(state, state.pendingBounds);
      state.pendingBounds = null;
    }
  }

  /** Eases the canvas to a new size, e.g. after a drag pushes past the edge. */
  function tweenBounds(state, to) {
    finishAnimation(state);
    var from = state.bounds;
    if (Math.abs(from.x - to.x) < 0.5 && Math.abs(from.y - to.y) < 0.5 &&
        Math.abs(from.w - to.w) < 0.5 && Math.abs(from.h - to.h) < 0.5) return;

    if (prefersReducedMotion()) { paint(state, to); return; }

    state.pendingBounds = to;
    var start = null;
    function step(now) {
      if (start === null) start = now;
      var t = Math.min(1, (now - start) / ANIM_MS);
      paint(state, lerpBounds(from, to, easeInOut(t)));
      if (t < 1) state.raf = global.requestAnimationFrame(step);
      else { state.raf = null; state.pendingBounds = null; paint(state, to); }
    }
    state.raf = global.requestAnimationFrame(step);
  }

  /**
   * Images without an explicit size are drawn at a placeholder size, then the
   * map re-flows once the real dimensions arrive. Several arrivals in the same
   * frame are coalesced into one re-flow.
   */
  function loadImages(state) {
    var pending = [];
    eachNode(state.root, function (n) {
      for (var i = 0; i < n.runs.length; i++) {
        var run = n.runs[i];
        if (run.type !== 'image' || (run.askedW && run.askedH)) continue;
        pending.push({ node: n, run: run });
      }
    });
    if (!pending.length) return;

    var settled = 0;
    var changed = false;

    function done() {
      if (++settled < pending.length) return;
      if (!changed) return;
      eachNode(state.root, function (n) {
        measureNode(n, state.opts);
        redrawNodeBody(n);           // the box and label were sized for placeholders
      });
      syncTogglePositions(state.root);
      relayout(state, true);
    }

    pending.forEach(function (item) {
      var img = new global.Image();
      img.onload = function () {
        if (img.naturalWidth && img.naturalHeight) {
          item.run.natW = img.naturalWidth;
          item.run.natH = img.naturalHeight;
          changed = true;
        }
        done();
      };
      // A broken image keeps its placeholder rather than collapsing the node.
      img.onerror = function () { item.run.broken = true; done(); };
      img.src = item.run.src;
    });
  }

  /**
   * Re-reads and re-measures every embedded block, and re-draws the nodes
   * holding them. Needed whenever something the block depends on arrives late
   * — its own images, or a stylesheet — and after an author edits the source
   * element and asks for a refresh.
   *
   * The source is read again rather than the first copy re-measured, because
   * the edit an author makes is to the element they wrote, not to the copy
   * this map is holding. A source that has since been deleted keeps the copy
   * already drawn: a refresh should not blank a node.
   */
  function refreshEmbeds(state) {
    var container = state.container;
    if (!container || !container.parentNode) return false;

    var hostRef = { near: container.parentNode, el: null };
    var changed = false;
    var resized = false;

    try {
      eachNode(state.root, function (n) {
        if (!n.hasEmbed) return;
        var touched = false;
        var moved = false;
        for (var i = 0; i < n.runs.length; i++) {
          var run = n.runs[i];
          if (run.type !== 'embed' || !run.dom) continue;

          var fresh = embedSource(run.ref);
          if (fresh && fresh.innerHTML !== run.dom.innerHTML) {
            run.dom = fresh;
            run.plain = embedText(run);
            touched = true;
          }

          var before = run.w + 'x' + run.h;
          sizeEmbed(run, hostOf(hostRef), state.opts);
          if (before !== run.w + 'x' + run.h) { touched = true; moved = true; }
        }
        if (!touched) return;
        changed = true;
        if (moved) resized = true;
        n.plain = runsToText(n.runs);
        measureNode(n, state.opts);
        redrawNodeBody(n);
      });
    } finally {
      releaseHost(hostRef);
    }

    if (!changed) return false;

    // A branch names itself by its content, replaced content included.
    syncToggleState(state.root);

    if (!resized) return true;
    syncTogglePositions(state.root);
    relayout(state, false);
    return true;
  }

  /**
   * An embedded block containing its own images is measured before they load,
   * so its height is short until they arrive. One re-measure once the page has
   * finished loading catches that without watching every image.
   */
  function settleEmbeds(state) {
    var any = false;
    eachNode(state.root, function (n) { if (n.hasEmbed) any = true; });
    if (!any || document.readyState === 'complete') return;

    global.addEventListener('load', function once() {
      global.removeEventListener('load', once);
      refreshEmbeds(state);
    });
  }

  function toggleNode(state, node) {
    if (!node.children.length || node.depth === 0) return;
    node.collapsed = !node.collapsed;
    relayout(state, true);
  }

  /**
   * Re-arranges the map between the balanced (two-sided) and one-sided
   * shapes. Folded branches stay folded; drags are cleared, because a
   * position nudged into one arrangement means nothing in the other.
   */
  function setDirection(state, direction) {
    if (direction !== 'balanced' && direction !== 'right' && direction !== 'left') return false;
    if (direction === state.direction) return false;

    finishAnimation(state);
    state.direction = direction;
    eachNode(state.root, function (n) { n.dx = 0; n.dy = 0; });

    state.sides = assignSides(state.root, direction);
    syncTogglePositions(state.root);
    syncControls(state);
    relayout(state, true);
    return true;
  }

  function syncControls(state) {
    if (!state.controls) return;
    var buttons = state.controls.querySelectorAll('.mm-ctl');
    for (var i = 0; i < buttons.length; i++) {
      var on = buttons[i].getAttribute('data-dir') === state.direction;
      buttons[i].setAttribute('aria-checked', on ? 'true' : 'false');
      // One tab stop for the pair, landing on the shape in use; the arrow
      // keys move within it. That is how a radio group behaves, and stops a
      // page of maps costing two tab stops each.
      buttons[i].setAttribute('tabindex', on ? '0' : '-1');
      buttons[i].classList.toggle('mm-ctl-on', on);
    }
  }

  var DIRECTION_ICON = {
    balanced: 'M2 7h4M10 7h4M6 3.5h1.5M6 10.5h1.5M8.5 3.5H10M8.5 10.5H10' +
              'M6 3.5v7M10 3.5v7',
    right: 'M2 7h3M5 3.5h2M5 10.5h2M5 3.5v7M7 3.5h5M7 7h5M7 10.5h5'
  };

  /**
   * A two-way switch so the reader, not just the author, picks the shape.
   * The shapes are alternatives rather than two settings, so the buttons
   * share one outline and answer to the arrow keys as a radio group does.
   * Kept quiet until the map is hovered or focused, so a page full of
   * diagrams does not turn into a page full of buttons.
   */
  function buildControls(state, altDirection) {
    var bar = document.createElement('div');
    bar.className = 'mm-controls';

    var seg = document.createElement('div');
    seg.className = 'mm-seg';
    seg.setAttribute('role', 'radiogroup');
    seg.setAttribute('aria-label', 'Mind map shape');

    var buttons = [];

    // Moves to the neighbouring shape and picks it, which is what a radio
    // group does: for a pair, either arrow lands on the other one.
    function step(from, delta) {
      var i = buttons.indexOf(from);
      var next = buttons[(i + delta + buttons.length) % buttons.length];
      next.focus();
      setDirection(state, next.getAttribute('data-dir'));
    }

    [['balanced', 'Balanced', 'Branches on both sides'],
     [altDirection, 'One-sided', 'All branches on one side']
    ].forEach(function (spec) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'mm-ctl';
      b.setAttribute('role', 'radio');
      b.setAttribute('data-dir', spec[0]);
      b.title = spec[2];

      var icon = document.createElementNS(SVG_NS, 'svg');
      icon.setAttribute('class', 'mm-ctl-icon');
      icon.setAttribute('viewBox', '0 0 16 14');
      icon.setAttribute('aria-hidden', 'true');
      icon.appendChild(svgEl('path', {
        d: DIRECTION_ICON[spec[0] === 'balanced' ? 'balanced' : 'right'],
        fill: 'none', 'stroke-width': 1.3, 'stroke-linecap': 'round'
      }));
      if (spec[0] === 'left') icon.style.transform = 'scaleX(-1)';

      var text = document.createElement('span');
      text.textContent = spec[1];

      b.appendChild(icon);
      b.appendChild(text);
      b.addEventListener('click', function () { setDirection(state, spec[0]); });
      b.addEventListener('keydown', function (ev) {
        var delta = 0;
        if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') delta = 1;
        else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') delta = -1;
        else return;
        ev.preventDefault();      // or the page scrolls under the map
        step(this, delta);
      });
      seg.appendChild(b);
      buttons.push(b);
    });

    bar.appendChild(seg);
    return bar;
  }

  // How far the pointer must travel before a press counts as a drag rather
  // than a click. Below this, a slightly shaky click still toggles.
  var DRAG_THRESHOLD = 4;
  var NUDGE = 12;

  /**
   * Presses that belong to something other than a drag: the fold badge, and
   * any real control inside an embedded block. Capturing the pointer for these
   * would also retarget the click to the node as a whole, so the button they
   * landed on would never hear about it.
   */
  var NO_DRAG_FROM = '.mm-toggle,a[href],button,input,select,textarea,label,' +
    'summary,[contenteditable]';

  function attachDrag(state, node) {
    var el = node.el;
    var active = false, moved = false;
    var startX = 0, startY = 0, originDx = 0, originDy = 0, scale = 1;

    el.addEventListener('pointerdown', function (ev) {
      if (ev.button) return;                    // left button / touch / pen only
      if (ev.target.closest && ev.target.closest(NO_DRAG_FROM)) return;
      state.suppressClick = false;
      active = true;
      moved = false;
      startX = ev.clientX;
      startY = ev.clientY;
      originDx = node.dx || 0;
      originDy = node.dy || 0;

      // Screen pixels to user units, so the node tracks the cursor exactly.
      var box = state.svg.getBoundingClientRect();
      scale = box.width ? state.bounds.w / box.width : 1;

      if (el.setPointerCapture && ev.pointerId !== undefined) {
        try { el.setPointerCapture(ev.pointerId); } catch (e) { /* no live pointer */ }
      }
      ev.preventDefault();
    });

    el.addEventListener('pointermove', function (ev) {
      if (!active) return;
      var dx = ev.clientX - startX;
      var dy = ev.clientY - startY;
      if (!moved) {
        if (Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD) return;
        moved = true;
        el.classList.add('mm-dragging');
        finishAnimation(state);
      }
      node.dx = originDx + dx * scale;
      node.dy = originDy + dy * scale;
      // Canvas stays put mid-drag: resizing it would rescale the SVG and make
      // the node slide out from under the cursor.
      paint(state, state.bounds);
    });

    function release(ev) {
      if (!active) return;
      active = false;
      el.classList.remove('mm-dragging');
      if (el.releasePointerCapture && ev.pointerId !== undefined) {
        try { el.releasePointerCapture(ev.pointerId); } catch (e) { /* already gone */ }
      }
      if (moved) {
        state.suppressClick = true;       // don't let this drag toggle the node
        tweenBounds(state, boundsOf(state, state.size));
      }
    }

    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);

    // Without this a link inside a node would still fire after being dragged.
    el.addEventListener('click', function (ev) {
      if (!state.suppressClick) return;
      if (node.ctl === el) return;              // handled by the fold listener
      state.suppressClick = false;
      ev.preventDefault();
      ev.stopPropagation();
    }, true);
  }

  function nudge(state, node, dx, dy) {
    finishAnimation(state);
    node.dx = (node.dx || 0) + dx;
    node.dy = (node.dy || 0) + dy;
    paint(state, state.bounds);
    tweenBounds(state, boundsOf(state, state.size));
  }

  function attachInteraction(state) {
    var root = state.root;

    /** Arrow keys move whichever node has focus. */
    function attachArrowKeys(n) {
      n.el.addEventListener('keydown', function (ev) {
        if (!state.opts.draggable) return;
        var step = ev.shiftKey ? 2 : NUDGE;
        if (ev.key === 'ArrowLeft') { ev.preventDefault(); nudge(state, n, -step, 0); }
        else if (ev.key === 'ArrowRight') { ev.preventDefault(); nudge(state, n, step, 0); }
        else if (ev.key === 'ArrowUp') { ev.preventDefault(); nudge(state, n, 0, -step); }
        else if (ev.key === 'ArrowDown') { ev.preventDefault(); nudge(state, n, 0, step); }
      });
    }

    eachNode(root, function (n) {
      var isRoot = n.depth === 0;
      var togglable = !isRoot && n.children.length > 0;

      if (n.hasEmbed) n.el.classList.add('mm-has-embed');

      if (state.opts.draggable) {
        n.el.classList.add('mm-draggable');
        attachDrag(state, n);
      }

      if (isRoot) {
        // No toggle to press, but it can still be focused and nudged.
        if (state.opts.draggable) {
          n.el.setAttribute('tabindex', '0');
          n.el.setAttribute('aria-label',
            (n.plain || n.label) + ', centre node; arrow keys move it');
          attachArrowKeys(n);
        }
        return;
      }

      if (!togglable) return;

      // A node holding embedded HTML is content to be read and used, so a
      // click anywhere in it must not fold the branch away. Its +/- badge
      // becomes the only thing that folds it, and the button role goes there
      // too — a button wrapped around a table reads badly to a screen reader.
      var byBadge = n.hasEmbed && n.toggleEl;
      n.ctl = byBadge ? n.toggleEl : n.el;

      if (!byBadge) n.el.classList.add('mm-interactive');
      n.ctl.setAttribute('tabindex', '0');
      n.ctl.setAttribute('role', 'button');

      n.ctl.addEventListener('click', function (ev) {
        // A drag that ended on this node must neither fold it nor follow a link.
        if (state.suppressClick) {
          state.suppressClick = false;
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
        // Let a real link click through untouched.
        if (ev.target.closest && ev.target.closest('a')) return;
        ev.preventDefault();
        ev.stopPropagation();
        toggleNode(state, n);
      });

      n.ctl.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') {
          ev.preventDefault();
          toggleNode(state, n);
        }
      });
      attachArrowKeys(n);
    });

    syncToggleState(root);
  }

  /** A plain nested list, hidden visually, so screen readers get the content. */
  function buildOutline(root) {
    var wrap = document.createElement('div');
    wrap.className = 'mm-a11y';

    /** Mirrors a label's runs as plain DOM, keeping links usable. */
    function fillLabel(el, node) {
      var runs = node.runs || [textRun(node.label, {})];
      for (var i = 0; i < runs.length; i++) {
        var run = runs[i];
        // Embedded HTML is already real content in the page, so the outline
        // only needs to name it rather than repeat it to a screen reader.
        var text = run.type === 'image' ? (run.alt || '') :
                   run.type === 'embed' ? (run.alt || '') :
                   run.type === 'break' ? ' ' : run.text;
        if (!text) continue;
        if (run.href) {
          var a = document.createElement('a');
          a.href = run.href;
          a.textContent = text;
          // The outline is a one-pixel clipped copy, so a tab stop in here is
          // a focus ring nobody can see landing on a link nobody can read.
          // The same link in the drawing is focusable and visible; a screen
          // reader still reaches this one through the outline itself.
          a.setAttribute('tabindex', '-1');
          el.appendChild(a);
        } else {
          el.appendChild(document.createTextNode(text));
        }
      }
    }

    (function build(node, parent) {
      var ul = document.createElement('ul');
      for (var i = 0; i < node.children.length; i++) {
        var li = document.createElement('li');
        fillLabel(li, node.children[i]);
        if (node.children[i].children.length) build(node.children[i], li);
        ul.appendChild(li);
      }
      parent.appendChild(ul);
    })(root, wrap);

    var heading = document.createElement('p');
    fillLabel(heading, root);
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
    '--mm-code-bg:#eceff2;--mm-code-text:#8a3033;',
    '--mm-link:#2563a8;--mm-link-hover:#17406e;',
    'display:block;margin:1.25em 0;',
    // min-width:0 stops the SVG's own min-width from blowing out a flex or
    // grid track on the host page.
    'min-width:0;max-width:100%;',
    'font-family:' + FONT_STACK + ';}',

    // Only the drawing scrolls. Controls sit outside it so a wide map cannot
    // push them off the visible area.
    '.mm-scroll{display:block;overflow-x:auto;min-width:0;max-width:100%;}',

    '.mm-svg{display:block;width:100%;height:auto;}',

    '.mm-node{--mm-accent:var(--mm-a);}',
    '.mm-box{fill:var(--mm-surface);stroke:var(--mm-accent);stroke-width:1.1;}',
    '.mm-label{fill:var(--mm-text);}',
    '.mm-label text{fill:inherit;}',
    '.mm-code{fill:var(--mm-code-text);}',
    '.mm-code-chip{fill:var(--mm-code-bg);}',
    '.mm-link .mm-link-text,.mm-link-text{fill:var(--mm-link);',
    'text-decoration:underline;text-underline-offset:2px;}',
    '.mm-link{cursor:pointer;}',
    '.mm-link:hover .mm-link-text{fill:var(--mm-link-hover);}',
    '.mm-image{pointer-events:none;}',

    // --- embedded HTML ---
    // Authors park the source of an embed in one of these; both keep it off
    // the page without the author needing any CSS of their own.
    '.mm-source{display:none!important;}',
    // Measurement overrides display to inline-block so the block shrinks to
    // fit; once drawn it fills the box that measurement produced.
    // Deliberately no colour here: the block should look exactly as it does on
    // the page, and a map theme forced onto author-styled content fights it.
    '.mm-embed{display:block;box-sizing:border-box;overflow:auto;',
    'font-size:12.5px;line-height:1.45;text-align:left;}',
    '.mm-embed-body{display:block;}',
    '.mm-embed-host{overflow:visible;}',
    // The block is content to read rather than a button, so it keeps a normal
    // cursor even though the node around it can still be dragged.
    '.mm-has-embed{cursor:default;}',
    '.mm-has-embed .mm-embed{cursor:auto;}',
    '.mm-toggle:focus-visible{outline:none;}',
    '.mm-toggle:focus-visible .mm-toggle-bg{stroke:var(--mm-root-bg);stroke-width:2.4;}',

    '.mm-d1 .mm-box{fill:var(--mm-surface);',
    'fill:color-mix(in srgb, var(--mm-accent) 11%, var(--mm-surface));',
    'stroke-width:1.6;}',
    '.mm-d2 .mm-box{fill:var(--mm-surface);',
    'fill:color-mix(in srgb, var(--mm-accent) 5%, var(--mm-surface));}',
    '.mm-d3 .mm-label{fill:var(--mm-muted);}',

    '.mm-root .mm-box{fill:var(--mm-root-bg);stroke:var(--mm-root-bg);stroke-width:1.5;}',
    '.mm-root .mm-label{fill:var(--mm-root-text);}',
    '.mm-root .mm-code{fill:var(--mm-root-text);}',
    '.mm-root .mm-code-chip{fill:rgba(127,127,127,.35);}',
    '.mm-root .mm-link-text{fill:var(--mm-root-text);}',

    '.mm-edge{--mm-accent:var(--mm-a);fill:none;stroke:var(--mm-accent);',
    'stroke-linecap:round;opacity:.85;}',

    // --- shape switch ---
    '.mm-controls{display:flex;justify-content:flex-end;',
    'margin:0 0 3px;opacity:.4;transition:opacity .15s ease;}',
    '.mm-container:hover .mm-controls,.mm-controls:focus-within{opacity:1;}',
    // The two shapes are alternatives, so they share one outline: separate
    // buttons read as two independent settings that happen to be adjacent.
    '.mm-seg{display:inline-flex;align-items:stretch;overflow:hidden;',
    'border:1px solid color-mix(in srgb, var(--mm-muted) 35%, transparent);',
    'border-radius:5px;background:var(--mm-surface);}',
    '.mm-container:hover .mm-seg,.mm-seg:focus-within',
    '{border-color:var(--mm-muted);}',
    '.mm-ctl{display:inline-flex;align-items:center;gap:4px;',
    'font:inherit;font-size:11px;line-height:1;color:var(--mm-muted);',
    'background:none;border:0;padding:3.5px 7px;cursor:pointer;}',
    // The divider tracks the outline, so the pill reads as one object.
    '.mm-ctl+.mm-ctl{border-left:1px solid ',
    'color-mix(in srgb, var(--mm-muted) 35%, transparent);}',
    '.mm-container:hover .mm-ctl+.mm-ctl,.mm-seg:focus-within .mm-ctl+.mm-ctl',
    '{border-left-color:var(--mm-muted);}',
    '.mm-ctl:hover{color:var(--mm-text);}',
    // Inset, because an outline outside the button would fall outside the
    // pill that clips it.
    '.mm-ctl:focus-visible{outline:2px solid var(--mm-root-bg);outline-offset:-2px;}',
    '.mm-ctl-icon{width:16px;height:14px;stroke:currentColor;flex:none;}',
    '.mm-ctl-on{color:var(--mm-text);',
    'background:color-mix(in srgb, var(--mm-muted) 15%, transparent);}',
    // --- drag ---
    // pan-y, not none: on a phone a map can fill the screen, and a finger
    // landing on a node still has to be able to scroll the page past it. The
    // browser keeps vertical swipes and hands us everything else, which is
    // enough to drag by.
    '.mm-draggable{cursor:grab;touch-action:pan-y;}',
    '.mm-dragging{cursor:grabbing;}',
    '.mm-dragging .mm-box{filter:brightness(.94);}',
    '.mm-svg{overflow:visible;}',

    // --- collapse / expand ---
    '.mm-interactive{cursor:pointer;}',
    '.mm-interactive .mm-box{transition:filter .12s ease;}',
    '.mm-interactive:hover .mm-box{filter:brightness(.97);}',
    '.mm-interactive:focus,.mm-draggable:focus{outline:none;}',
    '.mm-interactive:focus-visible .mm-box,.mm-draggable:focus-visible .mm-box',
    '{stroke:var(--mm-root-bg);stroke-width:2.4;}',
    '.mm-interactive:focus-visible .mm-toggle-bg{stroke-width:2.4;}',

    '.mm-toggle{cursor:pointer;}',
    '.mm-toggle-bg{fill:var(--mm-surface);stroke:var(--mm-accent);stroke-width:1.3;}',
    '.mm-toggle-sign{stroke:var(--mm-accent);stroke-width:1.7;stroke-linecap:round;}',
    // The vertical bar is what turns the minus into a plus.
    '.mm-toggle-v{display:none;}',
    '.mm-collapsed .mm-toggle-v{display:inline;}',
    '.mm-collapsed .mm-toggle-bg{fill:var(--mm-accent);}',
    '.mm-collapsed .mm-toggle-sign{stroke:var(--mm-surface);}',

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
      '--mm-root-bg:#2c3e50;--mm-root-text:#ffffff;' +
      '--mm-code-bg:#eceff2;--mm-code-text:#8a3033;' +
      '--mm-link:#2563a8;--mm-link-hover:#17406e;';
  }
  function darkVars() {
    return '--mm-surface:#1b2027;--mm-text:#e4e9ef;--mm-muted:#a7b3c0;' +
      '--mm-root-bg:#dfe6ee;--mm-root-text:#161b22;' +
      '--mm-code-bg:#2b333d;--mm-code-text:#f0a8a2;' +
      '--mm-link:#7fb0e0;--mm-link-hover:#a9cbee;';
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

    /**
     * parseFloat, with Infinity treated as the typo it is. NaN comes back for
     * anything unusable, and fails every comparison below — which is how a
     * value the layout cannot work with falls back to its default instead of
     * reaching the drawing as a viewBox of "0 0 Infinity 63".
     */
    function number(name) {
      var n = parseFloat(attr(name));
      return isFinite(n) ? n : NaN;
    }

    var opts = {
      direction: DEFAULTS.direction,
      maxNodeWidth: DEFAULTS.maxNodeWidth,
      columnGap: DEFAULTS.columnGap,
      padding: DEFAULTS.padding,
      embedMaxWidth: DEFAULTS.embedMaxWidth
    };

    var dir = attr('data-direction');
    if (dir === 'right' || dir === 'left' || dir === 'balanced') opts.direction = dir;

    var width = number('data-max-node-width');
    if (width > 40 && width <= MAX_LENGTH) opts.maxNodeWidth = width;

    var gap = number('data-column-gap');
    if (gap >= 0 && gap <= MAX_LENGTH) opts.columnGap = gap;

    var embedWidth = number('data-embed-max-width');
    if (embedWidth > 40 && embedWidth <= MAX_LENGTH) opts.embedMaxWidth = embedWidth;

    var theme = attr('data-theme');
    if (theme === 'light' || theme === 'dark') opts.theme = theme;

    opts.interactive = attr('data-interactive') !== 'false';
    opts.draggable = opts.interactive && attr('data-draggable') !== 'false';
    opts.controls = opts.interactive && attr('data-controls') !== 'false';
    opts.markup = attr('data-markup') !== 'false';

    var level = parseInt(attr('data-collapse-level'), 10);
    if (level > 0) opts.collapseLevel = level;

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

    // Embeds are measured next to where the map will land, so the page's own
    // CSS applies. Created only if the map actually has one.
    var hostRef = { near: target.parentNode, el: null };

    try {
      var opts = readOptions(optionSources);
      if (opts.theme) container.setAttribute('data-theme', opts.theme);

      var root = parse(source);
      measureTree(root, opts, hostRef);

      if (opts.collapseLevel > 0) {
        eachNode(root, function (n) {
          if (n.depth >= opts.collapseLevel && n.children.length) n.collapsed = true;
        });
      }

      // The left/right split is fixed once, from the fully expanded tree, so
      // collapsing never shuffles branches across the root.
      var sides = assignSides(root, opts.direction);
      markVisible(root);
      var size = layout(root, opts, sides);
      eachNode(root, function (n) {
        n.ax = n.x; n.acy = n.cy; n.fade = n.vis ? 1 : 0;
      });

      var svg = buildSvg(root, size, opts);
      var scroller = document.createElement('div');
      scroller.className = 'mm-scroll';
      scroller.appendChild(svg);
      container.appendChild(scroller);
      container.appendChild(buildOutline(root));

      var state = {
        root: root, opts: opts, sides: sides, size: size, svg: svg,
        direction: opts.direction, container: container
      };
      paint(state, sizeBounds(size));
      if (opts.interactive) attachInteraction(state);
      loadImages(state);
      settleEmbeds(state);

      if (opts.controls) {
        // A one-sided author default keeps its own side as the alternative.
        var alt = opts.direction === 'left' ? 'left' : 'right';
        state.controls = buildControls(state, alt);
        container.insertBefore(state.controls, scroller);
        syncControls(state);
      }

      container.mindMap = state;
    } catch (err) {
      if (!(err instanceof MindMapError)) throw err;
      container.appendChild(buildError(err, source));
    } finally {
      releaseHost(hostRef);
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
      var scroller = container.querySelector('.mm-scroll') || container;
      var svg = scroller.querySelector('.mm-svg');
      if (!svg) return;
      var overflow = scroller.scrollWidth - scroller.clientWidth;
      if (overflow <= 0) return;

      var rootRect = svg.querySelector('.mm-root rect');
      if (!rootRect) return;

      var scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
      var centre = (parseFloat(rootRect.getAttribute('x')) +
                    parseFloat(rootRect.getAttribute('width')) / 2) * scale;

      scroller.scrollLeft = Math.max(0, Math.min(overflow, centre - scroller.clientWidth / 2));
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
      try {
        out.push(render(sources[j]));
      } catch (err) {
        // A map that fails in a way render() never anticipated must not take
        // the rest of the page down with it: the maps further down are someone
        // else's section, and leaving them as raw indented text is a far more
        // visible failure than one error box.
        if (global.console && global.console.error) {
          global.console.error('Mind map could not be drawn:', err);
        }
        if (targets[j].parentNode) {
          targets[j].parentNode.replaceChild(unexpectedError(), targets[j]);
        }
      }
    }
    return out;
  }

  /** Stands in for a map that failed for a reason the reader cannot act on. */
  function unexpectedError() {
    var container = document.createElement('div');
    container.className = 'mm-container';
    container.setAttribute('data-mindmap-rendered', '');
    container.appendChild(buildError(new MindMapError(
      'Something went wrong while drawing this mind map. The details are in ' +
      'the browser console.'), ''));
    return container;
  }

  function boot() {
    // Wait for webfonts where possible: text measurement drives box sizes.
    if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
      document.fonts.ready.then(function () { renderAll(); }, function () { renderAll(); });
    } else {
      renderAll();
    }
  }

  // Injected now rather than at first render, so `.mm-source` hides an embed's
  // source element before the page ever paints it.
  injectStyles();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /** Expands or collapses every branch of a rendered map. */
  function stateOf(el) {
    if (!el) return null;
    var container = el.closest ? el.closest('.mm-container') : null;
    if (!container && el.querySelector) container = el.querySelector('.mm-container');
    return (container && container.mindMap) || el.mindMap || null;
  }

  function setAllCollapsed(el, collapsed) {
    var state = stateOf(el);
    if (!state) return false;
    eachNode(state.root, function (n) {
      if (n.depth > 0 && n.children.length) n.collapsed = collapsed;
    });
    relayout(state, true);
    return true;
  }

  /** Undoes every drag on a rendered map, returning nodes to their layout. */
  function resetPositions(el) {
    var state = stateOf(el);
    if (!state) return false;
    finishAnimation(state);
    eachNode(state.root, function (n) { n.dx = 0; n.dy = 0; });
    paint(state, state.bounds);
    tweenBounds(state, boundsOf(state, state.size));
    return true;
  }

  global.MindMap = {
    version: VERSION,
    parse: parse,
    render: render,
    renderAll: renderAll,
    expandAll: function (el) { return setAllCollapsed(el, false); },
    collapseAll: function (el) { return setAllCollapsed(el, true); },
    resetPositions: resetPositions,
    refresh: function (el) {
      var state = stateOf(el);
      return state ? refreshEmbeds(state) : false;
    },
    setDirection: function (el, dir) {
      var state = stateOf(el);
      return state ? setDirection(state, dir) : false;
    },
    palette: PALETTE
  };
})(typeof window !== 'undefined' ? window : this);
