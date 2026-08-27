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

    /**
     * Whether the injected sheet drops `selector` from a printed page. Print
     * media cannot be emulated from inside a page, so this reads the rule
     * rather than measuring it. What it still catches is the failure that
     * matters: the rule dropped, or aimed at a selector nothing carries.
     */
    function printHides(selector) {
      var sheet = document.getElementById('mind-maps-helper-styles').sheet;
      for (var i = 0; i < sheet.cssRules.length; i++) {
        var group = sheet.cssRules[i];
        if (!group.media || group.media.mediaText.indexOf('print') === -1) continue;
        for (var j = 0; j < group.cssRules.length; j++) {
          if (group.cssRules[j].selectorText === selector &&
              group.cssRules[j].style.display === 'none') return true;
        }
      }
      return false;
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
      MindMap.palette = saved;

      var painted = custom.querySelector('.mm-node:not(.mm-root)');
      check(107, 'an assigned palette reaches the branches',
        painted.style.getPropertyValue('--mm-a') === '#ff0000' &&
        painted.style.getPropertyValue('--mm-a-dark') === '#00ff00' &&
        custom.querySelector('.mm-edge').style.getPropertyValue('--mm-a') === '#ff0000');
      check(108, 'an unusable palette falls back to the built-in one',
        fallback.querySelector('.mm-node:not(.mm-root)')
          .style.getPropertyValue('--mm-a') === '#3b6ea5');

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

    // --- credit chip ---
    (function () {
      var link = document.querySelector('#credit .mm-credit-link');
      check(113, 'a map carries one link back to the project site',
        !!link && document.querySelectorAll('#credit .mm-credit-link').length === 1 &&
        link.getAttribute('href') === 'https://se-education.org/mind-maps-helper/' &&
        link.textContent.indexOf('Mind Maps Helper') > -1);
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

      // The chip is meant to sit astride the rule, not below it, so check the
      // geometry rather than the declarations: the rule is drawn at the bar's
      // half-height and the chip is centred in the same bar.
      var bar = document.querySelector('#credit .mm-credit');
      var rule = getComputedStyle(bar, '::before');
      var barBox = bar.getBoundingClientRect();
      var chipBox = link.getBoundingClientRect();
      check(118, 'the chip straddles the rule closing off the map',
        parseFloat(rule.borderTopWidth) > 0 &&
        Math.abs((chipBox.top + chipBox.height / 2) -
                 (barBox.top + barBox.height / 2)) < 1);

      // The second half is what a sheet-level check misses on its own: that
      // the selector names something a drawn map really carries.
      check(119, 'the chip and its rule are dropped when the page prints',
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

    // ---- the shipped file and the two documents say the same thing
    //
    // Every option is written out in four places — the attributes readOptions
    // looks up, the README table, the provider-site table, and the defaults the
    // parser actually applies — and the release version in three. AGENTS.md
    // lists keeping those together as a checklist item, which is another way of
    // saying that nothing checks it. This does, so a row left out of one
    // document, or a cache-buster left on the previous release, fails here
    // rather than shipping.
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
          done();
          return;
        }

        // Scoped to the one function and the two tables: every other part of
        // these files is thick with data-* attributes that are not options.
        var reads = section(files['mindmap.js'], 'function readOptions(', '\n  }\n');
        var readmeOpts = section(files['README.md'], '## Options', '\n## ');
        var siteOpts = section(files['index.html'], /<h2[^>]*>Options<\/h2>/, '</table>');

        var read = names(reads, /'(data-[a-z-]+)'/g);
        var inReadme = names(readmeOpts, /`(data-[a-z-]+)`/g);
        var onSite = names(siteOpts, /<code>(data-[a-z-]+)<\/code>/g);

        check(196, 'every option the script reads has a README row',
          read.length > 0 && missing(read, inReadme).length === 0);
        check(197, 'every option the script reads has a provider-site row',
          read.length > 0 && missing(read, onSite).length === 0);
        check(198, 'neither document lists an option the script never reads',
          missing(inReadme, read).length === 0 && missing(onSite, read).length === 0);

        // Read off the export rather than the source: what the page can call is
        // the contract, and the two tables document calls, not properties.
        var api = [];
        for (var k in MindMap) if (typeof MindMap[k] === 'function') api.push(k);
        api.sort();
        var apiRe = /MindMap\.([a-zA-Z]+)/g;
        check(199, 'both documents list exactly the calls MindMap exports',
          api.length > 0 &&
          same(api, names(section(files['README.md'], '## JavaScript API', '\n## '), apiRe)) &&
          same(api, names(section(files['index.html'],
            /<h2[^>]*>Calling it from JavaScript<\/h2>/, '</table>'), apiRe)));

        // The defaults a map with no attributes on it actually ends up with.
        var base = mapState('single').opts;
        var wrong = [];
        read.forEach(function (attr) {
          var value = base[camel(attr)];
          // data-theme and data-collapse-level have no default to state.
          if (value === undefined) return;
          var line = readmeOpts.split('\n').filter(function (l) {
            return l.indexOf('`' + attr + '`') > -1;
          })[0] || '';
          var at = siteOpts.indexOf('<code>' + attr + '</code>');
          var cell = at > -1 ? siteOpts.indexOf('</td>', at) : -1;
          var site = cell > -1 ? siteOpts.slice(cell, siteOpts.indexOf('</td>', cell + 1)) : '';
          if ((line.split('|')[2] || '').indexOf(String(value)) === -1) wrong.push('README ' + attr);
          if (site.indexOf(String(value)) === -1) wrong.push('site ' + attr);
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
