/*
 * scenes/cash.js: Gate 2 (Return), the two slides where minutes become money.
 *
 *   capacity   gate-return-capacity   "How much of the freed time becomes paid
 *                                     work?" A slider from 0% to 100% drives the
 *                                     yearly figure, live. At 0% it reads $0.
 *
 * (gate-return-cash, the cash conversion cycle, needs no scene: its timeline
 * is plain markup and CSS in slides/a2c-gates.js, sized from the example day
 * counts in window.YOUR.)
 *
 * EVERY FIGURE IS COMPUTED. The example inputs are read from
 * window.YOUR.examples.capacity and the rates from window.YOUR.rates; the
 * yearly figure is Gates.evaluate(...).capacityValue for a service-lens
 * candidate, so it is the same arithmetic the screener and the worksheet use.
 * Nothing is typed here.
 *
 * window.CashScenes.capacity is shared with the slide file:
 *   inputs()        the example inputs, checked
 *   figure(share)   every number the slide shows for a share of 0..1
 *   view(share, o)  the html of the slide's stage for that share
 * The slide puts one view per step into its html (so the overview, the
 * presenter view and the PDF are right without running anything); the scene
 * replaces them with one live view and keeps it up to date.
 */
(function () {
  'use strict';
  if (!window.Scenes || !window.Motion) { return; }

  var M = window.Motion;

  function esc(text) {
    return String(text == null ? '' : text).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function usable(x) { return typeof x === 'number' && isFinite(x) && x > 0; }

  /* ======================================================================
   * The capacity example
   * ==================================================================== */

  /* What a slider position means at each step when the speaker only clicks:
     0% (the hours came back, nothing was decided), 100%, and back to 0%. */
  var STEP_SHARES = [0, 1, 0];
  var MAX_BLOCKS = 12;      // more freed hours than this are drawn as this many blocks

  function inputs() {
    var Y = window.YOUR || {};
    var G = window.Gates;
    var ex = (Y.examples && Y.examples.capacity) || {};
    var rates = G ? G.defaultAssumptions().rates : (Y.rates || {});
    var hours = Number(ex.hoursFreedPerWeek);
    var margin = Number(ex.billableMarginPerHour);
    return {
      ok: !!(G && window.CostMath) && usable(hours) && usable(margin) && usable(rates.workWeeks),
      hoursPerWeek: hours,
      marginPerHour: margin,
      workWeeks: rates.workWeeks
    };
  }

  /* Every number on the slide for one slider position. */
  function figure(share) {
    var CM = window.CostMath;
    var G = window.Gates;
    var inp = inputs();
    var s = Math.max(0, Math.min(1, Number(share) || 0));
    if (!inp.ok) { return { ok: false, share: s }; }
    // One hour of freed time per "run", so runs per week = freed hours per week.
    var r = G.evaluate({
      id: 'capacity-example', name: 'Capacity example', lens: 'service', tier: 'code',
      minutesPerRun: 60, runsPerWeek: inp.hoursPerWeek,
      capacityConversion: s, billableMarginPerHour: inp.marginPerHour,
      growth: 1, ownerNamed: true
    });
    var value = r.capacityValue;
    var paidHours = CM.tidy(inp.hoursPerWeek * s);
    return {
      ok: true,
      share: s,
      value: value,
      // exactly nothing is "$0", not "about $0": at 0% no hour is billed
      valueText: value === 0 ? '$' + CM.number(0) : CM.money(value),
      shareText: CM.percent(s),
      hoursPerWeek: inp.hoursPerWeek,
      hoursPerWeekText: CM.number(inp.hoursPerWeek),
      paidHoursText: CM.number(paidHours),
      hoursPerYearText: CM.number(r.hoursFreedPerYear),
      workWeeksText: CM.number(inp.workWeeks),
      marginText: CM.money(inp.marginPerHour)
    };
  }

  function plural(text, one, many) { return text === '1' ? one : many; }

  /*
   * The freed hours of one week, as blocks: one block is one hour, and the
   * last one is narrower when the hours are not whole (2.5 hours is two blocks
   * and a half block). Past MAX_BLOCKS hours, MAX_BLOCKS equal blocks share
   * them. Each block is filled as far as the slider has turned it into paid work.
   * Returns [{ width: 0..1 of a full block, fill: 0..1 }].
   */
  function blocks(f) {
    var hours = f.hoursPerWeek;
    var n = Math.max(1, Math.ceil(hours - 1e-9));
    var each = 1;                                       // hours a full-width block stands for
    if (n > MAX_BLOCKS) { n = MAX_BLOCKS; each = hours / n; }
    var paid = hours * f.share;
    var out = [];
    for (var i = 0; i < n; i++) {
      var holds = Math.min(each, hours - i * each);     // hours in this block
      var fill = Math.max(0, Math.min(1, (paid - i * each) / holds));
      out.push({ width: holds / each, fill: fill });
    }
    return out;
  }

  function blocksHtml(f) {
    var list = blocks(f);
    return '<div class="cap-hours" style="--cap-n: ' + list.length + '">' + list.map(function (b) {
      return '<i class="cap-hour" style="--w: ' + b.width.toFixed(4) + '"><b style="width: ' + (b.fill * 100).toFixed(2) + '%"></b></i>';
    }).join('') + '</div>';
  }

  /* The figure is set as large as its longest value (the one at 100%) allows. */
  function moneySize() {
    var full = figure(1);
    var chars = full.ok ? full.valueText.length : 7;
    return chars <= 7 ? 250 : (chars === 8 ? 216 : (chars === 9 ? 190 : 160));
  }

  /*
   * The stage for one slider position. opts.zeroLine adds the deadpan line
   * (only when the figure is back at zero AFTER having been something).
   */
  function view(share, opts) {
    var o = opts || {};
    var T = window.THEME;
    var f = figure(share);
    if (!f.ok) {
      return '<div class="cap-view"><p class="cap-missing">' +
        (T ? T.slot('Example hours and margin') : 'Example hours and margin') + '</p></div>';
    }
    var zero = f.value === 0;
    return '<div class="cap-view' + (zero ? ' is-zero' : '') + '">' +
      '<div class="cap-left">' +
        '<p class="label">Freed every week · same crew</p>' +
        blocksHtml(f) +
        '<p class="cap-split"><b class="cap-paid">' + esc(f.paidHoursText) + '</b><span>of ' + esc(f.hoursPerWeekText) + ' ' +
          plural(f.hoursPerWeekText, 'hour', 'hours') + ' a week ' +
          '<span class="cap-verb">' + plural(f.paidHoursText, 'becomes', 'become') + '</span> paid work</span></p>' +
      '</div>' +
      '<div class="cap-right">' +
        '<p class="cap-head"><span class="label is-tight">Paid work · per year</span>' + (T ? T.tag('example') : '') + '</p>' +
        '<p class="cap-money" style="font-size: ' + moneySize() + 'px"><b>' + esc(f.valueText) + '</b></p>' +
        '<p class="cap-math">' + esc(f.hoursPerWeekText) + ' h × ' + esc(f.workWeeksText) + ' weeks × ' +
          esc(f.marginText) + ' margin × <b class="cap-share">' + esc(f.shareText) + '</b></p>' +
      '</div>' +
      '<label class="slider cap-slider" data-touch="own">' +
        '<span class="label">How much of the freed time becomes paid work?</span>' +
        '<input type="range" min="0" max="100" step="5" value="' + Math.round(f.share * 100) + '" aria-label="Share of the freed time that becomes paid work">' +
        '<output>' + esc(f.shareText) + '</output>' +
      '</label>' +
      (o.zeroLine && zero ? '<p class="deadpan cap-zero">Zero is also a decision.</p>' : '') +
      '</div>';
  }

  /* ======================================================================
   * capacity
   * ==================================================================== */

  window.Scenes.define('capacity', function (host, opts, api) {
    var T = window.THEME;
    var share = 0;
    var beenAbove = false;       // has the figure been more than zero since the slide appeared?
    var zeroLine = false;
    var sweep = null;            // the tween that moves the slider on a click
    var timer = null;
    var prev = null;
    var input = null;

    host.classList.add('is-live');

    function cancel() {
      if (sweep) { sweep.cancel(); sweep = null; }
      if (timer) { timer.cancel(); timer = null; }
    }

    /* Draw the whole stage once, then keep the same nodes up to date. */
    function build() {
      host.innerHTML = view(share, { zeroLine: zeroLine });
      input = host.querySelector('input[type="range"]');
      if (input) {
        input.addEventListener('input', onInput);
        if (T && T.fillRange) { T.fillRange(input); }
      }
    }

    function set(q, sel, text) {
      var node = q.querySelector(sel);
      if (node && node.textContent !== text) { node.textContent = text; }
    }

    function update(fromSlider) {
      var f = figure(share);
      var root = host.querySelector('.cap-view');
      if (!f.ok || !root) { return; }
      var zero = f.value === 0;
      if (!zero) { beenAbove = true; }
      root.classList.toggle('is-zero', zero);
      set(root, '.cap-money > b', f.valueText);
      set(root, '.cap-paid', f.paidHoursText);
      set(root, '.cap-verb', plural(f.paidHoursText, 'becomes', 'become'));
      set(root, '.cap-share', f.shareText);
      set(root, '.cap-slider > output', f.shareText);
      // the hour blocks
      var plan = blocks(f);
      Array.prototype.forEach.call(root.querySelectorAll('.cap-hour > b'), function (b, i) {
        if (plan[i]) { b.style.width = (plan[i].fill * 100).toFixed(2) + '%'; }
      });
      if (input && !fromSlider) {
        input.value = String(Math.round(f.share * 100));
        if (T && T.fillRange) { T.fillRange(input); }
      }
      // the deadpan line belongs to a zero that somebody arrived at
      var want = zeroLine && zero;
      var line = root.querySelector('.cap-zero');
      if (want && !line) {
        line = document.createElement('p');
        line.className = 'deadpan cap-zero';
        line.textContent = 'Zero is also a decision.';
        root.appendChild(line);
      } else if (!want && line) {
        line.parentNode.removeChild(line);
      }
    }

    function onInput() {
      cancel();
      share = Math.max(0, Math.min(1, Number(input.value) / 100));
      zeroLine = beenAbove || share > 0;
      update(true);
    }

    /* A click of the clicker moves the slider for the speaker, in 5% ticks. */
    function sweepTo(target, thenZeroLine) {
      cancel();
      var from = share;
      var seconds = Math.abs(target - from) * (target > from ? 1.5 : 0.75);
      zeroLine = false;
      update(false);
      sweep = M.tween({
        from: from, to: target, duration: seconds, ease: 'linear',
        onUpdate: function (v) {
          var snapped = Math.round(v * 20) / 20;
          if (snapped !== share) { share = snapped; update(false); }
        },
        onDone: function () {
          sweep = null;
          share = target;
          update(false);
          if (thenZeroLine) {
            // let the $0 sit for a beat before the line cuts in
            timer = M.tween({ from: 0, to: 1, duration: 0.5, ease: 'linear', immediate: false, onDone: function () {
              timer = null;
              zeroLine = true;
              update(false);
            } });
          }
        }
      });
    }

    function settle(n) {
      cancel();
      share = STEP_SHARES[Math.max(0, Math.min(STEP_SHARES.length - 1, n))];
      zeroLine = n >= 2;
      beenAbove = n >= 1;
      update(false);
    }

    build();

    return {
      step: function (n, dir) {
        var forwardOne = dir > 0 && prev !== null && n === prev + 1 && !api.mode.print;
        if (forwardOne && STEP_SHARES[n] != null) { sweepTo(STEP_SHARES[n], n >= 2); }
        else { settle(n); }
        prev = n;
      },
      destroy: function () {
        cancel();
        if (input) { input.removeEventListener('input', onInput); }
      }
    };
  });

  window.CashScenes = {
    capacity: { inputs: inputs, figure: figure, view: view, STEP_SHARES: STEP_SHARES }
  };
}());
