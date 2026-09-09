// The assertions over the rendered DOM. Kept out of tests.html so that the page
// stays what it is best at being — a gallery of maps a reader can look at — and
// so that a fixture and the check that reads it are not competing for the same
// screen. Fixtures are reached by id, never by their position on the page.
// Minimal assertions over the rendered DOM.
// Errors inside timer callbacks are otherwise silent and just leave the page
// stuck on "running...", so surface them loudly.
window.addEventListener('error', function (e) {
  var box = document.getElementById('results');
  box.innerHTML = '<span class="fail">ERROR ' + e.message + ' @ ' +
    (e.filename || '?') + ':' + e.lineno + '</span><br>' + box.innerHTML;
});

window.addEventListener('load', function () {
  setTimeout(runChecks, 250);

  function runChecks() {
    var out = [];
    var fails = 0;
    /**
     * Asynchronous groups register themselves here and report back through the
     * function they are handed. The count used to be written out by hand, which
     * was a standing trap in both directions: a group added without touching the
     * number let the suite finish while that group's checks were still
     * outstanding — reading as a clean pass over checks that had never run — and
     * a group that forgot to report left the page on "running…" for ever.
     */
    var open = [];
    var registered = false;   // true once every group has been reached
    function group(name) {
      open.push(name);
      var settled = false;
      return function done() {
        // A group with two exits — the real-pointer lane either skips or runs —
        // must release the suite once, whichever exit it takes.
        if (settled) return;
        settled = true;
        var at = open.indexOf(name);
        if (at > -1) open.splice(at, 1);
        if (registered && !open.length) finish();
      };
    }

    function check(n, label, ok) {
      if (!ok) fails++;
      out.push({ n: n, html: '<span class="' + (ok ? 'pass' : 'fail') + '">' +
               (ok ? 'PASS' : 'FAIL') + ' ' + n + ' ' + label + '</span>' });
    }

    /**
     * A check that could not be run at all, as against one that failed. Kept
     * out of the pass count and named in the summary, so a lane that quietly
     * did nothing cannot read as a lane that passed.
     */
    var skipped = 0;
    function skip(n, label, why) {
      skipped++;
      out.push({ n: n, html: '<span class="skip">SKIP ' + n + ' ' + label +
               ' — ' + why + '</span>' });
    }

    function boxRect(g) {
      var m = /translate\(([-\d.]+),([-\d.]+)\)/.exec(g.getAttribute('transform')) || [0, 0, 0];
      var r = g.querySelector('rect');
      return { x: parseFloat(m[1]), y: parseFloat(m[2]),
               w: parseFloat(r.getAttribute('width')), h: parseFloat(r.getAttribute('height')) };
    }

    /**
     * The contrast ratio between two `rgb(...)` colours, as WCAG states it.
     * Written out here rather than reached for inside the library, so a ring
     * that reads only because the two of them share a mistake is not one this
     * suite would call visible.
     */
    function contrast(a, b) {
      function light(colour) {
        var p = /(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(colour);
        var weights = [0.2126, 0.7152, 0.0722];
        var total = 0;
        for (var i = 0; i < 3; i++) {
          var c = +p[i + 1] / 255;
          total += weights[i] * (c <= 0.03928 ? c / 12.92
                                              : Math.pow((c + 0.055) / 1.055, 2.4));
        }
        return total;
      }
      var hi = light(a), lo = light(b);
      if (hi < lo) { var swap = hi; hi = lo; lo = swap; }
      return (hi + 0.05) / (lo + 0.05);
    }

    /** Whether a centre node's focus ring can be seen against its own fill. */
    function readable(root) {
      return contrast(
        getComputedStyle(root.querySelector('.mm-root-ring')).stroke,
        getComputedStyle(root.querySelector('.mm-box')).fill) >= 4.5;
    }

    /**
     * Whether every drawn curve in one map starts on its parent's outward edge
     * and finishes on its child's inward one, both at the box's vertical
     * centre. Read off the path rather than recomputed, because a layout that
     * placed every box correctly and drew the curves from the wrong corners
     * passes every count and overlap check in the suite.
     */
    function edgesMeetBoxes(map) {
      var state = map.mindMap;
      if (!state) return false;
      var ok = true;
      (function walk(node) {
        for (var i = 0; i < node.children.length; i++) {
          var child = node.children[i];
          if (child.edge && child.edge.style.display !== 'none') {
            var d = /^M([^,]+),([^ ]+) C[^ ]+ [^ ]+ ([^,]+),(.+)$/.exec(
              child.edge.getAttribute('d'));
            if (!d) ok = false;
            else {
              var p = boxRect(node.el), k = boxRect(child.el);
              var outward = (k.x + k.w / 2) > (p.x + p.w / 2);
              var want = [outward ? p.x + p.w : p.x, p.y + p.h / 2,
                          outward ? k.x : k.x + k.w, k.y + k.h / 2];
              for (var j = 0; j < 4; j++) {
                // The transforms are rounded to two places and the path is not,
                // so they meet to within half of the last place kept.
                if (Math.abs(parseFloat(d[j + 1]) - want[j]) > 0.02) ok = false;
              }
            }
          }
          walk(child);
        }
      })(state.root);
      return ok;
    }

    /** Whether a selector list names `wanted` among its alternatives. */
    function claims(list, wanted) {
      var parts = String(list).split(',');
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].replace(/^\s+|\s+$/g, '') === wanted) return true;
      }
      return false;
    }

    /**
     * What a rule inside a media block declares for one property, or '' when
     * there is no such rule. Several of the states this suite cares about
     * cannot be entered to be measured in — a page cannot be asked to print,
     * and a tab that reports a pointer cannot be asked to stop reporting one —
     * so for those the declaration is the whole of what there is to check.
     */
    function declaredIn(media, selector, prop) {
      var blocks = mediaBlocks(media);
      var value = '';
      for (var i = 0; i < blocks.length; i++) {
        var rules = blocks[i].cssRules;
        for (var j = 0; j < rules.length; j++) {
          var rule = rules[j];
          if (!rule.selectorText || !claims(rule.selectorText, selector)) continue;
          var declared = rule.style.getPropertyValue(prop);
          if (declared) value = declared;
        }
      }
      return value;
    }

    /** The injected media blocks whose query mentions `media`. */
    function mediaBlocks(media) {
      var sheet = document.getElementById('mind-maps-helper-styles').sheet;
      var found = [];
      for (var i = 0; i < sheet.cssRules.length; i++) {
        var group = sheet.cssRules[i];
        if (group.media && group.media.mediaText.indexOf(media) > -1) found.push(group);
      }
      return found;
    }

    /**
     * What the page computes when a media block it cannot be made to match is
     * widened to match everything. The legibility preferences and reduced
     * motion are the reader's own settings, so the rules answering them would
     * otherwise only ever be read off the sheet rather than seen to reach a
     * drawn map. Restored in a finally: a sheet left widened would quietly
     * rewrite every check after this one.
     */
    function underMedia(media, read) {
      var blocks = mediaBlocks(media);
      if (!blocks.length) return null;
      var wanted = blocks[0].media.mediaText;
      try {
        blocks[0].media.mediaText = 'all';
        return read();
      } finally {
        blocks[0].media.mediaText = wanted;
      }
    }

    /**
     * Whether the injected sheet drops `selector` from a printed page. What
     * this still catches, for all that it reads a declaration rather than a
     * printed page: the rule dropped, or aimed at a selector nothing carries.
     */
    function printHides(selector) {
      return declaredIn('print', selector, 'display') === 'none';
    }

    // ---- reaching a fixture
    //
    // By name, never by position. These used to index the live `.case`
    // NodeList, so inserting a fixture anywhere near the top quietly pointed a
    // dozen later assertions at the wrong map — no syntax error, no clue in the
    // failure. Every fixture carries an id; that id is its identity, and the
    // heading numbers are only for reading.

    /** A fixture by id, or an element passed straight through. */
    function scopeOf(where) {
      var el = typeof where === 'string' ? document.getElementById(where) : where;
      if (!el) throw new Error('no fixture named "' + where + '"');
      return el;
    }

    function svgOf(where) { return scopeOf(where).querySelector('.mm-svg'); }
    function boxes(where) { return scopeOf(where).querySelectorAll('.mm-box'); }
    function errOf(where) { return scopeOf(where).querySelector('.mm-error'); }
    function nodesIn(where) {
      return Array.prototype.slice.call(scopeOf(where).querySelectorAll('.mm-node'));
    }
    function labels(where) {
      return Array.prototype.map.call(
        scopeOf(where).querySelectorAll('.mm-label'),
        function (t) { return t.textContent; });
    }

    /** The labels of the nodes a fold has left on screen. */
    function visibleLabels(where) {
      return nodesIn(where).filter(function (g) {
        return g.style.display !== 'none';
      }).map(function (g) { return g.querySelector('.mm-label').textContent; });
    }

    /** Every node whose label is exactly `label`. */
    function nodesNamed(where, label) {
      return nodesIn(where).filter(function (g) {
        return g.querySelector('.mm-label').textContent === label;
      });
    }

    /** The first node whose label is exactly `label`. */
    function nodeIn(where, label) { return nodesNamed(where, label)[0]; }

    /**
     * The node whose label merely contains `part` — separate from nodeIn on
     * purpose. Five copies of this helper had drifted into two different
     * contracts, and which one a group got was a matter of where it sat.
     */
    function nodeMatching(where, part) {
      return nodesIn(where).filter(function (g) {
        return g.querySelector('.mm-label').textContent.indexOf(part) > -1;
      })[0];
    }

    /** Where a node is drawn, read off its transform. */
    function posOf(g) {
      var m = /translate\(([-\d.]+),([-\d.]+)\)/.exec(g.getAttribute('transform'));
      return { x: parseFloat(m[1]), y: parseFloat(m[2]) };
    }

    /**
     * A pointer-event dispatcher bound to one pointerId. Groups keep their own
     * ids rather than sharing one: to the library, two groups on the same id
     * are one finger in two places at once.
     */
    function pointerFor(id) {
      return function (el, type, x, y) {
        el.dispatchEvent(new PointerEvent(type, {
          bubbles: true, cancelable: true, pointerId: id, clientX: x, clientY: y, button: 0
        }));
      };
    }

    // ---- waiting for a map to stop moving

    var WAIT_LIMIT = 5000;

    /**
     * Polls `ready` until it holds, then runs `cb` — and runs `cb` anyway once
     * WAIT_LIMIT is up, so a condition that never comes true fails its own
     * check rather than stalling the whole suite behind it.
     */
    function until(ready, cb) {
      var started = Date.now();
      setTimeout(function poll() {
        if (ready() || Date.now() - started > WAIT_LIMIT) cb();
        else setTimeout(poll, 16);
      }, 0);
    }

    function mapState(where) {
      var el = scopeOf(where);
      var box = el.mindMap ? el : el.querySelector('.mm-container');
      return box ? box.mindMap : null;
    }

    /**
     * Runs `cb` once the map has finished the re-layout it is in the middle of.
     * Groups used to wait out a fixed 420ms — ANIM_MS plus a margin, a constant
     * from mindmap.js copied into the suite where nothing could keep it honest.
     * Changing the animation timing would have made the suite flaky rather than
     * red. Reading the state the animation itself clears is both exact and
     * quicker: under reduced motion there is nothing to wait for at all.
     */
    function settled(where, cb) {
      until(function () {
        var st = mapState(where);
        return !st || !st.animation.frame;
      }, cb);
    }

    /** True once every image in the map has measured or given up on loading. */
    function imagesResolved(where) {
      var st = mapState(where);
      if (!st) return false;
      var all = true;
      (function walk(n) {
        for (var i = 0; i < n.runs.length; i++) {
          var run = n.runs[i];
          if (run.type !== 'image' || (run.askedW && run.askedH)) continue;
          if (!run.natW && !run.broken) all = false;
        }
        for (var j = 0; j < n.children.length; j++) walk(n.children[j]);
      })(st.root);
      return all;
    }

    // The heading numbers are for the reader, not for the assertions — those
    // reach a fixture by id. They are still worth keeping in order, since a
    // reader matching a failure to a map on the page goes by them, and an id is
    // what makes that possible at all.
    (function () {
      var numbered = Array.prototype.filter.call(document.querySelectorAll('h2'),
        function (h) { return /^\d+\./.test(h.textContent); });
      var inOrder = numbered.every(function (h, i) {
        return parseInt(h.textContent, 10) === i + 1;
      });
      var everyCaseNamed = Array.prototype.every.call(
        document.querySelectorAll('.case'), function (c) { return !!c.id; });
      check(202, 'the cases are numbered in order and every one has an id',
        numbered.length > 0 && inOrder && everyCaseNamed);
    })();

    check(1, 'single node -> 1 box', boxes('single').length === 1);
    check(2, 'root+child -> 2 boxes, 1 edge',
      boxes('one-child').length === 2 &&
      scopeOf('one-child').querySelectorAll('.mm-edge').length === 1);

    // Case 3: two branches, one each side of the root.
    (function () {
      var svg = svgOf('two-branches');
      var rootX = boxRect(svg.querySelector('.mm-root')).x;
      var xs = [];
      Array.prototype.forEach.call(svg.querySelectorAll('.mm-node'), function (g) {
        if (!g.classList.contains('mm-root')) xs.push(boxRect(g).x);
      });
      check(3, 'branches straddle the root',
        xs.length === 2 && xs.some(function (x) { return x < rootX; })
                        && xs.some(function (x) { return x > rootX; }));
    })();

    check(4, 'uneven: 10 boxes', boxes('uneven').length === 10);

    // Case 4: the split goes by leaf count, so the six-leaf branch outweighs
    // the two branches under it put together and crosses on its own. Asserting
    // the partition rather than the box count, because a refactor that put
    // every branch on one side would still draw ten boxes.
    (function () {
      var svg = svgOf('uneven');
      var root = boxRect(svg.querySelector('.mm-root'));
      function sideOf(name) {
        var g = Array.prototype.filter.call(svg.querySelectorAll('.mm-node'), function (n) {
          return n.querySelector('.mm-label').textContent === name;
        })[0];
        if (!g) return 'missing';
        var r = boxRect(g);
        return r.x >= root.x + root.w ? 'right' :
               r.x + r.w <= root.x ? 'left' : 'astride';
      }
      check(158, 'the heavy branch outweighs both light ones and crosses alone',
        sideOf('Heavy') === 'right' && sideOf('a') === 'right' && sideOf('f') === 'right' &&
        sideOf('Light') === 'left' && sideOf('Also light') === 'left');
    })();

    // Every map on the page, not one fixture: the curves are what a reader
    // follows, and nothing else in the suite looks at where they land.
    (function () {
      var maps = Array.prototype.filter.call(
        document.querySelectorAll('.mm-container'),
        function (map) { return !!map.mindMap; });
      check(159, 'every curve meets its two boxes, in every map on the page',
        maps.length >= 40 && maps.every(edgesMeetBoxes));
    })();

    // A named centre survives the two things that could take it away: a theme
    // pinned against the machine's own, since the colour is inline on the node
    // and the theme's is not; and the shape switch, which is the one re-render
    // that re-runs `assignSides` and could plausibly repaint the centre with
    // it. Placed after check 159 so the switch below cannot leave a map
    // mid-animation while that one walks every map on the page.
    (function () {
      var done = group('a named centre through a re-layout');
      var host = document.getElementById('rootcolourdark');
      var container = host.querySelector('.mm-container');
      function colours() {
        var root = container.querySelector('.mm-root');
        return getComputedStyle(root.querySelector('.mm-box')).fill + ' / ' +
               getComputedStyle(root.querySelector('.mm-label')).fill;
      }
      var pinned = colours();
      MindMap.setDirection(container, 'right');
      settled('rootcolourdark', function () {
        check(214, 'a named centre keeps its colours in a pinned theme, and ' +
          'through the shape switch',
          pinned === 'rgb(111, 192, 207)' + ' / ' + 'rgb(22, 27, 34)' &&
          colours() === pinned);
        done();
      });
    })();
    check(5, 'deep nesting: 7 boxes', boxes('deep').length === 7);

    // Case 6: no two boxes overlap.
    (function () {
      var rects = Array.prototype.map.call(
        scopeOf('tall-short').querySelectorAll('.mm-node'), boxRect);
      var overlap = false;
      for (var i = 0; i < rects.length; i++) {
        for (var j = i + 1; j < rects.length; j++) {
          var a = rects[i], b = rects[j];
          if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
            overlap = true;
          }
        }
      }
      check(6, 'no overlapping boxes', !overlap);
    })();

    check(7, 'mixed indent: 5 boxes', boxes('mixed-indent').length === 5);
    (function () {
      var l = labels('bullets');
      check(8, 'bullets stripped, comment dropped',
        l.length === 5 &&
        l.indexOf('Bulleted root') > -1 && l.indexOf('Star bullet') > -1 &&
        l.indexOf('Plus bullet') > -1 && l.indexOf('Nested dash') > -1 &&
        l.join('|').indexOf('comment') === -1);
    })();
    check(9, 'indented source: 4 boxes', boxes('indented-source').length === 4);

    (function () {
      var multiline = Array.prototype.some.call(
        scopeOf('long-labels').querySelectorAll('.mm-label'),
        function (label) {
          var ys = {};
          Array.prototype.forEach.call(label.querySelectorAll('text'), function (t) {
            ys[t.getAttribute('y')] = 1;
          });
          return Object.keys(ys).length > 1;
        });
      check(10, 'long label wraps to >1 line', multiline);
    })();

    // --- one left edge down a wrapped label ---
    //
    // Lines used to be centred within their box, which started every line of a
    // wrapped label at a different x. What is read below is the edge itself: a
    // common inset, an inset that is the padding an unwrapped node already
    // gets, and a centre node held to the same rule as the branches.
    (function () {
      /**
       * Each line of a label, as the x its ink starts at and the x it ends at.
       * Lines are told apart by baseline, which every <text> on one line
       * shares.
       *
       * A code chip is the reason this reads more than the text. The chip is
       * drawn at the line's origin and its text a padding inside that, so a
       * line led by a chip has text 3.5px further right than a line led by a
       * word — and read off the <text> alone the two would look misaligned
       * while the drawn edge was straight. What stands on the edge is the
       * leftmost thing drawn, chip or word.
       */
      function linesOf(g) {
        var byBaseline = {};
        Array.prototype.forEach.call(
          g.querySelectorAll('.mm-label text'), function (t) {
            var y = t.getAttribute('y');
            var x = parseFloat(t.getAttribute('x'));
            var line = byBaseline[y] || (byBaseline[y] = { start: x, end: x });
            line.start = Math.min(line.start, x);
            line.end = Math.max(line.end, x + t.getComputedTextLength());
          });

        // A chip belongs to the line whose baseline it encloses — read that way
        // rather than from the ratios the drawing sizes it by, so the check
        // does not break the day one of those ratios is tuned.
        Array.prototype.forEach.call(
          g.querySelectorAll('.mm-label .mm-code-chip'), function (c) {
            var top = parseFloat(c.getAttribute('y'));
            var bottom = top + parseFloat(c.getAttribute('height'));
            var x = parseFloat(c.getAttribute('x'));
            Object.keys(byBaseline).forEach(function (y) {
              var baseline = parseFloat(y);
              if (baseline < top || baseline > bottom) return;
              byBaseline[y].start = Math.min(byBaseline[y].start, x);
              byBaseline[y].end =
                Math.max(byBaseline[y].end, x + parseFloat(c.getAttribute('width')));
            });
          });

        return Object.keys(byBaseline).map(function (y) { return byBaseline[y]; });
      }

      function flushLeft(lines) {
        return lines.every(function (l) {
          return Math.abs(l.start - lines[0].start) < 0.01;
        });
      }

      var wrapped = nodesIn('leftedge').filter(function (g) {
        return linesOf(g).length > 1;
      });

      // Lines of the same width sit at the same x however they are aligned, so
      // an edge read off a label that happens to wrap evenly proves nothing.
      // At least one label has to be visibly ragged for the checks to bite.
      var ragged = wrapped.some(function (g) {
        var ends = linesOf(g).map(function (l) { return l.end; });
        return Math.max.apply(null, ends) - Math.min.apply(null, ends) > 4;
      });

      check(239, 'every line of a wrapped label starts at the same x',
        wrapped.length >= 2 && ragged &&
        wrapped.every(function (g) { return flushLeft(linesOf(g)); }));

      // The centre node is excepted from plenty — it takes no fold badge, no
      // branch accent, and a focus ring of its own — so being held to the
      // branches' alignment is worth stating rather than assuming.
      var centre = scopeOf('leftedge').querySelector('.mm-root');
      check(240, 'a wrapped centre node is no exception to the edge',
        linesOf(centre).length > 1 && flushLeft(linesOf(centre)));

      // Not merely *an* edge: the one an unwrapped node at the same depth
      // already stands on, which is the box's own padding. Left at x=0 the
      // lines would share an edge too, and sit against the side of the box.
      var short = nodeIn('leftedge', 'Short');
      var branches = wrapped.filter(function (g) {
        return !g.classList.contains('mm-root');
      });
      check(241, 'that edge is the padding an unwrapped label already sits at',
        branches.length > 0 && linesOf(short).length === 1 &&
        branches.every(function (g) {
          return Math.abs(linesOf(g)[0].start - linesOf(short)[0].start) < 0.01;
        }));

      // On a line led by a code span the chip is the ink at the edge and its
      // text sits a padding inside — so the two disagree about where the line
      // starts, and only one of them is the edge the reader sees. Stated on its
      // own because it is also what keeps the reading above honest: a fixture
      // that stopped wrapping a chip onto a line of its own would exercise none
      // of that half of `linesOf`, and 239 would pass on the text alone.
      var edge = linesOf(short)[0].start;
      var chipped = nodeMatching('leftedge', 'pushing');

      var chips = Array.prototype.map.call(
        chipped.querySelectorAll('.mm-label .mm-code-chip'), function (c) {
          var top = parseFloat(c.getAttribute('y'));
          return {
            x: parseFloat(c.getAttribute('x')),
            top: top,
            bottom: top + parseFloat(c.getAttribute('height'))
          };
        });

      var texts = Array.prototype.map.call(
        chipped.querySelectorAll('.mm-label text'), function (t) {
          return {
            x: parseFloat(t.getAttribute('x')),
            baseline: parseFloat(t.getAttribute('y')),
            code: t.classList.contains('mm-code')
          };
        });

      // The chip and the text it holds, tied by the band the baseline falls
      // in and by that text being code — not merely by sitting somewhere
      // below. Paired loosely, a chip correctly on the edge could vouch for a
      // text on another line entirely, and a pairing that had come apart
      // would read as intact.
      var ledByChip = chips.filter(function (chip) {
        return Math.abs(chip.x - edge) < 0.01 && texts.some(function (t) {
          return t.code && t.baseline >= chip.top && t.baseline <= chip.bottom &&
            t.x > chip.x + 1;
        });
      });

      check(242, 'a chip-led line stands the chip on the edge, not its text',
        ledByChip.length > 0 &&
        texts.every(function (t) { return t.x >= edge - 0.01; }));
    })();

    (function () {
      function allOneSide(where, side) {
        var svg = svgOf(where);
        var root = boxRect(svg.querySelector('.mm-root'));
        return Array.prototype.every.call(svg.querySelectorAll('.mm-node'), function (g) {
          if (g.classList.contains('mm-root')) return true;
          var x = boxRect(g).x;
          return side > 0 ? x >= root.x + root.w : x <= root.x;
        });
      }
      check(11, 'direction=right keeps all nodes right', allOneSide('dir-right', 1));
      check(12, 'direction=left keeps all nodes left', allOneSide('dir-left', -1));
    })();

    (function () {
      var wide = Array.prototype.some.call(boxes('width-gap'), function (r) {
        return parseFloat(r.getAttribute('width')) > 130;
      });
      check(13, 'max-node-width honoured', !wide);
    })();

    check(14, 'fenced code block rendered',
      !!svgOf('fenced') && boxes('fenced').length === 4 &&
      !scopeOf('fenced').querySelector('pre'));
    check(15, 'div.mindmap rendered', !!svgOf('div-form') && boxes('div-form').length === 3);
    check(16, 'palette wraps: 11 boxes', boxes('palette-wrap').length === 11);

    check(17, 'two roots -> error mentioning the line',
      !!errOf('err-two-roots') &&
      errOf('err-two-roots').textContent.indexOf('Second root') > -1);
    check(18, 'empty -> error', !!errOf('err-empty') &&
      errOf('err-empty').textContent.toLowerCase().indexOf('empty') > -1);
    check(19, 'bare bullet -> error', !!errOf('err-bare-bullet'));

    (function () {
      var hidden = document.querySelectorAll('.mm-a11y a');
      var visible = document.querySelectorAll('.mm-svg a.mm-link');
      check(109, 'the hidden outline costs no tab stops',
        hidden.length > 0 && visible.length > 0 &&
        Array.prototype.every.call(hidden, function (a) {
          return a.getAttribute('tabindex') === '-1';
        }));
    })();

    (function () {
      var deep = document.getElementById('toodeep');
      check(99, 'nesting past the depth limit is an error, not a crash',
        !!deep.querySelector('.mm-error') &&
        deep.textContent.indexOf('100 deep') > -1 &&
        deep.textContent.indexOf('Line ') > -1);

      var viewBoxes = Array.prototype.map.call(
        document.querySelectorAll('#badopts .mm-svg'),
        function (svg) { return svg.getAttribute('viewBox'); });
      check(105, 'an unusable dimension does not reach the drawing',
        viewBoxes.length === 3 && viewBoxes.every(function (vb) {
          return /^0 0 \d+(\.\d+)? \d+(\.\d+)?$/.test(vb);
        }));
      check(106, 'it falls back to the default, which the third map uses',
        viewBoxes[0] === viewBoxes[2] && viewBoxes[1] === viewBoxes[2]);

      // Rendered here rather than on load, so the rest of the gallery keeps
      // the built-in accents to look at.
      var saved = MindMap.palette;
      MindMap.palette = [['#ff0000', '#00ff00']];
      var custom = MindMap.render(document.getElementById('pal-custom'));
      MindMap.palette = ['not a pair'];
      var fallback = MindMap.render(document.getElementById('pal-bad'));
      // A pair whose bright half is dark. Nothing stops a site assigning one,
      // and the centre node is the only box that fills with a palette colour
      // and writes on top of it, so it is the only one that can lose its label.
      MindMap.palette = [['#ffffff', '#161b22']];
      var inked = MindMap.render(document.getElementById('pal-ink'));
      // The same pair written the way an author reaching for words would write
      // it. `MindMap.palette` takes any colour string CSS takes, and a value
      // the ink cannot read is a label — and now a focus ring — lost in its
      // own box.
      MindMap.palette = [['white', 'navy']];
      var worded = MindMap.render(document.getElementById('pal-word'));
      // A colour the page alone could work out. It reaches the box, because
      // SVG resolves it where the box sits, but nothing outside the document
      // can say what it came to — so the ink takes the documented fallback
      // rather than a guess.
      MindMap.palette = [['white', 'var(--brand, #4a2f6b)']];
      var unresolved = MindMap.render(document.getElementById('pal-unresolved'));
      // The other half of that: a value a canvas outside the document answers
      // rather than declines, and answers with black however the page has its
      // text set. Confidently wrong is worse than unreadable, so it has to be
      // turned away rather than trusted.
      MindMap.palette = [['white', 'currentColor']];
      var inherited = MindMap.render(document.getElementById('pal-current'));
      MindMap.palette = saved;

      var painted = custom.querySelector('.mm-node:not(.mm-root)');
      check(107, 'an assigned palette reaches the branches and a named centre',
        painted.style.getPropertyValue('--mm-a') === '#ff0000' &&
        painted.style.getPropertyValue('--mm-a-dark') === '#00ff00' &&
        custom.querySelector('.mm-edge').style.getPropertyValue('--mm-a') === '#ff0000' &&
        custom.querySelector('.mm-root').style.getPropertyValue('--mm-root-bg') ===
          '#00ff00');
      check(108, 'an unusable palette falls back to the built-in one',
        fallback.querySelector('.mm-node:not(.mm-root)')
          .style.getPropertyValue('--mm-a') === '#3b6ea5');
      check(213, 'a dark colour in the bright half turns the centre ink white',
        inked.querySelector('.mm-root').style.getPropertyValue('--mm-root-bg') ===
          '#161b22' &&
        inked.querySelector('.mm-root').style.getPropertyValue('--mm-root-text') ===
          '#ffffff');
      check(220, 'a colour word in the bright half is read, not guessed at',
        worded.querySelector('.mm-root').style.getPropertyValue('--mm-root-bg') ===
          'navy' &&
        worded.querySelector('.mm-root').style.getPropertyValue('--mm-root-text') ===
          '#ffffff');
      check(223, 'a colour only the page could read falls back rather than guessing',
        unresolved.querySelector('.mm-root').style.getPropertyValue('--mm-root-text') ===
          '#161b22' &&
        inherited.querySelector('.mm-root').style.getPropertyValue('--mm-root-text') ===
          '#161b22');
      // The centre's focus ring is drawn in that ink, so a replaced palette
      // that darkens the box takes the ring along with the label rather than
      // leaving it to disappear into the fill.
      check(219, 'a replaced palette carries the centre focus ring with the ink',
        readable(inked.querySelector('.mm-root')) &&
        readable(worded.querySelector('.mm-root')) &&
        readable(custom.querySelector('.mm-root')));

      var refreshHost = document.getElementById('embedrefresh');
      function embedText() {
        return refreshHost.querySelector('.mm-embed-body').textContent.trim();
      }
      var before = embedText();
      document.getElementById('src-editable').content.firstElementChild
        .textContent = 'After, and a good deal wider than it was';
      var refreshed = MindMap.refresh(refreshHost);
      check(102, 'refresh re-reads the source element it was given',
        before === 'Before' && refreshed === true &&
        embedText().indexOf('After') === 0);
      check(103, 'the branch renames itself after the content changed',
        refreshHost.querySelector('.mm-node[role="button"],.mm-toggle[role="button"]')
          .getAttribute('aria-label').indexOf('After') === 0);
      // The outline is a copy of the labels, not a live view of them, so a
      // refresh that leaves it alone leaves a screen reader on the old map
      // while everyone else reads the new one.
      var refreshOutline = refreshHost.querySelector('.mm-a11y');
      check(191, 'the hidden outline is rebuilt with the content that changed',
        refreshOutline.textContent.indexOf('After') > -1 &&
        refreshOutline.textContent.indexOf('Before') === -1 &&
        // Still the whole tree, not just the block that moved.
        refreshOutline.textContent.indexOf('Child') > -1 &&
        // And still one outline, not one per refresh.
        refreshHost.querySelectorAll('.mm-a11y').length === 1);

      check(104, 'a second refresh with nothing changed reports no change',
        MindMap.refresh(refreshHost) === false);

      var maps = document.getElementById('isolation').children;
      check(100, 'a map that fails unexpectedly shows an error box',
        maps.length === 3 && !!maps[1].querySelector('.mm-error') &&
        !maps[1].querySelector('.mm-svg'));
      check(101, 'the maps either side of it still drew',
        !!maps[0].querySelector('.mm-svg') && !!maps[2].querySelector('.mm-svg'));
    })();

    (function () {
      var l = labels('special-chars').join('|');
      check(20, 'special chars kept as text',
        l.indexOf('a < b > c') > -1 && l.indexOf('x --> y') > -1 &&
        l.indexOf('100% "quoted"') > -1);
    })();

    (function () {
      var track = getComputedStyle(document.getElementById('gridhost')).gridTemplateColumns;
      check(21, 'grid track stays 260px (was blown out by svg min-width)',
        track.indexOf('260px') === 0);
      var flexhost = document.getElementById('flexhost');
      var fixedSibling = flexhost.lastElementChild;
      check(22, 'flex row does not overflow; fixed sibling keeps its 200px',
        flexhost.scrollWidth <= flexhost.clientWidth + 1 &&
        Math.round(fixedSibling.getBoundingClientRect().width) === 200);
    })();

    (function () {
      function hostCheck(n, id, label, roots) {
        var host = document.getElementById(id);
        var ok = host.querySelectorAll('.mm-container').length === 1 &&
                 host.querySelectorAll('.mm-box').length === roots &&
                 !host.querySelector('pre') && !host.querySelector('code') &&
                 !host.querySelector('.highlight') &&
                 !host.querySelector('[class*="language-"]');
        check(n, label, ok);
      }
      hostCheck(23, 'rouge', 'Rouge shape renders, wrappers removed', 3);
      hostCheck(24, 'prism', 'Prism shape renders, wrappers removed', 3);
      hostCheck(25, 'markbind', 'MarkBind shape renders, wrappers removed', 3);
      hostCheck(26, 'nested', 'nested match renders exactly once', 2);
    })();

    // Theme resolution: host signals must beat the system preference, and a
    // per-map data-theme must beat the host.
    (function () {
      var root = document.documentElement;
      var saved = root.getAttribute('data-dark-mode');
      var host = document.createElement('div');
      host.innerHTML = '<pre class="mindmap">Theme\n  child</pre>' +
                       '<pre class="mindmap" data-theme="dark">Theme\n  child</pre>' +
                       '<pre class="mindmap" data-theme="light">Theme\n  child</pre>';
      document.body.appendChild(host);
      MindMap.renderAll(host);
      var maps = host.querySelectorAll('.mm-container');

      function surface(el) { return getComputedStyle(el).getPropertyValue('--mm-surface').trim(); }
      var LIGHT = '#ffffff', DARK = '#1b2027';

      root.setAttribute('data-dark-mode', 'true');
      var darkHost = surface(maps[0]) === DARK;
      var ownLightWins = surface(maps[2]) === LIGHT;

      root.setAttribute('data-dark-mode', 'false');
      var lightHost = surface(maps[0]) === LIGHT;
      var ownDarkWins = surface(maps[1]) === DARK;

      if (saved === null) root.removeAttribute('data-dark-mode');
      else root.setAttribute('data-dark-mode', saved);
      host.remove();

      check(27, 'host data-dark-mode=true makes the map dark', darkHost);
      check(28, 'host data-dark-mode=false makes the map light', lightHost);
      check(29, 'per-map data-theme beats the host', ownLightWins && ownDarkWins);
    })();

    // Collapse / expand. Animation is ~300ms, so these await settling.
    (function () {
      var done = group('collapse');
      var host = document.getElementById('collapse');
      var toggles = host.querySelectorAll('.mm-interactive');
      check(30, 'a toggle on each of the 3 nodes with children', toggles.length === 3);
      check(31, 'root has no toggle', !host.querySelector('.mm-root.mm-interactive'));
      check(32, 'everything visible initially', visibleLabels('collapse').length === 9);

      var reqs = Array.prototype.filter.call(toggles, function (g) {
        return g.querySelector('.mm-label').textContent === 'Requirements';
      })[0];
      var before = host.querySelector('.mm-svg').getAttribute('viewBox');
      reqs.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      settled('collapse', function () {
        var after = visibleLabels('collapse');
        check(33, 'collapsing hides just that subtree',
          after.length === 7 && after.indexOf('Stakeholders') === -1 &&
          after.indexOf('User Stories') === -1 && after.indexOf('Architecture') > -1);
        check(34, 'collapsed node is marked', reqs.classList.contains('mm-collapsed') &&
          reqs.getAttribute('aria-expanded') === 'false');
        check(35, 'canvas shrank', host.querySelector('.mm-svg').getAttribute('viewBox') !== before);

        reqs.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        settled('collapse', function () {
          check(36, 'expanding brings it back', visibleLabels('collapse').length === 9 &&
            reqs.getAttribute('aria-expanded') === 'true');

          check(37, 'collapse-level=1 shows only root + branches',
            visibleLabels('preset').length === 3);
          check(38, 'data-interactive=false has no toggles',
            document.getElementById('static').querySelectorAll('.mm-interactive').length === 0 &&
            document.getElementById('static').querySelectorAll('.mm-toggle').length === 0);

          MindMap.collapseAll(document.getElementById('collapse').querySelector('.mm-container'));
          settled('collapse', function () {
            check(39, 'collapseAll leaves root + branches',
              visibleLabels('collapse').length === 4);
            done();
          });
        });
      });
    })();

    // Dragging.
    (function () {
      var done = group('drag');
      var host = document.getElementById('drag');
      function nodeNamed(name) { return nodeIn(host, name); }
      var pos = posOf;
      var pointer = pointerFor(1);

      check(110, 'a draggable node leaves vertical page scrolling alone',
        getComputedStyle(host.querySelector('.mm-draggable')).touchAction === 'pan-y');

      check(40, 'every node including the root is draggable',
        host.querySelectorAll('.mm-draggable').length === 6 &&
        !!host.querySelector('.mm-root.mm-draggable'));

      var req = nodeNamed('Requirements');
      var kid = nodeNamed('Stakeholders');
      var sibling = nodeNamed('Design');
      var reqBefore = pos(req), kidBefore = pos(kid), siblingBefore = pos(sibling);
      var r = req.getBoundingClientRect();

      pointer(req, 'pointerdown', r.left + 5, r.top + 5);
      pointer(req, 'pointermove', r.left + 45, r.top + 35);
      pointer(req, 'pointerup', r.left + 45, r.top + 35);

      var reqAfter = pos(req), kidAfter = pos(kid);
      check(41, 'the dragged node moved',
        Math.abs(reqAfter.x - reqBefore.x) > 10 && Math.abs(reqAfter.y - reqBefore.y) > 5);
      check(42, 'its subtree moved by the same amount',
        Math.abs((kidAfter.x - kidBefore.x) - (reqAfter.x - reqBefore.x)) < 0.6 &&
        Math.abs((kidAfter.y - kidBefore.y) - (reqAfter.y - reqBefore.y)) < 0.6);

      var siblingAfter = pos(sibling);
      check(43, 'an unrelated branch stayed put',
        Math.abs(siblingAfter.x - siblingBefore.x) < 0.001 &&
        Math.abs(siblingAfter.y - siblingBefore.y) < 0.001 &&
        !sibling.classList.contains('mm-dragging'));

      // A drag must not fire the collapse toggle.
      var visAfterDrag = Array.prototype.filter.call(
        host.querySelectorAll('.mm-node'), function (g) { return g.style.display !== 'none'; }).length;
      check(44, 'dragging did not collapse the node', visAfterDrag === 6);

      // A press that barely moves is still a click.
      var r2 = req.getBoundingClientRect();
      pointer(req, 'pointerdown', r2.left + 5, r2.top + 5);
      pointer(req, 'pointermove', r2.left + 6, r2.top + 6);
      pointer(req, 'pointerup', r2.left + 6, r2.top + 6);
      req.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      settled('drag', function () {
        var vis = Array.prototype.filter.call(host.querySelectorAll('.mm-node'),
          function (g) { return g.style.display !== 'none'; }).length;
        check(45, 'a near-still press still toggles', vis === 4);

        // Re-expand first: the collapse above legitimately changed the layout,
        // so only a fully expanded map is comparable with the starting one.
        var container = host.querySelector('.mm-container');
        MindMap.expandAll(container);
        MindMap.resetPositions(container);
        settled('drag', function () {
          var back = pos(nodeNamed('Requirements'));
          var model = container.mindMap.root.children.filter(function (n) {
            return n.label === 'Requirements';
          })[0];
          check(46, 'resetPositions clears offsets and restores the layout',
            !model.dx && !model.dy &&
            Math.abs(back.x - reqBefore.x) < 0.6 && Math.abs(back.y - reqBefore.y) < 0.6);
          check(47, 'data-draggable=false disables dragging',
            document.getElementById('nodrag').querySelectorAll('.mm-draggable').length === 0 &&
            document.getElementById('nodrag').querySelectorAll('.mm-interactive').length === 1);
          done();
        });
      });
    })();

    // Reader-facing shape switch.
    (function () {
      var done = group('shape switch');
      var host = document.getElementById('shape');
      var container = host.querySelector('.mm-container');
      function btn(dir) { return host.querySelector('.mm-ctl[data-dir="' + dir + '"]'); }
      function nodeNamed(name) { return nodeIn(host, name); }
      function xOf(g) { return posOf(g).x; }
      function allOneSide() {
        var root = nodeNamed('Shape switch');
        var rx = xOf(root);
        var rw = parseFloat(root.querySelector('rect').getAttribute('width'));
        return Array.prototype.every.call(host.querySelectorAll('.mm-node'), function (g) {
          return g.classList.contains('mm-root') || xOf(g) >= rx + rw;
        });
      }

      check(48, 'switch present with balanced selected',
        !!btn('balanced') && !!btn('right') &&
        btn('balanced').getAttribute('aria-checked') === 'true');
      check(49, 'balanced really does straddle the root', !allOneSide());
      // Measured through the resting opacity, against the background the theme
      // in force assumes — which is what a reader who never hovers sees.
      check(111, 'the shape controls are legible at rest and big enough to hit',
        (function () {
          var btn = document.querySelector('#shape .mm-ctl');
          var bar = document.querySelector('#shape .mm-controls');
          var alpha = parseFloat(getComputedStyle(bar).opacity);
          var back = rgbOf(getComputedStyle(btn.closest('.mm-container'))
            .getPropertyValue('--mm-surface'));
          var front = rgbOf(getComputedStyle(btn).color);

          function rgbOf(text) {
            text = text.trim();
            if (text.charAt(0) === '#') {
              return [1, 3, 5].map(function (i) {
                return parseInt(text.substr(i, 2), 16);
              });
            }
            return text.match(/[\d.]+/g).slice(0, 3).map(Number);
          }
          function lum(c) {
            var v = c.map(function (n) {
              n /= 255;
              return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
            });
            return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
          }

          var seen = front.map(function (n, i) {
            return n * alpha + back[i] * (1 - alpha);
          });
          var a = lum(seen) + 0.05, b = lum(back) + 0.05;
          var contrast = a > b ? a / b : b / a;
          return btn.getBoundingClientRect().height >= 24 && contrast >= 4.5;
        })());

      check(93, 'the two shapes sit in one radio group', (function () {
        var seg = host.querySelector('.mm-seg[role="radiogroup"]');
        return !!seg && seg.contains(btn('balanced')) && seg.contains(btn('right')) &&
          btn('balanced').getAttribute('role') === 'radio' &&
          btn('right').getAttribute('role') === 'radio';
      })());
      check(94, 'the pair costs one tab stop, on the shape in use',
        btn('balanced').getAttribute('tabindex') === '0' &&
        btn('right').getAttribute('tabindex') === '-1');

      // Fold one branch first: the fold must survive a shape change.
      nodeNamed('Requirements').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      settled('shape', function () {
        btn('right').click();
        settled('shape', function () {
          check(50, 'one-sided puts every branch on one side', allOneSide());
          check(51, 'the switch reflects the new shape',
            btn('right').getAttribute('aria-checked') === 'true' &&
            btn('balanced').getAttribute('aria-checked') === 'false');
          check(52, 'a folded branch stays folded through the switch',
            nodeNamed('Requirements').classList.contains('mm-collapsed') &&
            nodeNamed('Stakeholders').style.display === 'none');

          var toggle = nodeNamed('Design').querySelector('.mm-toggle');
          var rectW = parseFloat(nodeNamed('Design').querySelector('rect').getAttribute('width'));
          check(53, 'toggles moved to the new outward edge',
            /translate\(([-\d.]+)/.exec(toggle.getAttribute('transform'))[1] ===
            String(Math.round(rectW * 100) / 100));

          btn('balanced').click();
          settled('shape', function () {
            check(54, 'switching back restores the balanced shape', !allOneSide());

            // Arrow keys move within the group, the way a radio group works.
            function arrow(dir, key) {
              btn(dir).dispatchEvent(new KeyboardEvent('keydown',
                { key: key, bubbles: true }));
            }
            arrow('balanced', 'ArrowRight');
            settled('shape', function () {
              check(95, 'an arrow key picks the neighbouring shape',
                allOneSide() &&
                btn('right').getAttribute('aria-checked') === 'true' &&
                btn('right').getAttribute('tabindex') === '0' &&
                btn('balanced').getAttribute('tabindex') === '-1');
              arrow('right', 'ArrowLeft');
              settled('shape', function () {
                check(96, 'the opposite arrow comes back', !allOneSide() &&
                  btn('balanced').getAttribute('aria-checked') === 'true');
                check(55, 'left-default map offers left as the alternative',
                  !!document.querySelector('#leftdefault .mm-ctl[data-dir="left"]') &&
                  !document.querySelector('#leftdefault .mm-ctl[data-dir="right"]'));
                check(56, 'data-controls=false hides the switch but keeps folding',
                  document.querySelectorAll('#nocontrols .mm-controls').length === 0 &&
                  document.querySelectorAll('#nocontrols .mm-interactive').length === 1 &&
                  document.querySelectorAll('#nocontrols .mm-draggable').length === 4);
                check(57, 'setDirection API works and rejects nonsense',
                  MindMap.setDirection(container, 'right') === true &&
                  MindMap.setDirection(container, 'sideways') === false);
                done();
              });
            });
          });
        });
      });
    })();

    // The fold button, which is one control doing both jobs rather than two.
    (function () {
      var done = group('fold all');
      var host = document.getElementById('foldall');
      function foldBtn(where) {
        return document.getElementById(where).querySelector('.mm-fold-all');
      }
      function foldLabel(where) {
        return foldBtn(where).querySelector('.mm-ctl-text').textContent;
      }
      function btn() { return foldBtn('foldall'); }
      function label() { return foldLabel('foldall'); }
      function shut() {
        return nodesIn('foldall').filter(function (g) {
          return g.classList.contains('mm-collapsed');
        }).length;
      }

      check(229, 'the fold button sits beside the shapes without joining them',
        !!btn() && host.querySelectorAll('.mm-controls .mm-seg').length === 2 &&
        !btn().hasAttribute('data-dir') &&
        !host.querySelector('.mm-seg[role="radiogroup"]').contains(btn()));
      // Read off the tree, not off the last press: the map opens with a
      // branch already folded, so the first thing the button can do is unfold.
      check(230, 'it opens named for the job it would do',
        label() === 'Expand all' && btn().title === 'Unfold every branch');

      btn().click();
      settled('foldall', function () {
        check(231, 'one press unfolds every branch and turns it into the undo',
          visibleLabels('foldall').length === 8 && shut() === 0 &&
          label() === 'Collapse all' && btn().title === 'Fold every branch');

        btn().click();
        settled('foldall', function () {
          // Four, not one: the centre node has no fold of its own, and folding
          // it would leave a lone box where the map was.
          check(232, 'the next press folds every branch and spares the centre',
            visibleLabels('foldall').length === 4 && shut() === 3 &&
            label() === 'Expand all');

          btn().click();
          settled('foldall', function () {
            nodeIn(host, 'Requirements')
              .dispatchEvent(new MouseEvent('click', { bubbles: true }));
            settled('foldall', function () {
              check(233, 'a branch folded by hand flips the label straight back',
                shut() === 1 && label() === 'Expand all');
              check(234, 'a map with no branch to fold is offered no button',
                !document.querySelector('#foldflat .mm-fold-all') &&
                document.querySelectorAll('#foldflat .mm-ctl[data-dir]').length === 2);
              check(235, 'data-controls=false drops the fold button with the rest',
                !document.querySelector('#nocontrols .mm-fold-all'));

              // The label is promised to follow the tree however the tree
              // came to be that way, and the button's own press is only one
              // of the routes in. These are the rest of the ones the library
              // owns — a map that never had a press at all, the API, and the
              // keyboard. Each of them could regress on its own while 229-234
              // went on passing.
              check(236, 'a map that opens folded opens offering the way out',
                foldLabel('preset') === 'Expand all' &&
                foldBtn('preset').getAttribute('data-act') === 'expand');

              MindMap.expandAll(host);
              settled('foldall', function () {
                var opened = shut() === 0 && label() === 'Collapse all' &&
                  btn().getAttribute('data-act') === 'collapse';
                MindMap.collapseAll(host);
                settled('foldall', function () {
                  check(237, 'the API carries the button along with the map',
                    opened && shut() === 3 && label() === 'Expand all' &&
                    btn().getAttribute('data-act') === 'expand');

                  MindMap.expandAll(host);
                  settled('foldall', function () {
                    // The reader's other way of folding one branch, and the
                    // one that never goes near the button.
                    nodeIn(host, 'Requirements').dispatchEvent(
                      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
                    settled('foldall', function () {
                      check(238, 'folding from the keyboard moves the button too',
                        shut() === 1 && label() === 'Expand all' &&
                        btn().getAttribute('data-act') === 'expand');
                      done();
                    });
                  });
                });
              });
            });
          });
        });
      });
    })();

    // The root moves alone -- carrying its subtree would just slide the map.
    (function () {
      var done = group('root drag');
      var host = document.getElementById('rootdrag');
      function nodeNamed(name) { return nodeIn(host, name); }
      var pos = posOf;
      var pointer = pointerFor(3);

      var rootEl = nodeNamed('Centre');
      var alpha = nodeNamed('Alpha');
      var a1 = nodeNamed('a1');
      var rootBefore = pos(rootEl), alphaBefore = pos(alpha), a1Before = pos(a1);

      check(58, 'the root is focusable for keyboard moves',
        rootEl.getAttribute('tabindex') === '0');

      var r = rootEl.getBoundingClientRect();
      pointer(rootEl, 'pointerdown', r.left + 5, r.top + 5);
      pointer(rootEl, 'pointermove', r.left + 45, r.top + 30);
      pointer(rootEl, 'pointerup', r.left + 45, r.top + 30);

      var rootAfter = pos(rootEl);
      check(59, 'the root moved',
        Math.abs(rootAfter.x - rootBefore.x) > 10 && Math.abs(rootAfter.y - rootBefore.y) > 5);
      check(60, 'branches did not move with it',
        Math.abs(pos(alpha).x - alphaBefore.x) < 0.6 &&
        Math.abs(pos(alpha).y - alphaBefore.y) < 0.6 &&
        Math.abs(pos(a1).x - a1Before.x) < 0.6);

      // Its own branch still carries its children.
      var alphaR = alpha.getBoundingClientRect();
      pointer(alpha, 'pointerdown', alphaR.left + 5, alphaR.top + 5);
      pointer(alpha, 'pointermove', alphaR.left + 5, alphaR.top + 40);
      pointer(alpha, 'pointerup', alphaR.left + 5, alphaR.top + 40);
      check(61, 'a branch still carries its subtree',
        Math.abs((pos(a1).y - a1Before.y) - (pos(alpha).y - alphaBefore.y)) < 0.6 &&
        pos(alpha).y > alphaBefore.y);

      MindMap.resetPositions(host.querySelector('.mm-container'));
      settled('rootdrag', function () {
        check(62, 'reset clears the root offset too',
          Math.abs(pos(nodeNamed('Centre')).x - rootBefore.x) < 0.6 &&
          Math.abs(pos(nodeNamed('Centre')).y - rootBefore.y) < 0.6);
        done();
      });
    })();

    // Inline markup.
    (function () {
      var done = group('inline markup');
      function squash(t) { return t.replace(/\s+/g, ''); }
      function byText(id, want) {
        return nodesIn(id).filter(function (g) {
          return squash(g.textContent) === squash(want);
        })[0];
      }

      function distinctRows(g) {
        var ys = {};
        Array.prototype.forEach.call(g.querySelectorAll('text'), function (t) {
          ys[t.getAttribute('y')] = 1;
        });
        return Object.keys(ys).length;
      }

      var host = document.getElementById('markup');
      var bold = byText('markup', 'Requirements gathering');
      check(63, 'bold run is heavier than its neighbour', !!bold &&
        Array.prototype.some.call(bold.querySelectorAll('text'), function (t) {
          return t.getAttribute('font-weight') === '700' &&
                 t.textContent === 'Requirements';
        }));

      var code = byText('markup', 'Run git rebase with care');
      check(64, 'code run is monospace with a chip behind it', !!code &&
        !!code.querySelector('.mm-code-chip') &&
        !!code.querySelector('.mm-code[font-family]'));

      var emph = byText('markup', 'emphasis and struck');
      check(65, 'italic and strikethrough applied', !!emph &&
        !!emph.querySelector('text[font-style="italic"]') &&
        !!emph.querySelector('text[text-decoration="line-through"]'));

      var link = byText('markup', 'Lecture 3');
      check(66, 'link becomes a real anchor', !!link &&
        !!link.querySelector('a') &&
        link.querySelector('a').getAttribute('href') === 'week3.html');

      var brk = byText('markup', 'Line one Line two');
      check(67, 'manual break splits the label onto two lines', !!brk &&
        distinctRows(brk) === 2 &&
        brk.textContent.indexOf('\n') > -1);

      // Literal text must survive untouched.
      var lit = document.getElementById('literal');
      var litText = lit.textContent.replace(/\s+/g, ' ');
      check(68, 'snake_case and lone asterisks stay literal',
        litText.indexOf('snake_case_name') > -1 &&
        litText.indexOf('2 * 3 * 4') > -1 &&
        litText.indexOf('unclosed **bold') > -1 &&
        litText.indexOf('[not a link]') > -1);
      check(69, 'backslash escapes the marker',
        litText.indexOf('escaped *not italic*') > -1);
      check(127, 'a backslash keeps a literal fold marker in the label',
        litText.indexOf('[+] not a fold marker') > -1);
      check(70, 'nothing in the literal map got styled',
        lit.querySelectorAll('text[font-style="italic"]').length === 0 &&
        lit.querySelectorAll('.mm-code-chip').length === 0 &&
        // :not() past the credit chip — it is chrome the container carries,
        // not a link the source asked for.
        lit.querySelectorAll('a:not(.mm-credit-link)').length === 0);

      var imgs = document.getElementById('images').querySelectorAll('.mm-image');
      check(71, 'both images render at the sizes asked for',
        imgs.length === 2 &&
        imgs[0].getAttribute('width') === '16' &&
        imgs[1].getAttribute('width') === '24');

      check(72, 'javascript: URL is refused',
        document.getElementById('unsafe')
          .querySelectorAll('a:not(.mm-credit-link)').length === 0 &&
        document.getElementById('unsafe').textContent.indexOf('[click]') > -1);

      var raw = document.getElementById('nomarkup');
      check(73, 'data-markup=false leaves the source as typed',
        raw.textContent.indexOf('**not bold**') > -1 &&
        raw.querySelectorAll('.mm-code-chip').length === 0);

      check(74, 'the outline exposes links for screen readers',
        !!host.querySelector('.mm-a11y a[href="week3.html"]'));

      // A link must not fold the node it sits in.
      var linkParent = byText('markup', 'Lecture 3');
      var beforeFold = linkParent.classList.contains('mm-collapsed');
      // Stop the browser actually following the link mid-test, while still
      // letting the library's own handlers run.
      var swallow = function (e) { e.preventDefault(); };
      document.addEventListener('click', swallow, true);
      var ev = new MouseEvent('click', { bubbles: true, cancelable: true });
      linkParent.querySelector('a').dispatchEvent(ev);
      document.removeEventListener('click', swallow, true);
      check(75, 'clicking a link does not fold its node',
        linkParent.classList.contains('mm-collapsed') === beforeFold);
      done();
    })();

    // An image with no size hint must re-flow the node once it loads.
    (function () {
      var done = group('images');
      var host = document.getElementById('autoimg');

      // Two waits, because two different things have to happen: the images
      // have to come back off the network, and the map has to re-lay itself out
      // around the sizes they turned out to be.
      until(function () { return imagesResolved('autoimg'); }, function () {
      settled('autoimg', function () {
        var imgs = host.querySelectorAll('.mm-image');
        var real = imgs[0], missing = imgs[1];
        var w = parseFloat(real.getAttribute('width'));
        var h = parseFloat(real.getAttribute('height'));
        var box = real.closest('.mm-node').querySelector('.mm-box');

        // 132x86 natural, capped to 120x90 -> 120x78.
        check(76, 'unsized image settles at its scaled natural size',
          w === 120 && h === 78);
        check(77, 'a missing image keeps its placeholder rather than collapsing',
          parseFloat(missing.getAttribute('width')) === 64 &&
          parseFloat(missing.getAttribute('height')) === 48);
        check(78, 'the node box grew to contain the loaded image',
          parseFloat(box.getAttribute('width')) >= w &&
          parseFloat(box.getAttribute('height')) >= h);
        done();
      });
      });
    })();

    // --- credit caption ---
    (function () {
      var link = document.querySelector('#credit .mm-credit-link');
      check(113, 'a map carries one link back to the project site',
        !!link && document.querySelectorAll('#credit .mm-credit-link').length === 1 &&
        link.getAttribute('href') === 'https://se-education.org/mind-maps-helper/' &&
        /^\u00ab\u00a0Made with Mind Maps Helper\u00a0\u00bb$/.test(link.textContent));
      // Opening in the same tab would take the reader off whatever page the
      // map was sitting on, which is more than a credit line is entitled to do.
      check(114, 'the link opens away from the page it sits on, safely',
        !!link && link.target === '_blank' && /noopener/.test(link.rel));
      check(115, 'data-credit="false" leaves nothing behind',
        !document.querySelector('#nocredit .mm-credit'));
      // The chip is appended inside render()'s try, so a map that never drew
      // does not sign its name to the error box.
      check(116, 'a map that failed to draw is not credited',
        !!document.querySelector('#toodeep .mm-error') &&
        !document.querySelector('#toodeep .mm-credit') &&
        // Three maps in the isolation case, one of which never drew.
        document.querySelectorAll('#isolation .mm-credit').length === 2);
      // Nothing to do with interaction: a static map is still worth tracing
      // back to whatever drew it.
      check(117, 'a static map is credited too',
        !!document.querySelector('#static .mm-credit-link'));

      // The rule is gone, and the chip is a caption: faint at rest, brought
      // back by the pointer coming inside the map. The fade is declared behind
      // a query for a pointer, and a tab either has one or has not — it cannot
      // be asked to swap — so the declarations are read off the sheet, the way
      // the print pair below are. Measuring alone would let a tab reporting no
      // pointer pass this check by never fading at all.
      var bar = document.querySelector('#credit .mm-credit');
      var faded = parseFloat(declaredIn('hover: hover', '.mm-credit', 'opacity'));
      check(118, 'the caption fades behind a query for the pointer that undoes it',
        !(parseFloat(getComputedStyle(bar, '::before').borderTopWidth) > 0) &&
        faded > 0 && faded < 1 &&
        declaredIn('hover: hover', '.mm-container:hover .mm-credit', 'opacity') === '1' &&
        declaredIn('hover: hover', '.mm-credit:focus-within', 'opacity') === '1');

      // What the sheet cannot say on its own: that the fade reaches a map that
      // was really drawn, at the strength this tab has earned. Every way the
      // suite can be run asserts something here — a tab with a pointer resting
      // outside the map wears the declared fade, and one without a pointer, or
      // with it already inside, wears none of it.
      var canHover = window.matchMedia('(hover: hover)').matches;
      var pointerInside = bar.parentNode.matches(':hover');
      // A tab set to any of the three preferences below is a tab where the
      // caption is meant not to fade, so it must not be held to the fade — the
      // override this suite asks for in 226 would otherwise fail 224 and 225.
      var plain = !(window.matchMedia('(forced-colors: active)').matches ||
        window.matchMedia('(prefers-contrast: more)').matches ||
        window.matchMedia('(prefers-reduced-transparency: reduce)').matches);
      var fades = canHover && !pointerInside && plain;
      var rest = parseFloat(getComputedStyle(bar).opacity);
      check(224, 'a drawn caption wears the strength its tab and pointer earn',
        fades ? rest === faded : rest === 1);

      // Fading with opacity leaves a faded link in the tab order, so a keyboard
      // has to be able to bring it back as well. This is the half of that pair
      // page script can reach: the hover it cannot fake, the focus it can. The
      // transition is switched off around the read rather than waited out — a
      // backgrounded tab never advances one at all, so waiting would hang the
      // check on exactly the tabs this suite is usually run in.
      if (fades) {
        bar.style.transition = 'none';
        link.focus({ preventScroll: true });
        var lifted = parseFloat(getComputedStyle(bar).opacity);
        link.blur();
        var refaded = parseFloat(getComputedStyle(bar).opacity);
        bar.style.transition = '';
        check(225, 'a faded caption comes back for the keyboard too',
          rest < 1 && lifted === 1 && refaded === rest);
      } else {
        skip(225, 'a faded caption comes back for the keyboard too',
          !canHover ? 'this tab reports no pointer, so the caption never fades'
            : !plain ? 'this tab has asked for the fade to be dropped'
            : 'the pointer is already inside this map');
      }

      // Faded text is the one thing the emphasis modes refuse to do, and the
      // caption is allowed it only because a pointer undoes it — so a reader
      // who has said as much, in any of the three ways a browser reports it,
      // is not asked to go and find a pointer first. None of the three can be
      // switched on from inside the page, so the declaration names the readers
      // and the block is widened for a moment to watch it reach a drawn map.
      var relief = mediaBlocks('forced-colors: active')[0];
      check(226, 'the fade steps aside where transparency would cost legibility',
        !!relief &&
        relief.media.mediaText.indexOf('prefers-contrast: more') > -1 &&
        relief.media.mediaText.indexOf('prefers-reduced-transparency: reduce') > -1 &&
        declaredIn('forced-colors: active', '.mm-credit', 'opacity') === '1' &&
        underMedia('forced-colors: active', function () {
          // Suppressed, or the read lands part of the way through the fade it
          // is undoing — and never lands at all in a backgrounded tab. Put
          // back the way underMedia puts its own widening back, so a throw in
          // here cannot leave the sheet restored and the caption pinned.
          bar.style.transition = 'none';
          try {
            return parseFloat(getComputedStyle(bar).opacity) === 1;
          } finally {
            bar.style.transition = '';
          }
        }) === true);
      check(227, 'the fade is not travelled for a reader who asked for less motion',
        declaredIn('prefers-reduced-motion', '.mm-credit', 'transition') === 'none' &&
        underMedia('prefers-reduced-motion', function () {
          return getComputedStyle(bar).transitionDuration === '0s';
        }) === true);

      // The second half is what a sheet-level check misses on its own: that
      // the selector names something a drawn map really carries.
      check(119, 'the caption is dropped when the page prints',
        printHides('.mm-credit') &&
        document.querySelectorAll('#credit .mm-credit').length === 1);
      check(120, 'the shape switch is dropped when the page prints',
        printHides('.mm-controls') &&
        document.querySelectorAll('#credit .mm-controls').length === 1);
    })();

    // --- fold markers ---
    (function () {
      var done = group('fold markers');

      var open = visibleLabels('foldmark');
      check(121, 'a marked branch opens folded, an unmarked one open',
        open.length === 6 &&
        open.indexOf('Stakeholders') === -1 && open.indexOf('User Stories') === -1 &&
        open.indexOf('Architecture') === -1 && open.indexOf('Unit') > -1);
      // `- [+] Design` has to lose both the bullet and the marker.
      check(122, 'the marker leaves the label, bullet or no bullet',
        open.join('|').indexOf('[+]') === -1 &&
        open.indexOf('Requirements') > -1 && open.indexOf('Design') > -1);

      var notes = nodeIn('foldmark', 'Notes');
      check(123, 'a marker on a node with nothing under it is simply dropped',
        !!notes && !notes.querySelector('.mm-toggle') &&
        !notes.classList.contains('mm-collapsed'));

      var reqs = nodeIn('foldmark', 'Requirements');
      check(124, 'a branch that opens folded says so to a screen reader',
        !!reqs && reqs.classList.contains('mm-collapsed') &&
        reqs.getAttribute('aria-expanded') === 'false');

      var lvl = visibleLabels('foldkeep');
      check(125, '[-] keeps its branch open where the level would fold it',
        lvl.length === 5 &&
        lvl.indexOf('Architecture') > -1 && lvl.indexOf('Patterns') > -1 &&
        lvl.indexOf('Stakeholders') === -1);

      // A marker is structure, not markup: `data-markup="false"` governs bold,
      // links and images, and leaves the parser's own syntax — bullets,
      // comments, markers — alone. Which is why the escape has to work there.
      var rawFold = visibleLabels('nomarkup');
      check(129, 'a marker is read whatever data-markup says',
        rawFold.indexOf('Status') > -1 && rawFold.join('|').indexOf('[-]') === -1);
      check(130, 'the escape works with markup off, backslash and all',
        rawFold.indexOf('[+] Escaped') > -1);

      var tight = visibleLabels('foldliteral');
      check(131, 'a marker without its space is just a label',
        tight.indexOf('[+]NoSpace') > -1 && tight.indexOf('Child') > -1);
      check(132, 'the escape survives the inline parser too',
        tight.indexOf('[+] Escaped') > -1);

      var bad = document.querySelector('#foldempty .mm-error');
      check(126, 'a fold marker with no text after it names the line',
        !!bad && bad.textContent.indexOf('Line 2') > -1 &&
        bad.textContent.indexOf('fold marker') > -1);

      // An author's fold is an opening state, not a lock.
      reqs.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      settled('foldmark', function () {
        check(128, 'the reader can open a branch the author folded',
          visibleLabels('foldmark').indexOf('Stakeholders') > -1 &&
          reqs.getAttribute('aria-expanded') === 'true');
        done();
      });
    })();

    // --- colour markers ---
    (function () {
      function accentIn(id, name) {
        var g = nodeIn(id, name);
        return g ? g.style.getPropertyValue('--mm-a').trim() : '';
      }
      function labelsIn(id) {
        return Array.prototype.map.call(
          document.getElementById(id).querySelectorAll('.mm-label'),
          function (l) { return l.textContent; });
      }

      check(133, 'a named accent paints the branch it heads',
        accentIn('colourmark', 'Design') === '#3f7d5c' &&
        accentIn('colourmark', 'Architecture') === '#3f7d5c');
      check(134, 'an unnamed branch keeps the slot its order earned it',
        accentIn('colourmark', 'Requirements') === '#3b6ea5' &&
        accentIn('colourmark', 'Notes') === '#a8842c');
      check(135, 'a name further in recolours the rest of that branch',
        accentIn('colourmark', 'Deep') === '#2f7f8f' &&
        accentIn('colourmark', 'Deeper') === '#2f7f8f');
      check(136, 'a name is read whatever its case, aliases included',
        accentIn('colourmark', 'Legend') === '#56657a');

      var testing = nodeIn('colourmark', 'Testing');
      check(137, 'colour and fold markers stack, and neither reaches the label',
        !!testing && testing.classList.contains('mm-collapsed') &&
        testing.style.getPropertyValue('--mm-a').trim() === '#9c4f6c' &&
        labelsIn('colourmark').join('|').indexOf('[') === -1);

      check(138, 'the dark half of the pair travels with it',
        nodeIn('colourmark', 'Design').style.getPropertyValue('--mm-a-dark').trim() ===
          '#79c39a');

      // The edges carry the accent too, or a recoloured branch would keep its
      // old curves: one from the root to Design, one on to Architecture.
      check(139, 'the curves into a named branch take its colour',
        Array.prototype.filter.call(
          document.querySelectorAll('#colourmark .mm-edge'),
          function (e) { return e.style.getPropertyValue('--mm-a').trim() === '#3f7d5c'; }
        ).length === 2);

      var bad = document.querySelector('#colourempty .mm-error');
      check(140, 'a colour marker with no text after it names the line',
        !!bad && bad.textContent.indexOf('Line 2') > -1 &&
        bad.textContent.indexOf('colour marker') > -1);

      var lit = labelsIn('colourliteral');
      check(141, 'a colour marker without its space is just a label',
        lit.indexOf('[green]NoSpace') > -1 && lit.indexOf('Child') > -1);
      check(142, 'a backslash keeps a literal colour marker in the label',
        lit.indexOf('[blue] Escaped') > -1);
      check(143, 'a bracketed word that names no accent is left alone',
        lit.indexOf('[TODO] Revise this') > -1 &&
        accentIn('colourliteral', '[TODO] Revise this') === '#3f7d5c');

      var raw = labelsIn('colourraw');
      check(144, 'a colour marker and its escape are read with markup off',
        accentIn('colourraw', 'Marked') === '#2f7f8f' &&
        raw.indexOf('[green] Escaped') > -1);
    })();

    // --- a named centre node ---
    //
    // The centre node is the one box painted from the theme rather than from
    // the palette, so a name there redirects the theme's two centre colours
    // instead of joining the accents. It takes the bright half of the pair in
    // both themes, which is why neither assertion below has a dark variant to
    // accept: the colour a named centre lands on is the same either way.
    (function () {
      function rootIn(id) {
        return document.querySelector('#' + id + ' .mm-root');
      }
      function accentIn(id, name) {
        var g = nodeIn(id, name);
        return g ? g.style.getPropertyValue('--mm-a').trim() : '';
      }
      function labelOf(g) { return g.querySelector('.mm-label').textContent; }

      var named = rootIn('rootcolour');
      check(208, 'a name on the centre line fills it with the bright half of its pair',
        named.style.getPropertyValue('--mm-root-bg') === '#ddb85c' &&
        getComputedStyle(named.querySelector('.mm-box')).fill === 'rgb(221, 184, 92)');
      check(209, 'the centre label flips to the ink that reads on every bright half',
        named.style.getPropertyValue('--mm-root-text') === '#161b22' &&
        getComputedStyle(named.querySelector('.mm-label')).fill === 'rgb(22, 27, 34)');

      // Both themes are accepted: the suite runs in whichever one the machine
      // prefers, and the point is that the centre node followed it.
      var plain = rootIn('single');
      check(210, 'an unnamed centre node is still painted by the theme',
        !plain.style.getPropertyValue('--mm-root-bg') &&
        !plain.style.getPropertyValue('--mm-root-text') &&
        ['rgb(44, 62, 80)', 'rgb(223, 230, 238)'].indexOf(
          getComputedStyle(plain.querySelector('.mm-box')).fill) > -1);

      // The branch painter never reaches the centre, so a name there is about
      // that one box: it takes no slot from the branches and leaves no marker.
      check(211, 'a name on the centre line changes nothing but that box',
        labelOf(named) === 'Software Engineering' &&
        accentIn('rootcolour', 'Requirements') === '#3b6ea5' &&
        accentIn('rootcolour', 'Design') === '#b0563a' &&
        accentIn('rootcolour', 'Testing') === '#3f7d5c');

      var escaped = rootIn('rootcolourescape');
      var literal = rootIn('rootcolourliteral');
      check(212, 'a centre line that only looks like a name is left as typed',
        labelOf(escaped) === '[gold] Course map' &&
        !escaped.style.getPropertyValue('--mm-root-bg') &&
        labelOf(literal) === '[Draft] Course map' &&
        !literal.style.getPropertyValue('--mm-root-bg'));
    })();

    // --- the centre node's focus ring ---
    //
    // The centre node is the one box *filled* with --mm-root-bg, so the ring
    // every other node takes — a stroke in that same colour — lands invisibly
    // on it. It carries a ring of its own instead, set inside the box and
    // drawn in the ink the label already uses.
    (function () {
      function ringOf(root) { return root.querySelector('.mm-root-ring'); }
      function num(el, name) { return parseFloat(el.getAttribute(name)); }

      // Every map on the page rather than one fixture, so a centre node whose
      // box a late re-measure resized is included: a ring left at the old size
      // would straddle the box's edge instead of sitting inside it.
      var centres = Array.prototype.slice.call(
        document.querySelectorAll('.mm-container .mm-root'));
      check(215, 'every centre node carries a ring, out of sight and inside its box',
        centres.length >= 40 && centres.every(function (g) {
          var ring = ringOf(g);
          var box = g.querySelector('.mm-box');
          if (!ring || !box) return false;
          return getComputedStyle(ring).display === 'none' &&
            num(ring, 'x') > 0 && num(ring, 'y') > 0 &&
            num(ring, 'x') + num(ring, 'width') < num(box, 'width') &&
            num(ring, 'y') + num(ring, 'height') < num(box, 'height');
        }));

      // Read against the label rather than against a colour literal: the ink
      // is picked from the fill's own luminance, so tying the ring to it is
      // what makes the same statement hold for the theme's centre colours and
      // for a name from the palette alike.
      function inkMatches(root) {
        var stroke = getComputedStyle(ringOf(root)).stroke;
        return stroke === getComputedStyle(root.querySelector('.mm-label')).fill &&
               stroke !== getComputedStyle(root.querySelector('.mm-box')).fill;
      }
      check(216, 'the ring is drawn in the ink that reads on the fill, not the fill',
        inkMatches(document.querySelector('#single .mm-root')) &&
        inkMatches(document.querySelector('#rootcolour .mm-root')) &&
        inkMatches(document.querySelector('#rootcolourdark .mm-root')) &&
        document.querySelectorAll('.mm-container .mm-root-ring').length ===
          document.querySelectorAll('.mm-container .mm-root').length &&
        document.querySelectorAll('.mm-node:not(.mm-root) .mm-root-ring').length === 0);

      // The state itself is out of reach from here: :focus-visible is the
      // browser's own judgement about how a focus arrived, and page script
      // cannot make a programmatic one look like a keyboard's — a real key
      // press through the browser is what confirms the drawn result. What is
      // in reach is the wiring, and it is the half that has gone wrong before:
      // a ring that resolves to the colour underneath it is a rule pointed at
      // the wrong element, not a browser being difficult. So each focus rule
      // is asked which elements it claims, by stripping the pseudo-class off
      // its selector and matching what is left.
      function focusRules() {
        var sheet = document.getElementById('mind-maps-helper-styles').sheet;
        return Array.prototype.filter.call(sheet.cssRules, function (rule) {
          return rule.selectorText &&
            rule.selectorText.indexOf(':focus-visible') > -1;
        });
      }
      /** What a focus would set on `el`, for one property. */
      function onFocus(el, prop) {
        var value = '';
        focusRules().forEach(function (rule) {
          if (!el.matches(rule.selectorText.replace(/:focus-visible/g, ''))) return;
          var v = rule.style.getPropertyValue(prop);
          if (v) value = v;
        });
        return value;
      }

      var centre = document.querySelector('#single .mm-root');
      var centreRing = ringOf(centre);
      // The centre box takes nothing at all: the ring is the whole indicator
      // there, and the shared stroke would only fatten the silhouette in the
      // fill's own colour — the non-indicator this replaced.
      check(217, 'focus reveals the centre ring and leaves the centre box alone',
        getComputedStyle(centreRing).display === 'none' &&
        onFocus(centreRing, 'display') === 'inline' &&
        onFocus(centre.querySelector('.mm-box'), 'stroke') === '' &&
        onFocus(centre.querySelector('.mm-box'), 'stroke-width') === '');

      // Both arms of the shared rule: a node that can be dragged, and one on a
      // map where dragging is off and folding is all the focus is for.
      var draggable = nodeIn('rootdrag', 'Alpha').querySelector('.mm-box');
      var foldOnly = document.querySelector('#nodrag .mm-interactive .mm-box');
      check(218, 'ordinary nodes still take the shared focus stroke',
        [draggable, foldOnly].every(function (box) {
          return onFocus(box, 'stroke') === 'var(--mm-root-bg)' &&
                 onFocus(box, 'stroke-width') === '2.4';
        }));

      // The ring's colour is settled one box at a time, from the fill under
      // it, so every slot a name can reach is its own case.
      var slots = Array.prototype.slice.call(
        document.querySelectorAll('#rootcolourall .mm-root'));
      check(221, 'a named centre is legible in every slot of the palette',
        slots.length === MindMap.palette.length && slots.every(readable) &&
        readable(document.querySelector('#single .mm-root')) &&
        readable(document.querySelector('#rootcolourdark .mm-root')));

      // The three things outside the drawing that focus in --mm-root-bg too.
      // They read it off the container, where a named centre's inline override
      // cannot reach them, so they have to be left on the theme's colour.
      check(222, 'the shape switch, the credit link and the fold badge are left alone',
        onFocus(document.querySelector('#credit .mm-ctl'), 'outline')
          .indexOf('var(--mm-root-bg)') > -1 &&
        onFocus(document.querySelector('#credit .mm-credit-link'), 'outline')
          .indexOf('var(--mm-root-bg)') > -1 &&
        onFocus(document.querySelector('#rootdrag .mm-toggle-bg'), 'stroke') ===
          'var(--mm-root-bg)');
    })();

    // --- emphasis markers ---
    (function () {
      function mode(id, name) {
        var g = nodeIn(id, name);
        if (!g) return 'missing';
        return g.classList.contains('mm-dim') ? 'dim' :
               g.classList.contains('mm-hot') ? 'hot' : 'plain';
      }
      function labelsIn(id) {
        return Array.prototype.map.call(
          document.getElementById(id).querySelectorAll('.mm-label'),
          function (l) { return l.textContent; });
      }
      function countIn(id, sel) {
        return document.getElementById(id).querySelectorAll(sel).length;
      }

      check(145, 'a dimmed node takes its whole subtree down with it',
        mode('emphasis', 'Covered') === 'dim' &&
        mode('emphasis', 'Elicitation') === 'dim' &&
        mode('emphasis', 'Interviews') === 'dim');
      check(146, 'a highlighted node brings its subtree up with it',
        mode('emphasis', 'Today') === 'hot' &&
        mode('emphasis', 'Design patterns') === 'hot');
      check(147, 'normal steps a node and its own subtree back out',
        mode('emphasis', 'Aside') === 'plain' &&
        mode('emphasis', 'Later') === 'plain');
      check(148, 'an unmarked branch is left alone',
        mode('emphasis', 'Ahead') === 'plain');

      // One curve per node below the root, each carrying the emphasis of the
      // node it arrives at: five into the dimmed nodes, three into the
      // highlighted ones.
      check(149, 'the curves take the emphasis of the node they arrive at',
        countIn('emphasis', '.mm-edge-dim') === 5 &&
        countIn('emphasis', '.mm-edge-hot') === 3);

      var stacked = nodeIn('emphasis', 'Stacked');
      check(150, 'emphasis stacks with fold and colour markers, and none reaches the label',
        !!stacked && stacked.classList.contains('mm-collapsed') &&
        stacked.classList.contains('mm-dim') &&
        stacked.style.getPropertyValue('--mm-a').trim() === '#a8842c' &&
        labelsIn('emphasis').join('|').indexOf('[') === -1);

      // Same text, same depth, one of them highlighted: the heavier label has
      // to have been measured heavier, or it would overflow its box.
      var pair = nodesNamed('emphasis', 'Sizing sample');
      var weights = pair.map(function (g) {
        return g.querySelector('.mm-label text').getAttribute('font-weight');
      });
      var widths = pair.map(function (g) {
        return parseFloat(g.querySelector('.mm-box').getAttribute('width'));
      });
      check(151, 'a highlighted label is drawn heavier, and its box grew to fit',
        pair.length === 2 && weights[0] === '400' && weights[1] === '700' &&
        widths[1] > widths[0]);

      var bad = document.querySelector('#emphasisempty .mm-error');
      check(152, 'an emphasis marker with no text after it names the line',
        !!bad && bad.textContent.indexOf('Line 2') > -1 &&
        bad.textContent.indexOf('emphasis marker') > -1);

      var lit = labelsIn('emphasisliteral');
      check(153, 'an emphasis marker without its space, escaped, or unknown, is just a label',
        lit.indexOf('[dim]NoSpace') > -1 && lit.indexOf('Child') > -1 &&
        lit.indexOf('[hot] Escaped') > -1 &&
        lit.indexOf('[Draft] Notes') > -1 &&
        mode('emphasisliteral', '[Draft] Notes') === 'plain');

      var rawLabels = labelsIn('emphasisraw');
      check(154, 'an emphasis marker and its escape are read with markup off',
        mode('emphasisraw', 'Marked') === 'hot' &&
        rawLabels.indexOf('[dim] Escaped') > -1);

      // Dimming has to stay readable: a dimmed topic is one the reader is
      // past, not one they cannot read. The label is recoloured rather than
      // faded, so it must carry no opacity of its own and must land on the
      // muted text colour — whichever theme the suite is running in.
      var dimLabel = getComputedStyle(nodeIn('emphasis', 'Covered').querySelector('.mm-label'));
      check(156, 'a dimmed label is recoloured, not faded to an unreadable one',
        dimLabel.opacity === '1' &&
        ['rgb(91, 105, 118)', 'rgb(167, 179, 192)'].indexOf(dimLabel.fill) > -1);

      // Emphasis is a node standing out from the ones around it, and the
      // centre node has nothing to stand out from.
      check(157, 'an emphasis marker on the centre node is dropped, marker and all',
        countIn('emphasisroot', '.mm-dim') === 0 &&
        countIn('emphasisroot', '.mm-edge-dim') === 0 &&
        !!nodeIn('emphasisroot', 'Centre'));

      // The drawing is the only place emphasis shows, so the outline has to
      // say it in words — once, where it changes.
      var outline = document.querySelector('#emphasis .mm-a11y').textContent;
      check(155, 'the outline names emphasis where it changes, and only there',
        outline.indexOf('Covered (dimmed)') > -1 &&
        outline.indexOf('Today (highlighted)') > -1 &&
        outline.indexOf('Aside (normal)') > -1 &&
        outline.indexOf('Elicitation (dimmed)') === -1);
    })();

    // --- embedded page HTML ---
    (function () {
      var done = group('embedded HTML');
      var host = document.getElementById('embed');
      var blocks = host.querySelectorAll('foreignObject.mm-embed-host');

      check(79, 'both references became embedded blocks', blocks.length === 2);
      check(80, 'the hidden source is copied, not moved',
        !!document.getElementById('src-hidden') &&
        host.querySelectorAll('.mm-embed table td').length === 2);
      check(81, 'a template is unwrapped into the node',
        host.querySelectorAll('.mm-embed .probe b').length === 1);

      check(82, 'no script came along with the copy',
        host.querySelectorAll('.mm-embed script').length === 0 &&
        window.__ranEmbeddedScript === undefined);
      check(83, 'inline handlers are stripped',
        !host.querySelector('.mm-embed [onclick]'));
      check(84, 'ids are stripped, so the page keeps one of each',
        document.querySelectorAll('#inner-id').length === 0 &&
        !host.querySelector('.mm-embed [id]'));

      // The same reasoning that drops a <script> drops everything else that has
      // never been live inside a <template> and would start on insertion.
      var active = document.getElementById('embedactive');
      check(97, 'nothing that would start running survives the copy',
        !active.querySelector('.mm-embed iframe,.mm-embed base,.mm-embed script') &&
        window.__ranEmbeddedFrame === undefined &&
        window.__ranEmbeddedSvgScript === undefined &&
        !!active.querySelector('.mm-embed b'));
      check(98, 'javascript: URLs go, ordinary attributes stay',
        !active.querySelector('.mm-embed a[href^="javascript"]') &&
        window.__ranEmbeddedUrl === undefined &&
        !!active.querySelector('.mm-embed a[href="#somewhere"]') &&
        active.querySelector('.mm-embed a[title]').getAttribute('title')
          .indexOf('javascript:') === 0);

      var tableNode = host.querySelector('.mm-embed table').closest('.mm-node');
      var box = tableNode.querySelector('.mm-box');
      var fo = tableNode.querySelector('foreignObject');
      check(85, 'the node box grew to hold the block',
        parseFloat(box.getAttribute('width')) > parseFloat(fo.getAttribute('width')) &&
        parseFloat(box.getAttribute('height')) > parseFloat(fo.getAttribute('height')));

      // The block is content, so only the badge folds the branch.
      check(86, 'a node holding a block is marked and is not click-to-fold',
        tableNode.classList.contains('mm-has-embed') &&
        !tableNode.classList.contains('mm-interactive'));

      var badge = tableNode.querySelector('.mm-toggle');
      // In user units, not rendered pixels: a map narrower than its column is
      // scaled down as a whole, and the badge goes with it the same way the
      // labels do. 24 units is what the drawing controls.
      check(112, 'the fold badge is given a target worth aiming at',
        badge.getBBox().height >= 24);
      check(87, 'the badge carries the button role instead of the node',
        badge.getAttribute('role') === 'button' &&
        tableNode.getAttribute('role') !== 'button');

      var beforeFold = tableNode.classList.contains('mm-collapsed');
      host.querySelector('.mm-embed td').dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }));
      check(88, 'clicking inside the block does not fold the branch',
        tableNode.classList.contains('mm-collapsed') === beforeFold);

      badge.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      settled('embed', function () {
        check(89, 'the badge still folds it',
          tableNode.classList.contains('mm-collapsed') !== beforeFold);

        var sized = document.getElementById('embedsize')
          .querySelectorAll('foreignObject.mm-embed-host');
        check(90, 'an explicit size hint is honoured',
          parseFloat(sized[0].getAttribute('width')) === 90 &&
          parseFloat(sized[0].getAttribute('height')) === 40);
        check(91, 'data-embed-max-width caps an unsized block',
          parseFloat(sized[1].getAttribute('width')) <= 120);

        var broken = document.getElementById('embedmissing');
        check(92, 'a missing id gives an error naming it',
          !!broken.querySelector('.mm-error') &&
          broken.textContent.indexOf('no-such-element') > -1);

        done();
      });
    })();

    // Real pointer input. The interaction checks above dispatch events straight
    // at the element they mean, which skips the three things a browser does in
    // between: hit testing, pointer capture, and the click it sends after the
    // release. Capture is the one that bites — it retargets that click to the
    // capturing element, so a listener on a descendant never hears it, which is
    // why NO_DRAG_FROM exists. Page script cannot make a trusted event, so this
    // lane rebuilds the contract instead: the target comes from
    // elementFromPoint, capture is recorded as the library takes it, and
    // everything after the press goes where a browser would send it.
    (function () {
      var done = group('real pointer input');
      var host = document.getElementById('realinput');
      var captured = null;
      var realCapture = Element.prototype.setPointerCapture;
      Element.prototype.setPointerCapture = function () {
        captured = this;
        return realCapture.apply(this, arguments);
      };
      function restore() { Element.prototype.setPointerCapture = realCapture; }

      function show() { host.scrollIntoView({ block: 'center' }); }
      function centreOf(el) {
        var r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
      function commonAncestor(a, b) {
        for (var n = a; n; n = n.parentNode) if (n.contains && n.contains(b)) return n;
        return document;
      }
      function send(el, type, at, kind) {
        el.dispatchEvent(new PointerEvent(type, {
          bubbles: true, cancelable: true,
          pointerId: kind === 'touch' ? 7 : 5, pointerType: kind || 'mouse',
          isPrimary: true, clientX: at.x, clientY: at.y,
          button: 0, buttons: type === 'pointerup' ? 0 : 1
        }));
      }

      /**
       * One press, an optional move, and a release — then the click the browser
       * sends afterwards: at the capturing element if the press took capture,
       * and otherwise at the nearest element holding both ends of the gesture,
       * which is where a real click lands.
       */
      function gesture(from, to, kind) {
        captured = null;
        var down = document.elementFromPoint(from.x, from.y);
        if (!down) return null;
        send(down, 'pointerdown', from, kind);
        var taken = captured;
        var end = to || from;
        if (to) send(taken || document.elementFromPoint(end.x, end.y) || down,
                     'pointermove', end, kind);
        var up = taken || document.elementFromPoint(end.x, end.y) || down;
        send(up, 'pointerup', end, kind);
        var clicked = taken || commonAncestor(down, up);
        clicked.dispatchEvent(new MouseEvent('click',
          { bubbles: true, cancelable: true, clientX: end.x, clientY: end.y }));
        return { down: down, up: up, capture: taken, clicked: clicked };
      }

      function nodeNamed(name) { return nodeMatching(host, name); }
      var pos = posOf;

      // Hit testing needs somewhere to hit: a headless or zero-sized tab has
      // no viewport, elementFromPoint returns null wherever it is asked, and
      // every check below would fail for a reason that is nothing to do with
      // the library. Say that plainly instead — the same trap the reduced
      // motion shim in the <head> exists for.
      if (!window.innerWidth || !window.innerHeight) {
        for (var n = 160; n <= 166; n++) {
          skip(n, 'real pointer input', 'this tab has no viewport to hit test in');
        }
        restore();
        done();
        return;
      }

      show();
      var req = nodeNamed('Requirements');
      var kid = nodeNamed('Stakeholders');
      var reqBefore = pos(req), kidBefore = pos(kid);
      var from = centreOf(req.querySelector('.mm-box'));
      var drag = gesture(from, { x: from.x + 46, y: from.y + 28 });

      check(160, 'a press on a node is hit tested to it, and captures the pointer',
        !!drag && req.contains(drag.down) && drag.capture === req);
      var reqAfter = pos(req), kidAfter = pos(kid);
      check(161, 'the drag carried the subtree, and the click after it did not fold',
        Math.abs(reqAfter.x - reqBefore.x) > 10 &&
        Math.abs((kidAfter.x - kidBefore.x) - (reqAfter.x - reqBefore.x)) < 0.6 &&
        drag.clicked === req && !req.classList.contains('mm-collapsed') &&
        req.getAttribute('aria-expanded') === 'true');

      var still = gesture(centreOf(req.querySelector('.mm-box')), null);
      settled('realinput', function () {
        check(162, 'a press that does not move still folds the branch',
          !!still && still.capture === req && still.clicked === req &&
          req.classList.contains('mm-collapsed') &&
          req.getAttribute('aria-expanded') === 'false' &&
          nodeNamed('Stakeholders').style.display === 'none');

        show();
        var design = nodeNamed('Design');
        var badge = design.querySelector('.mm-toggle');
        var press = gesture(centreOf(badge), null);
        settled('realinput', function () {
          check(163, 'a press on the fold badge takes no capture, and folds the branch',
            !!press && badge.contains(press.down) && press.capture === null &&
            design.classList.contains('mm-collapsed') &&
            nodeNamed('Patterns').style.display === 'none');

          show();
          var reading = nodeNamed('Reading');
          var link = reading.querySelector('a.mm-link');
          var readBefore = pos(reading);
          var linkAt = centreOf(link);
          var pulled = gesture(linkAt, { x: linkAt.x + 46, y: linkAt.y + 22 });
          check(164, 'a press on a link takes no capture, so nothing is dragged',
            !!pulled && link.contains(pulled.down) && pulled.capture === null &&
            Math.abs(pos(reading).x - readBefore.x) < 0.001 &&
            Math.abs(pos(reading).y - readBefore.y) < 0.001);

          // Stop the browser following the link, from the far end of the
          // bubble so the library's own handlers have already had their say.
          var throughFold = reading.classList.contains('mm-collapsed');
          var untouched = null;
          function swallow(ev) { untouched = !ev.defaultPrevented; ev.preventDefault(); }
          document.addEventListener('click', swallow);
          var tap = gesture(centreOf(link), null);
          document.removeEventListener('click', swallow);
          settled('realinput', function () {
            check(165, 'the link keeps its own click, and its node does not fold',
              !!tap && link.contains(tap.clicked) && untouched === true &&
              reading.classList.contains('mm-collapsed') === throughFold);

            show();
            var touched = nodeNamed('Design');
            var wasFolded = touched.classList.contains('mm-collapsed');
            var touchBefore = pos(touched);
            var at = centreOf(touched.querySelector('.mm-box'));
            var swipe = gesture(at, { x: at.x + 44, y: at.y + 26 }, 'touch');
            check(166, 'a touch drag moves the node the way a mouse drag does',
              !!swipe && swipe.capture === touched &&
              getComputedStyle(touched).touchAction === 'pan-y' &&
              Math.abs(pos(touched).x - touchBefore.x) > 10 &&
              touched.classList.contains('mm-collapsed') === wasFolded);

            restore();
            done();
          });
        });
      });
    })();

    // The documented API, exercised as an API rather than as setup for
    // something else.
    (function () {
      var done = group('the API');
      var tree = MindMap.parse(
        '- Root\n' +
        '  // a comment\n' +
        '  * [+] [green] Folded\n' +
        '    + Leaf\n' +
        '\n' +
        '  [dim] Quiet\n');
      var folded = tree.children[0];
      var leaf = folded.children[0];
      var quiet = tree.children[1];

      check(167, 'parse hands back the tree on its own: labels, depth, parents, lines',
        tree.label === 'Root' && tree.depth === 0 && tree.parent === null &&
        tree.children.length === 2 &&
        folded.depth === 1 && folded.parent === tree &&
        leaf.depth === 2 && leaf.parent === folded && !leaf.children.length &&
        tree.lineNo === 1 && folded.lineNo === 3 && leaf.lineNo === 4 &&
        quiet.lineNo === 6);
      check(168, 'bullets and comments are gone, and the markers came off as metadata',
        folded.label === 'Folded' && leaf.label === 'Leaf' && quiet.label === 'Quiet' &&
        folded.fold === '+' && folded.accent === 2 && folded.mode === null &&
        quiet.mode === 'dim' && quiet.fold === null && quiet.accent === null &&
        // A marker only says how the map should open; render is what acts on it.
        folded.collapsed === false);

      var source = 'Scoped\n  One\n    a\n    b\n  Two\n    c';
      var inside = document.createElement('div');
      var outside = document.createElement('div');
      inside.innerHTML = '<pre class="mindmap">' + source + '</pre>';
      outside.innerHTML = '<pre class="mindmap">Untouched\n  One</pre>';
      document.body.appendChild(inside);
      document.body.appendChild(outside);

      var drawn = MindMap.renderAll(inside);
      check(169, 'renderAll(scope) draws that scope only, and hands back its maps',
        drawn.length === 1 && drawn[0] === inside.querySelector('.mm-container') &&
        inside.querySelectorAll('.mm-box').length === 6 &&
        !!outside.querySelector('pre.mindmap') && !outside.querySelector('.mm-container'));
      check(170, 'a second pass over the same scope finds nothing left to draw',
        MindMap.renderAll(inside).length === 0 &&
        inside.querySelectorAll('.mm-container').length === 1);
      outside.remove();

      var container = inside.querySelector('.mm-container');
      var innerNode = container.querySelector('.mm-node');
      var loose = document.createElement('div');
      loose.appendChild(document.createTextNode('not a map'));
      document.body.appendChild(loose);

      check(171, 'a stateful call takes the container, or anything inside it',
        MindMap.setDirection(container, 'right') === true &&
        MindMap.setDirection(innerNode, 'balanced') === true &&
        MindMap.resetPositions(innerNode) === true &&
        MindMap.collapseAll(innerNode) === true &&
        MindMap.expandAll(innerNode) === true);
      check(172, 'an element that is not a rendered map is refused, and left alone',
        MindMap.setDirection(loose, 'right') === false &&
        MindMap.collapseAll(loose) === false &&
        MindMap.expandAll(loose) === false &&
        MindMap.resetPositions(loose) === false &&
        MindMap.refresh(loose) === false &&
        loose.childNodes.length === 1 && !loose.querySelector('*'));
      loose.remove();

      function visibleIn(el) { return visibleLabels(el).length; }
      function expandedIn(el) {
        return Array.prototype.map.call(el.querySelectorAll('[aria-expanded]'),
          function (g) { return g.getAttribute('aria-expanded'); }).join(',');
      }

      MindMap.collapseAll(container);
      settled(container, function () {
        var shut = visibleIn(container), shutAria = expandedIn(container);
        MindMap.expandAll(container);
        settled(container, function () {
          check(173, 'collapseAll then expandAll puts every branch back, aria and all',
            shut === 3 && shutAria === 'false,false' &&
            visibleIn(container) === 6 && expandedIn(container) === 'true,true');
          inside.remove();
          done();
        });
      });
    })();

    // Options may sit on the source, on its <pre>, or on the highlighter's
    // wrapper, and the innermost one wins. This is the shape a Markdown host
    // actually produces, and the glue that reads it has no other check.
    (function () {
      var layered = document.querySelector('#optlayers .mm-container');
      var refs = document.querySelectorAll('#optrefs .mm-container');

      function oneSided(map) {
        var svg = map.querySelector('.mm-svg');
        var root = boxRect(svg.querySelector('.mm-root'));
        return Array.prototype.every.call(svg.querySelectorAll('.mm-node'), function (g) {
          return g.classList.contains('mm-root') || boxRect(g).x >= root.x + root.w;
        });
      }
      function viewBox(map) { return map.querySelector('.mm-svg').getAttribute('viewBox'); }

      check(174, 'the innermost value wins, attribute by attribute',
        !!layered &&
        // direction: "right" on the <code>, against balanced and left above it
        oneSided(layered) &&
        // markup: on at the <pre>, against off on the wrapper
        layered.textContent.indexOf('**Bold**') === -1 &&
        Array.prototype.some.call(layered.querySelectorAll('text'), function (t) {
          return t.textContent === 'Bold' && t.getAttribute('font-weight') === '700';
        }) &&
        // controls: on at the <pre>, against off on the wrapper
        !!layered.querySelector('.mm-controls'));

      check(175, 'an empty value falls through to the ancestor that has one',
        refs.length === 2 && viewBox(layered) === viewBox(refs[0]) &&
        viewBox(refs[0]) !== viewBox(refs[1]));
    })();

    // Marker orders. Table-driven against one expectation, because the failure
    // worth catching is one order behaving unlike the rest.
    (function () {
      var maps = document.getElementById('markerstack').children;

      function reading(map) {
        var g = Array.prototype.filter.call(map.querySelectorAll('.mm-node'), function (n) {
          return n.querySelector('.mm-label').textContent.indexOf('Marked') > -1;
        })[0];
        if (!g) return { label: 'missing' };
        return {
          label: g.querySelector('.mm-label').textContent,
          folded: g.classList.contains('mm-collapsed'),
          accent: g.style.getPropertyValue('--mm-a').trim(),
          emphasis: g.classList.contains('mm-dim') ? 'dim' :
                    g.classList.contains('mm-hot') ? 'hot' : null
        };
      }
      function kindOf(order) {
        return order.escaped ? 'escaped' : order.raw ? 'raw' :
               order.pair ? 'pair' : 'plain';
      }
      function every(kind, want) {
        var seen = 0;
        for (var i = 0; i < MARKER_ORDERS.length; i++) {
          if (kindOf(MARKER_ORDERS[i]) !== kind) continue;
          var got = reading(maps[i]);
          seen++;
          if (got.label !== want.label || got.folded !== want.folded ||
              got.accent !== want.accent || got.emphasis !== want.emphasis) return 0;
        }
        return seen;
      }

      var all = { label: 'Marked', folded: true, accent: '#3f7d5c', emphasis: 'dim' };
      var pair = { label: 'Marked', folded: true, accent: '#3f7d5c', emphasis: null };

      check(176, 'the three markers stack in any of the six orders',
        maps.length === MARKER_ORDERS.length && every('plain', all) === 6);
      check(177, 'colour and fold stack either way round on their own',
        every('pair', pair) === 2);
      check(178, 'the orders read the same with markup off',
        every('raw', all) === 2);

      var escaped = reading(maps[MARKER_ORDERS.length - 1]);
      check(179, 'an escaped leading marker stops the run before any of them',
        escaped.label === '[+] [green] [dim] Marked' && escaped.folded === false &&
        escaped.emphasis === null && escaped.accent === '#3b6ea5');
    })();

    // Two unsized images finishing in the reverse of the order they were
    // started, with a fold and a drag made while they were still in flight.
    // The re-measure is held until the last one settles, so the finished map
    // has to carry both natural sizes and keep whatever the reader did
    // meanwhile. Real files load in whatever order the network gives them, so
    // the loader is stood in for here to make the order the point.
    (function () {
      var done = group('the image race');
      var loaders = [];
      var RealImage = window.Image;
      window.Image = function () {
        var img = { onload: null, onerror: null, naturalWidth: 0, naturalHeight: 0 };
        Object.defineProperty(img, 'src', {
          get: function () { return img.from; },
          set: function (value) { img.from = value; loaders.push(img); }
        });
        return img;
      };
      var map = MindMap.render(document.getElementById('race-src'));
      window.Image = RealImage;

      function named(name) { return nodeMatching(map, name); }
      var pos = posOf;
      var pointer = pointerFor(9);
      function pick(part) {
        return loaders.filter(function (i) { return i.from.indexOf(part) > -1; })[0];
      }

      var started = loaders.map(function (i) { return i.from; }).join('|');
      var wide = pick('race-wide'), tall = pick('race-tall');

      // Last one first.
      tall.naturalWidth = 60; tall.naturalHeight = 180; tall.onload();

      var alpha = named('alpha');
      var beta = named('beta');
      var betaBefore = pos(beta);
      alpha.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      var r = beta.getBoundingClientRect();
      pointer(beta, 'pointerdown', r.left + 5, r.top + 5);
      pointer(beta, 'pointermove', r.left + 45, r.top + 35);
      pointer(beta, 'pointerup', r.left + 45, r.top + 35);
      var draggedBy = pos(beta).x - betaBefore.x;

      wide.naturalWidth = 240; wide.naturalHeight = 120; wide.onload();

      settled(map, function () {
        var images = map.querySelectorAll('.mm-image');
        function sizeOf(i) {
          return images[i].getAttribute('width') + 'x' + images[i].getAttribute('height');
        }
        check(180, 'both unsized images settle at their own scaled size, late one first',
          started === 'img/race-wide.svg|img/race-tall.svg' &&
          images.length === 2 && sizeOf(0) === '120x60' && sizeOf(1) === '30x90');

        var boxes = [named('alpha'), named('beta')].map(function (g) {
          return g.querySelector('.mm-box');
        });
        var bounds = map.querySelector('.mm-svg').getAttribute('viewBox').split(' ');
        check(181, 'the boxes, the curves and the canvas all grew with them',
          parseFloat(boxes[0].getAttribute('width')) >= 120 &&
          parseFloat(boxes[1].getAttribute('height')) >= 90 &&
          edgesMeetBoxes(map) &&
          parseFloat(bounds[2]) >= 120 && parseFloat(bounds[3]) >= 90);

        check(182, 'the fold and the drag made mid-load are still there afterwards',
          draggedBy > 10 &&
          named('alpha').classList.contains('mm-collapsed') &&
          named('Child').style.display === 'none' &&
          Math.abs((pos(named('beta')).x - betaBefore.x) - draggedBy) < 0.6);
        done();
      });
    })();

    // The outline is the whole map to a screen reader, so it has to mirror the
    // whole tree — folded branches included, since a reader who cannot see the
    // drawing cannot unfold anything either.
    (function () {
      var host = document.getElementById('outline');
      var outline = host.querySelector('.mm-a11y');

      /** One item's own text, without its children's. */
      function ownText(el) {
        var copy = el.cloneNode(true);
        Array.prototype.forEach.call(copy.querySelectorAll('ul'), function (ul) {
          ul.parentNode.removeChild(ul);
        });
        return copy.textContent.replace(/\s+/g, ' ').trim();
      }
      function shape(list) {
        return Array.prototype.map.call(list.children, function (li) {
          var kids = li.querySelector('ul');
          return kids ? [ownText(li), shape(kids)] : [ownText(li)];
        });
      }

      // A block is named by the author's alt text, and where there is none by
      // the opening of its own text — capped, because a block can be a whole
      // table and an outline that reads one out buries the labels around it.
      var longText = document.getElementById('src-outline-long')
        .content.firstElementChild.textContent.replace(/\s+/g, ' ').trim();
      var capped = longText.slice(0, 79) + '\u2026';

      var want = [
        ['Folded branch', [['Hidden child', [['Deeper hidden']]]]],
        ['Links and pictures', [['See Lecture 3'], ['Icon a red dot inline']]],
        ['Blocks', [['Marks card'], ['Outline card'], [capped]]]
      ];

      check(183, 'the outline opens with the centre node and mirrors the whole tree',
        !!outline && outline.children.length === 2 &&
        outline.firstElementChild.tagName === 'P' &&
        ownText(outline.firstElementChild) === 'Outline root' &&
        JSON.stringify(shape(outline.lastElementChild)) === JSON.stringify(want) &&
        // Spelled out here even though the drawing has them folded away.
        Array.prototype.filter.call(host.querySelectorAll('.mm-node'), function (g) {
          return g.style.display === 'none';
        }).length === 2);

      var link = outline.querySelector('a');
      var blocks = host.querySelector('.mm-container').mindMap
        .root.children[2].children;
      check(184, 'pictures and blocks are named, and the link is a usable one',
        !!link && link.getAttribute('href') === 'week3.html' &&
        link.textContent === 'Lecture 3' &&
        outline.textContent.indexOf('a red dot') > -1 &&
        // Alt text where the author wrote it, and the block's own opening text
        // where they did not — never a node reaching a screen reader nameless.
        outline.textContent.indexOf('Marks card') > -1 &&
        outline.textContent.indexOf('Outline card') > -1 &&
        longText.length > 80 && capped.length === 80 &&
        outline.textContent.indexOf(longText) === -1 &&
        // The block itself stays where the author put it; only its name is
        // borrowed, and it is the same name the node reports for itself, so
        // the outline and a branch's toggle cannot disagree about one block.
        !outline.querySelector('.probe') &&
        blocks[0].plain === 'Marks card' && blocks[1].plain === 'Outline card' &&
        blocks[2].plain === capped);

      check(185, 'the outline adds no tab stop of its own',
        Array.prototype.every.call(outline.querySelectorAll('a,[tabindex]'), function (el) {
          return el.getAttribute('tabindex') === '-1';
        }) &&
        // The same link is reachable in the drawing, where it can be seen.
        !!host.querySelector('.mm-svg a.mm-link[href="week3.html"]'));
    })();

    // ---- schemes spelled so a plain text match will not see them
    //
    // Built here rather than written into the page, because these strings do
    // not survive being typed: an HTML parser has its own opinion about a raw
    // control character, and the point of the case is the exact bytes.
    (function () {
      var CTRL = String.fromCharCode(1);
      var disguises = [
        CTRL + 'javascript:window.__ranDisguised = 1',  // leading control
        'java\tscript:window.__ranDisguised = 2',       // tab inside the scheme
        'java\nscript:window.__ranDisguised = 3'        // newline inside it
      ];

      // A guard against a vacuous case. If this browser did not resolve these
      // to javascript: there would be nothing here to defend against, and the
      // checks below would pass by accident rather than on purpose.
      var resolves = disguises.every(function (url) {
        var probe = document.createElement('a');
        probe.href = url;
        return probe.protocol === 'javascript:';
      });

      // Only some of these can reach a node label at all. A newline ends the
      // line and takes the link with it, and the parser expands every tab to
      // spaces before it reads anything, which leaves the control character as
      // the one that arrives intact. All three reach an embed attribute
      // though, which is what the second half of this case is for.
      var inLabels = disguises.filter(function (url) {
        return !/[\t\n]/.test(url);
      });

      var src = 'Disguised\n';
      for (var i = 0; i < inLabels.length; i++) {
        src += '  [click ' + i + '](' + inLabels[i] + ')\n';
      }
      src += '  [real](https://example.com/ok)\n';

      var labelHost = document.createElement('div');
      labelHost.appendChild(document.createElement('pre')).textContent = src;
      labelHost.firstChild.className = 'mindmap';
      document.body.appendChild(labelHost);
      MindMap.renderAll(labelHost);

      var links = labelHost.querySelectorAll('.mm-svg a.mm-link');
      // The property that matters, asked of the browser rather than of the
      // spelling: nothing drawn resolves to a scheme that executes.
      var executable = Array.prototype.filter.call(links, function (a) {
        var probe = document.createElement('a');
        probe.href = a.getAttribute('href');
        return probe.protocol === 'javascript:' || probe.protocol === 'vbscript:';
      });

      check(186, 'a scheme hidden behind a leading control is refused too',
        resolves && executable.length === 0 &&
        links.length === 1 &&
        links[0].getAttribute('href') === 'https://example.com/ok' &&
        // Refused, not silently dropped: the text stays as the author typed it.
        labelHost.textContent.indexOf('[click 0]') > -1);

      // The same disguises inside an embedded block, which is sanitised by a
      // separate path and used to be checked against the raw attribute text.
      var tpl = document.createElement('template');
      var frag = document.createElement('div');
      frag.className = 'probe';
      for (var j = 0; j < disguises.length; j++) {
        var bad = document.createElement('a');
        bad.setAttribute('href', disguises[j]);
        bad.textContent = 'jump ' + j;
        frag.appendChild(bad);
      }
      var tel = document.createElement('a');
      tel.setAttribute('href', 'tel:+6512345678');
      tel.textContent = 'call';
      frag.appendChild(tel);
      tpl.content.appendChild(frag);
      tpl.id = 'src-disguised';
      document.body.appendChild(tpl);

      var embedHost = document.createElement('div');
      embedHost.appendChild(document.createElement('pre')).textContent =
        'Disguised block\n  ![](#src-disguised)\n';
      embedHost.firstChild.className = 'mindmap';
      document.body.appendChild(embedHost);
      MindMap.renderAll(embedHost);

      var kept = embedHost.querySelectorAll('.mm-embed a');
      var armed = Array.prototype.filter.call(kept, function (a) {
        return a.hasAttribute('href');
      });
      check(187, 'the same disguises are stripped out of an embedded block',
        kept.length === 4 && armed.length === 1 &&
        // A deny list, not an allow list: the author's own schemes still work.
        armed[0].getAttribute('href') === 'tel:+6512345678' &&
        window.__ranDisguised === undefined);

      labelHost.remove();
      embedHost.remove();
      tpl.remove();
    })();

    // ---- the split is settled from the whole tree, folded or not
    (function () {
      function partition(id) {
        var state = document.getElementById(id).querySelector('.mm-container').mindMap;
        return state.sides.map(function (side) {
          return side.nodes.map(function (n) { return n.label; }).join('|');
        }).join(' / ');
      }
      check(188, 'a branch that opens folded is weighed by what it will hold',
        partition('splitopen') === partition('splitfolded') &&
        // The weight is 6 against 2, so the heavy branch goes alone.
        partition('splitopen') === 'Heavy / Light|Also light');
    })();

    // ---- a map too wide for its column opens on its centre
    (function () {
      var scroller = document.getElementById('widecentre').querySelector('.mm-scroll');
      var overflow = scroller.scrollWidth - scroller.clientWidth;
      var rootBox = scroller.querySelector('.mm-root').getBoundingClientRect();
      var viewBox = scroller.getBoundingClientRect();
      // Where the root's centre now sits within the visible strip.
      var offset = rootBox.left + rootBox.width / 2 - viewBox.left;
      check(189, 'a map wider than its column opens with the centre node in view',
        overflow > 0 && scroller.scrollLeft > 0 &&
        Math.abs(offset - scroller.clientWidth / 2) < 2);
    })();

    // ---- a wrapped code span is a chip per line, and each needs its padding
    (function () {
      var host = document.getElementById('codewrap');
      var chips = host.querySelectorAll('.mm-code-chip');
      // The code text only — the root's own label is drawn in this map too.
      var texts = host.querySelectorAll('.mm-svg text.mm-code');
      var padded = true;
      for (var i = 0; i < chips.length; i++) {
        var chip = chips[i].getBBox();
        var text = texts[i].getBBox();
        // Text inside its own chip, with room on both sides. Padded per run
        // instead, the opening line has no room on the right, the closing line
        // none on the left, and a middle line's text runs out past its chip.
        if (text.x <= chip.x || text.x + text.width >= chip.x + chip.width) {
          padded = false;
        }
      }
      check(190, 'every line of a wrapped code span is padded inside its chip',
        // Three lines, so one of them is a middle line with no end of the run
        // in it to borrow padding from.
        chips.length === 3 && chips.length === texts.length && padded);
    })();

    // ---- a gesture the browser takes over must not eat the next click
    (function () {
      var host = document.getElementById('dragcancel');
      var state = host.querySelector('.mm-container').mindMap;
      var branch = state.root.children.filter(function (n) {
        return n.label === 'Branch';
      })[0];
      var pointer = pointerFor(7);

      // A drag that gets far enough to count, then taken away — what a browser
      // does when it decides a touch was a vertical scroll after all.
      var r = branch.el.getBoundingClientRect();
      pointer(branch.el, 'pointerdown', r.left + 5, r.top + 5);
      pointer(branch.el, 'pointermove', r.left + 45, r.top + 35);
      pointer(branch.el, 'pointercancel', r.left + 45, r.top + 35);

      var armed = state.suppressClick;

      // The next press lands on the fold badge, which takes no capture and so
      // never reaches the reset a press on the body would have run.
      var wasCollapsed = branch.collapsed;
      branch.el.querySelector('.mm-toggle')
        .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      check(192, 'a cancelled drag leaves the next fold click alone',
        armed !== true && branch.collapsed !== wasCollapsed);
    })();

    // ---- an embedded block cannot restyle the page it lands in
    (function () {
      var PROP = '--mm-style-probe';
      function probe() {
        return getComputedStyle(document.body).getPropertyValue(PROP).trim();
      }

      // A guard against a vacuous case. If this browser did not apply the rule
      // even from a live <style>, the check below would pass by accident.
      var live = document.createElement('style');
      live.textContent = 'body { ' + PROP + ': leaked; }';
      document.head.appendChild(live);
      var detects = probe() === 'leaked';
      live.remove();

      var tpl = document.createElement('template');
      tpl.id = 'src-styled';
      tpl.innerHTML = '<div class="probe"><style>body { ' + PROP +
        ': leaked; }</style>Styled block</div>';
      document.body.appendChild(tpl);

      var host = document.createElement('div');
      host.appendChild(document.createElement('pre')).textContent =
        'Styled\n  ![](#src-styled)\n';
      host.firstChild.className = 'mindmap';
      document.body.appendChild(host);
      MindMap.renderAll(host);

      // A rule inside a <template> has never applied to anything; cloned into
      // the page it would start applying to the whole document, not just to
      // the node holding it.
      var block = host.querySelector('.mm-embed');
      check(193, 'a style element in an embedded block never reaches the page',
        detects && probe() === '' &&
        !!block && block.querySelectorAll('style').length === 0 &&
        // Stripped, not dropped whole: the block's own content still shows.
        block.textContent.indexOf('Styled block') > -1);

      host.remove();
      tpl.remove();
    })();

    // ---- the width limit counts the padding the code chips will add
    (function () {
      var state = document.getElementById('chipwidth')
        .querySelector('.mm-container').mindMap;
      var max = state.opts.maxNodeWidth;

      // What the drawn chips add to a line: room at each end of every one of
      // them, which is what the wrap has to count and used not to.
      function chipPad(line) {
        var stretches = 0, run = null;
        for (var i = 0; i < line.items.length; i++) {
          var r = line.items[i].run;
          if (r && r.code && r !== run) stretches++;
          run = (r && r.code) ? r : null;
        }
        return stretches * 2 * 3.5;
      }

      var widest = 0, chipsBroke = false;
      (function walk(n) {
        widest = Math.max(widest, n.textWidth);

        // A break the chips are responsible for, which is the case worth
        // holding on to: strip the padding out again and the whole label would
        // have sat on one line inside the limit.
        var bare = 0;
        for (var i = 0; i < n.lines.length; i++) {
          bare += n.lines[i].width - chipPad(n.lines[i]);
        }
        if (n.lines.length > 1 && bare <= max) chipsBroke = true;

        n.children.forEach(walk);
      })(state.root);

      check(194, 'a label wraps to the width limit chips included, not before',
        widest <= max + 0.5 && chipsBroke);
    })();

    // ---- the centre node stays in view when a narrow map is re-laid out
    (function () {
      var done = group('the held root');
      var host = document.getElementById('holdroot');
      var scroller = host.querySelector('.mm-scroll');
      function offset() {
        var r = scroller.querySelector('.mm-root').getBoundingClientRect();
        return r.left + r.width / 2 - scroller.getBoundingClientRect().left;
      }
      function inView() {
        return offset() > 0 && offset() < scroller.clientWidth;
      }

      var overflowed = scroller.scrollWidth - scroller.clientWidth > 0;
      var before = offset();
      var scrolledBefore = scroller.scrollLeft;

      // Opening the folded branches widens the canvas away to the left, which
      // slides everything on it to the right of where it was drawn.
      MindMap.expandAll(host);
      settled('holdroot', function () {
        var held = Math.abs(offset() - before) < 2;
        // Not a map that happened to stay still: the strip had to be scrolled
        // to keep the root where it was.
        var moved = scroller.scrollLeft > scrolledBefore + 1;

        // The shape switch is the other way round — it puts the root at the
        // left edge of the canvas, where the scroll position it was holding
        // would leave it off-screen entirely.
        MindMap.setDirection(host, 'right');
        settled('holdroot', function () {
          check(195, 'the centre node survives a re-layout in a narrow column',
            overflowed && held && moved && inView());
          done();
        });
      });
    })();

    // ---- the frame loop, pumped by hand
    //
    // Every other check here runs under the reduced-motion shim in the page
    // head, where a re-layout finishes in one synchronous step and the frame
    // loop never runs at all — so the animated path, the one an actual reader
    // gets, went untested in exactly the tab this suite is usually opened in.
    // Standing in for requestAnimationFrame covers it without needing the tab
    // to be painted, and makes the timing exact instead of merely likely.
    (function () {
      var done = group('the frame loop');

      var host = document.createElement('div');
      host.style.cssText = 'position:absolute;left:-9999px;width:400px';
      host.innerHTML = '<pre class="mindmap">Pump\n  Branch\n    Leaf\n  Other</pre>';
      document.body.appendChild(host);
      MindMap.renderAll(host);
      var st = mapState(host);

      var realRaf = window.requestAnimationFrame;
      var realCancel = window.cancelAnimationFrame;
      var realMatch = window.matchMedia;
      var queue = [];
      var nextId = 1;

      // The library asks for reduced motion and for a frame afresh every time,
      // so both can be answered from here.
      window.matchMedia = function (q) {
        if (q.indexOf('reduced-motion') > -1) return { matches: false };
        return realMatch.call(window, q);
      };
      window.requestAnimationFrame = function (fn) {
        queue.push({ id: nextId, fn: fn });
        return nextId++;
      };
      window.cancelAnimationFrame = function (id) {
        queue = queue.filter(function (f) { return f.id !== id; });
      };
      function pump(now) {
        var due = queue;
        queue = [];
        due.forEach(function (f) { f.fn(now); });
      }
      function restore() {
        window.requestAnimationFrame = realRaf;
        window.cancelAnimationFrame = realCancel;
        window.matchMedia = realMatch;
        host.remove();
      }

      function model(label) {
        var found = null;
        (function walk(n) {
          if (n.label === label) found = n;
          for (var i = 0; i < n.children.length; i++) walk(n.children[i]);
        })(st.root);
        return found;
      }

      var leaf = model('Leaf');
      nodeIn(host, 'Branch').dispatchEvent(new MouseEvent('click', { bubbles: true }));

      var opened = !!st.animation.frame && st.animation.nodes === true &&
        !!st.animation.bounds;

      // Measuring where the map is *going* must not move it. The old
      // targetBounds wrote every target into the live coordinates and put the
      // old values back from a parallel array afterwards, so a traversal out of
      // step would have left nodes drawn from coordinates that were only ever
      // meant to be hypothetical. Nothing has been pumped yet, so every node
      // must still be exactly where the re-layout found it.
      var undisturbed = true;
      (function walk(n) {
        if (n.ax !== n.fromX || n.acy !== n.fromCy) undisturbed = false;
        for (var i = 0; i < n.children.length; i++) walk(n.children[i]);
      })(st.root);

      pump(0);
      pump(150);                      // half of ANIM_MS
      var midway = leaf.fade > 0.001 && leaf.fade < 0.999 && !!st.animation.frame;

      pump(400);                      // past the end, so the loop clamps and stops
      var landed = st.animation.frame === null && st.animation.nodes === false &&
        st.animation.bounds === null;
      var onTarget = leaf.ax === leaf.tx && leaf.acy === leaf.tcy &&
        leaf.fade === leaf.toFade;

      check(204, 'a fold starts the frame loop, and the last frame closes it',
        opened && midway && landed);
      check(205, 'every node lands exactly on its target, not merely near it',
        onTarget && leaf.el.style.display === 'none' &&
        model('Other').ax === model('Other').tx);
      check(206, 'working out where the map is going does not move it',
        undisturbed);

      restore();
      done();
    })();

    // ---- the wait the rest of the suite leans on
    //
    // Twenty-odd checks now wait through `settled` rather than out-sitting a
    // fixed delay, so a `settled` that called back regardless would not fail
    // here — it would turn every one of those into a race that usually wins,
    // and lose a real regression on the machine that happened to be slow. The
    // held frame below never arrives; only the poller can tell the difference.
    (function () {
      var done = group('the wait helper');
      var st = mapState('single');
      var wasBusy = st.animation.frame;
      var fired = false;
      var heldAt = Date.now();

      st.animation.frame = -1;         // a frame id that will never come back
      settled('single', function () { fired = true; });

      setTimeout(function () {
        var stillHeldInTime = Date.now() - heldAt < WAIT_LIMIT;
        var waitedWhileBusy = !fired;
        st.animation.frame = wasBusy || null;   // the animation "finishes"

        until(function () { return fired; }, function () {
          if (!stillHeldInTime) {
            // Timers were throttled past the point where settled gives up, so
            // the run proves nothing either way. Say so rather than fail.
            skip(203, 'settled waits for a map still in motion',
              'this tab throttled timers past the wait limit');
          } else {
            check(203, 'settled waits while a map is still moving, and no longer',
              waitedWhileBusy && fired);
          }
          done();
        });
      }, 1500);
    })();

    // ---- the shipped file and the guide say the same thing
    //
    // Every option is written out in three places — the attributes readOptions
    // looks up, the guide's table, and the defaults the parser actually applies
    // — and the release version in three. AGENTS.md lists keeping those
    // together as a checklist item, which is another way of saying that nothing
    // checks it. This does, so a row left out of the guide, or a cache-buster
    // left on the previous release, fails here rather than shipping.
    //
    // The README used to carry its own copy of those tables and is now a
    // landing page pointing at the guide, so what is checked of it is that it
    // has stayed one.
    (function () {
      var done = group('docs parity');
      var want = ['mindmap.js', 'README.md', 'index.html'];
      var files = {};
      var left = want.length;
      want.forEach(function (name) {
        var xhr = new XMLHttpRequest();
        // The static server hands out stale copies happily.
        xhr.open('GET', name + '?bust=' + Date.now());
        xhr.onload = function () {
          files[name] = xhr.status === 200 ? xhr.responseText : null;
          if (!--left) compare();
        };
        xhr.onerror = function () { files[name] = null; if (!--left) compare(); };
        xhr.send();
      });

      /**
       * The text between two markers, or '' if either is missing. `from` may be
       * a regex, since the provider site's headings carry ids for the table of
       * contents to link at and a literal '<h2>Options</h2>' no longer matches.
       */
      function section(text, from, to) {
        var a, len;
        if (from instanceof RegExp) {
          var m = from.exec(text);
          if (!m) return '';
          a = m.index;
          len = m[0].length;
        } else {
          a = text.indexOf(from);
          len = from.length;
        }
        var b = a > -1 ? text.indexOf(to, a + len) : -1;
        return a > -1 && b > -1 ? text.slice(a, b) : '';
      }

      /** Every distinct capture of `re` in `text`, sorted, so two lists compare. */
      function names(text, re) {
        var seen = {}, list = [], m;
        re.lastIndex = 0;
        while ((m = re.exec(text))) {
          if (!seen[m[1]]) { seen[m[1]] = true; list.push(m[1]); }
        }
        return list.sort();
      }

      function missing(from, inList) {
        return from.filter(function (x) { return inList.indexOf(x) === -1; });
      }
      function same(a, b) { return a.join(',') === b.join(','); }

      /** `data-max-node-width` -> `maxNodeWidth`, the key readOptions writes. */
      function camel(attr) {
        return attr.slice(5).replace(/-([a-z])/g, function (_, c) {
          return c.toUpperCase();
        });
      }

      function compare() {
        if (!files['mindmap.js'] || !files['README.md'] || !files['index.html']) {
          for (var n = 196; n <= 201; n++) {
            skip(n, 'docs parity', 'the sources could not be fetched from this origin');
          }
          skip(207, 'guide navigation', 'the sources could not be fetched from this origin');
          skip(228, 'guide navigation', 'the sources could not be fetched from this origin');
          done();
          return;
        }

        // Scoped to the one function and the one table: every other part of
        // these files is thick with data-* attributes that are not options.
        var reads = section(files['mindmap.js'], 'function readOptions(', '\n  }\n');
        var siteOpts = section(files['index.html'], /<h2[^>]*>Options<\/h2>/, '</table>');

        var read = names(reads, /'(data-[a-z-]+)'/g);
        var onSite = names(siteOpts, /<code>(data-[a-z-]+)<\/code>/g);
        var inReadme = names(files['README.md'], /(data-[a-z]+-?[a-z-]*)/g);

        check(196, 'every option the script reads has a row in the guide',
          read.length > 0 && missing(read, onSite).length === 0);
        // An option named in the README is a second copy of a fact with a
        // default attached, which is the pair that drifted before. Naming one
        // here is not a typo to hunt for — it is a line that belongs in the
        // guide instead. The other half of deferring is actually pointing:
        // matched on the link target rather than on the bare address, which
        // the quick start's script tag carries anyway.
        var guideLinks = names(files['README.md'],
          /[<(](https:\/\/se-education\.org\/mind-maps-helper\/(?:#[a-z-]+)?)[>)]/g);
        var home = 'https://se-education.org/mind-maps-helper/';
        check(197, 'the README defers to the guide rather than restating options',
          guideLinks.indexOf(home) > -1 &&
          guideLinks.filter(function (u) { return u !== home; }).length > 0 &&
          inReadme.length === 0);
        check(198, 'the guide lists no option the script never reads',
          missing(onSite, read).length === 0);

        // Read off the export rather than the source: what the page can call is
        // the contract, and the two tables document calls, not properties.
        var api = [];
        for (var k in MindMap) if (typeof MindMap[k] === 'function') api.push(k);
        api.sort();
        var apiRe = /MindMap\.([a-zA-Z]+)/g;
        check(199, 'the guide lists exactly the calls MindMap exports',
          api.length > 0 &&
          same(api, names(section(files['index.html'],
            /<h2[^>]*>Calling it from JavaScript<\/h2>/, '</table>'), apiRe)));

        // The defaults a map with no attributes on it actually ends up with.
        var base = mapState('single').opts;
        var wrong = [];
        read.forEach(function (attr) {
          var value = base[camel(attr)];
          // data-theme and data-collapse-level have no default to state.
          if (value === undefined) return;
          var at = siteOpts.indexOf('<code>' + attr + '</code>');
          var cell = at > -1 ? siteOpts.indexOf('</td>', at) : -1;
          var stated = cell > -1
            ? siteOpts.slice(cell, siteOpts.indexOf('</td>', cell + 1)) : '';
          if (stated.indexOf(String(value)) === -1) wrong.push(attr);
        });
        check(200, 'the stated defaults are the ones the parser applies',
          read.length > 0 && wrong.length === 0);

        // The banner, the constant, the badge and the URL readers pick a new
        // release up from. A deployed build must not advertise a stale version.
        var banner = /mind-maps-helper v([\d.]+)/.exec(files['mindmap.js']);
        var constant = /var VERSION = '([\d.]+)'/.exec(files['mindmap.js']);
        var buster = /mindmap\.js\?v=([\d.]+)/.exec(files['index.html']);
        check(201, 'one version in the banner, VERSION, the badge and the cache-buster',
          !!banner && !!constant && !!buster &&
          banner[1] === MindMap.version && constant[1] === MindMap.version &&
          buster[1] === MindMap.version);

        // The provider site is long enough to need a table of contents, and a
        // link into a section that has been renamed away is the kind of rot no
        // rendering check would notice. Parsed rather than inspected live,
        // because tests.html is not the page being checked.
        var site = files['index.html'];
        var headings = [];
        var headRe = /<h([23])(?:\s+id="([^"]*)")?[^>]*>/g;
        var hm;
        while ((hm = headRe.exec(site))) headings.push(hm[2] || '');
        var anchors = names(site, /href="#([^"]+)"/g);
        var ids = {};
        var idRe = /\sid="([^"]+)"/g, im;
        while ((im = idRe.exec(site))) ids[im[1]] = true;
        var dangling = anchors.filter(function (a) { return !ids[a]; });

        check(207, 'every section heading has an id and every in-page link finds one',
          headings.length > 0 &&
          headings.indexOf('') === -1 &&
          anchors.length > 0 &&
          dangling.length === 0);

        // The guide is in two parts, and the divider is a promise: a reader who
        // stops there has read everything an author needs. That only holds if
        // the contents list agrees with the page, so a section added after the
        // divider but listed above it — or left out of the list altogether —
        // fails here rather than sending a reader who was told they could stop
        // into the advanced half.
        function linksIn(text) {
          var out = [], re = /href="#([^"]+)"/g, m;
          while ((m = re.exec(text))) out.push(m[1]);
          return out;
        }
        function tocGroup(cls) {
          // From the group's own <ul>, so the heading link that names the
          // advanced part is not counted as one of its sections.
          var block = section(site, 'class="' + cls + '"', '</ul>');
          var at = block.indexOf('<ul');
          return at > -1 ? linksIn(block.slice(at)) : [];
        }
        var split = site.indexOf('<h2 id="advanced"');
        var above = [], below = [], h2Re = /<h2\s+id="([^"]+)"/g, h2m;
        while ((h2m = h2Re.exec(site))) {
          if (h2m.index < split) above.push(h2m[1]);
          else if (h2m[1] !== 'advanced') below.push(h2m[1]);
        }

        check(228, 'the contents list names every section, in the part it sits in',
          split > -1 && above.length > 0 && below.length > 0 &&
          same(tocGroup('toc-guide'), above) &&
          same(tocGroup('toc-advanced'), below));

        done();
      }
    })();

    // Every group has now been reached, so a suite whose groups all happened to
    // report synchronously still gets its summary.
    registered = true;
    if (!open.length) finish();

    // A group that never reports would leave the page on "running…" with nothing
    // to say which one. Name the stragglers and finish anyway, so a stalled lane
    // reads as the failure it is. The slowest group settles in about three
    // seconds; this waits long enough that a throttled background tab is not
    // mistaken for a stall.
    setTimeout(function () {
      if (!open.length) return;
      while (open.length) {
        check(0, 'group never reported a result: ' + open.shift(), false);
      }
      finish();
    }, 30000);

    function finish() {
    document.getElementById('results').innerHTML =
      '<strong>' + (fails ? fails + ' FAILING'
                          : 'all ' + (out.length - skipped) + ' checks pass') +
      (skipped ? ', ' + skipped + ' skipped' : '') + '</strong><br>' +
      out.sort(function (a, b) { return a.n - b.n; })
         .map(function (r) { return r.html; }).join('<br>');
    }
  }
});
