/* JZA Applications — index page choreography.
   Everything here is progressive enhancement: with JS off the page is a
   clean scrolling document. All motion respects prefers-reduced-motion. */
(function () {
  "use strict";

  var reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = matchMedia("(pointer: fine)").matches;
  var html = document.documentElement;

  /* ------------------------------------------------------------------
     1. Chapter takeover — as a chapter crosses the viewport center, the
        whole page's ambient light morphs to that app's palette.
     ------------------------------------------------------------------ */
  var chapters = document.querySelectorAll("[data-chapter]");
  if ("IntersectionObserver" in window && chapters.length) {
    var takeover = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            html.setAttribute("data-view", entry.target.getAttribute("data-chapter"));
          }
        });
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 }
    );
    chapters.forEach(function (el) {
      takeover.observe(el);
    });
  }

  /* ------------------------------------------------------------------
     2. Scroll reveals
     ------------------------------------------------------------------ */
  var reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reducedMotion) {
    var revealer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.15) {
            entry.target.classList.add("in-view");
          } else if (!entry.isIntersecting && entry.boundingClientRect.top >= window.innerHeight) {
            /* fully exited below the viewport (the user scrolled back up
               past it) — re-arm so the reveal replays on the way down.
               Elements exiting above stay revealed. */
            entry.target.classList.remove("in-view");
          }
        });
      },
      { threshold: [0, 0.15] }
    );
    reveals.forEach(function (el) {
      revealer.observe(el);
    });
  } else {
    reveals.forEach(function (el) {
      el.classList.add("in-view");
    });
  }

  /* ------------------------------------------------------------------
     3. Parallax drift on [data-parallax] wrappers
     ------------------------------------------------------------------ */
  var floats = Array.prototype.slice.call(document.querySelectorAll("[data-parallax]"));
  if (floats.length && !reducedMotion) {
    var ticking = false;
    var drift = function () {
      ticking = false;
      var mid = window.innerHeight / 2;
      /* read all rects first, then write all transforms — interleaving
         the two forces a layout recalculation per element */
      var rects = floats.map(function (el) {
        return el.getBoundingClientRect();
      });
      floats.forEach(function (el, i) {
        var rect = rects[i];
        if (rect.bottom < -200 || rect.top > window.innerHeight + 200) return;
        var offset = (rect.top + rect.height / 2 - mid) * parseFloat(el.getAttribute("data-parallax"));
        el.style.transform = "translateY(" + offset.toFixed(1) + "px)";
      });
    };
    var onScroll = function () {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(drift);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    drift();
  }

  /* ------------------------------------------------------------------
     4. Cursor-tracking specular highlight on glass surfaces
     ------------------------------------------------------------------ */
  if (finePointer) {
    document.addEventListener("pointermove", function (e) {
      var el = e.target.closest ? e.target.closest(".glass.specular") : null;
      if (!el) return;
      var rect = el.getBoundingClientRect();
      el.style.setProperty("--mx", (((e.clientX - rect.left) / rect.width) * 100).toFixed(1) + "%");
      el.style.setProperty("--my", (((e.clientY - rect.top) / rect.height) * 100).toFixed(1) + "%");
    });
  }

  /* ------------------------------------------------------------------
     5. GhostDelta — the iPhone's ride page with a working Watch in front.
        iPhone (Session detail, STYLE_GUIDE Part A): the route draws in on
        the map backdrop, the header figures count up, then the Stages
        panel opens one Stage at a time, as a tap does in the app — its
        ghost trace revealed left to right (red behind, green ahead of the
        dashed ghost line), sectors and sub-sectors in their computed
        colours (purple = best ever, never red).
        Watch: the face cycles three views, as a rider would see them:
        · Stage page — three windows under "Stages": Nearby (READY with a
          yellow edge at the start, then the nearest other Stage), the
          run underway, and Previous (the ride's last run, with a count).
          The run clock ticks M:SS in whole seconds; the gap stays
          an em-dash until the first sub-sector crossing, then updates at
          each crossing; the sub-sector being ridden is a hollow yellow
          outline and takes its colour once complete (purple = beat both
          references, else green→yellow by how close — never red); a
          running sector pill shows whole seconds, tenths once complete;
          on finish the panel edge turns purple (PB) or grey. Gap colours
          follow StageGap: riding green ahead / red behind; finished
          purple for a PB, red slower.
        · Navigation: travelled / remaining / climb, the elevation profile
          ahead coloured by gradient, "you" moving along it.
        · Circuit laps: the lap clock keeps its tenths, live gap to the best
          lap, then the lap-complete screen.
        Time is accelerated so a visitor sees a whole run of each.
     ------------------------------------------------------------------ */
  var gdStage = document.getElementById("gd-watch");
  if (gdStage) {
    var YELLOW = "#FFD60A", PB = "#BF5AF2", PB_TEXT = "#C084FC", GREY = "#8E9096", IDLE = "#3A3C42";
    var scenes = {};
    Array.prototype.forEach.call(gdStage.querySelectorAll(".gd-scene"), function (el) { scenes[el.dataset.scene] = el; });
    var tabs = document.getElementById("gd-tabs").querySelectorAll(".gd-tab");
    var lapDone = document.getElementById("gd-lapdone");

    var rgba = function (hex, a) {
      return "rgba(" + parseInt(hex.slice(1, 3), 16) + ", " + parseInt(hex.slice(3, 5), 16) + ", " +
        parseInt(hex.slice(5, 7), 16) + ", " + a + ")";
    };
    /* The app's sector colour: purple for a PB, else HSB hue 140° → 50° by position. */
    var sectorColour = function (pos) {
      if (pos === null) return PB;
      var c = Math.min(Math.max(pos, 0), 1), h = (140 - 90 * c) / 60, s = 0.75, v = 0.85;
      var i = Math.floor(h), f = h - i, p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f));
      var rgb = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
      return "#" + rgb.map(function (x) { var hx = Math.round(x * 255).toString(16); return hx.length < 2 ? "0" + hx : hx; }).join("");
    };
    /* One gap format everywhere: true minus, "+1:28.2" past a minute. */
    var fmtGap = function (d, unit) {
      var a = Math.abs(d), sign = d < 0 && a >= 0.05 ? "−" : "+";   /* no "−0.0" */
      if (a < 60) return sign + a.toFixed(1) + (unit ? " s" : "");
      var m = Math.floor(a / 60), r = a - m * 60;
      return sign + m + ":" + (r < 10 ? "0" : "") + r.toFixed(1);
    };
    var fmtClock = function (s) {
      var m = Math.floor(s / 60), ss = Math.floor(s % 60);
      return m + ":" + (ss < 10 ? "0" : "") + ss;   /* M:SS, as GhostFormatters.duration */
    };
    var fmtLap = function (s) {
      var m = Math.floor(s / 60), r = s - m * 60;
      return m + ":" + (r < 10 ? "0" : "") + r.toFixed(1);
    };
    var fmtSector = function (s) { return s < 60 ? s.toFixed(1) : fmtLap(s); };

    /* A live timing panel (Stage or lap): pills, sub-sector bar, gap. */
    var makePanel = function (card, timeEl, deltaEl) {
      var pills = card.querySelectorAll(".gd-pill");
      var minis = card.querySelectorAll(".gd-mini-group span");
      return {
        reset: function () {
          Array.prototype.forEach.call(pills, function (p) { p.textContent = "--"; p.style.color = p.style.background = p.style.borderColor = ""; });
          Array.prototype.forEach.call(minis, function (m) { m.className = ""; m.style.background = ""; });
          minis[0].className = "is-current";
          this.edge(YELLOW, true);
          this.gap(null);
        },
        edge: function (colour, glow) {
          card.style.setProperty("--gd-edge", rgba(colour, 0.75));
          card.style.setProperty("--gd-glow", glow ? rgba(colour, 0.35) : "transparent");
        },
        gap: function (d, colour) {
          if (d === null) { deltaEl.textContent = "—"; deltaEl.style.color = IDLE; return; }
          deltaEl.textContent = fmtGap(d);
          deltaEl.style.color = colour || (d <= 0 ? "#30D158" : "#FF453A");   /* riding: green ahead, red behind */
        },
        mini: function (i, colour) {
          minis[i].className = "";
          minis[i].style.background = colour;
          if (i + 1 < minis.length) minis[i + 1].className = "is-current";
        },
        pillLive: function (i, text) { pills[i].textContent = text; },
        pillDone: function (i, colour, text) {
          var pb = colour === PB;
          pills[i].textContent = text;
          pills[i].style.color = pb ? PB_TEXT : colour;
          pills[i].style.background = rgba(colour, pb ? 0.15 : 0.12);
          pills[i].style.borderColor = rgba(colour, pb ? 0.22 : 0.2);
        },
        time: function (text) { timeEl.textContent = text; }
      };
    };

    /* How one sub-sector went: a position on the colour scale (null = PB) and its gap. */
    var rollMini = function () {
      var r = Math.random();
      if (r < 0.22) return { pos: null, d: -(0.2 + Math.random() * 0.5) };
      if (r < 0.6) return { pos: Math.random() * 0.25, d: -(Math.random() * 0.2) };
      if (r < 0.85) return { pos: 0.3 + Math.random() * 0.4, d: Math.random() * 0.3 };
      return { pos: 0.75 + Math.random() * 0.4, d: 0.3 + Math.random() * 0.5 };
    };
    var sectorPos = function (secDelta) {
      return secDelta < -0.35 ? null : secDelta <= 0 ? 0.1 : secDelta < 0.5 ? 0.5 : 0.95;
    };

    /* ---- Stage timing ---- */
    var stagePanel = makePanel(document.getElementById("gd-card"), document.getElementById("gd-time"), document.getElementById("gd-delta"));
    var STAGE_SECTORS = [82.5, 85.1, 84.9], TICKS_PER_MINI = 14;
    var stage = {};
    var gdCard = document.getElementById("gd-card"), gdName = document.getElementById("gd-name"), gdNear = document.getElementById("gd-near");
    var PIN = '<span class="gd-pin"><svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="10.5" r="2.5"/></svg></span>';
    var nearby = function (ready) {
      gdNear.classList.toggle("is-ready", ready);
      gdNear.innerHTML = ready
        ? '<span class="gd-dot"></span><span class="gd-wn">Ridgeline DH</span><span class="gd-caps" style="color:var(--gd-yellow)">Ready</span>'
        : PIN + '<span class="gd-wn">Pine Chute</span><span class="gd-wf gd-wd">1.4 km</span>';
    };
    /* At the start: READY, and the resting card (grey, 0:00, empty bar). */
    var resting = function (on) {
      gdCard.classList.toggle("is-resting", on);
      gdName.textContent = on ? "Enter a Stage to Start Timing" : "Ridgeline DH";
      nearby(on);
    };
    var stageStart = function () {
      stage = { mini: 0, tick: 0, total: 0, sec: 0, gap: 0, secGap: 0, dur: STAGE_SECTORS[0] + (Math.random() - 0.45) * 5, hold: 0, rest: 14 };
      stagePanel.reset();
      stagePanel.time("0:00");
      resting(true);
      Array.prototype.forEach.call(gdCard.querySelectorAll(".gd-pill"), function (p) { p.textContent = "0.0"; });
      gdCard.querySelector(".is-current").className = "";
    };
    /* returns true when this view has finished its turn */
    var stageTick = function () {
      if (stage.rest > 0) {
        if (--stage.rest === 0) {
          resting(false);
          Array.prototype.forEach.call(gdCard.querySelectorAll(".gd-pill"), function (p) { p.textContent = "--"; });
          gdCard.querySelector(".gd-mini-group span").className = "is-current";
          stagePanel.edge(YELLOW, true);
        }
        return false;
      }
      if (stage.hold > 0) return --stage.hold === 0;
      var step = stage.dur / (3 * TICKS_PER_MINI);
      stage.sec += step;
      stage.total += step;
      stagePanel.time(fmtClock(stage.total));
      var sector = Math.floor(stage.mini / 3);
      stagePanel.pillLive(sector, String(Math.floor(stage.sec)));   /* whole seconds while running */
      if (++stage.tick < TICKS_PER_MINI) return false;
      stage.tick = 0;
      var m = rollMini();
      stagePanel.mini(stage.mini, sectorColour(m.pos));
      stage.gap += m.d;
      stage.secGap += m.d;
      stagePanel.gap(stage.gap);
      stage.mini++;
      if (stage.mini % 3 === 0) {
        stagePanel.pillDone(sector, sectorColour(sectorPos(stage.secGap)), fmtSector(stage.sec));
        stage.sec = 0;
        stage.secGap = 0;
        if (stage.mini < 9) stage.dur = STAGE_SECTORS[stage.mini / 3] + (Math.random() - 0.45) * 5;
      }
      if (stage.mini === 9) {
        var isPB = stage.gap <= 0;
        stagePanel.edge(isPB ? PB : GREY, isPB);
        stagePanel.gap(stage.gap, isPB ? PB : "#FF453A");   /* finished: purple PB, red slower */
        stage.hold = 30;
      }
      return false;
    };

    /* ---- Navigation ---- */
    var navSvg = document.getElementById("gd-nav-svg");
    var navEls = { done: "gd-nav-done", left: "gd-nav-left", up: "gd-nav-up", down: "gd-nav-down", next: "gd-nav-next" };
    Object.keys(navEls).forEach(function (k) { navEls[k] = document.getElementById(navEls[k]); });
    var PROFILE = (function () {
      var pts = [];
      for (var i = 0; i <= 40; i++) {
        var x = i / 40;
        pts.push(0.55 - 0.18 * Math.sin(x * 5.2 + 0.4) - 0.22 * x + 0.08 * Math.sin(x * 13));
      }
      return pts; /* 0 = top of chart, 1 = bottom */
    })();
    var gradeColour = function (dy) { return dy > 0.03 ? "#FF9F0A" : dy > 0.012 ? YELLOW : "#30D158"; };
    var drawProfile = function (frac) {
      var W = 200, H = 46, n = PROFILE.length - 1, svg = "";
      var P = function (i) { return [(i / n) * W, 4 + PROFILE[i] * (H - 8)]; };
      var area = "M0," + H;
      for (var i = 0; i <= n; i++) { var p = P(i); area += " L" + p[0].toFixed(1) + "," + p[1].toFixed(1); }
      area += " L" + W + "," + H + " Z";
      svg += '<path d="' + area + '" fill="rgba(255,255,255,0.04)"/>';
      var cut = Math.round(frac * n);
      var done = "";
      for (i = 0; i <= cut; i++) { p = P(i); done += (i ? " L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1); }
      svg += '<path d="' + done + '" stroke="#4B4E55" stroke-width="1.6" fill="none" stroke-linecap="round"/>';
      for (i = cut; i < n; i++) {
        var a = P(i), b = P(i + 1), dy = PROFILE[i] - PROFILE[i + 1];
        svg += '<line x1="' + a[0].toFixed(1) + '" y1="' + a[1].toFixed(1) + '" x2="' + b[0].toFixed(1) + '" y2="' + b[1].toFixed(1) +
          '" stroke="' + gradeColour(dy) + '" stroke-width="1.8" stroke-linecap="round"/>';
      }
      [0, 13, 27, 40].forEach(function (k) { var q = P(k); svg += '<circle cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="1.6" fill="#8E9096"/>'; });
      var x = (frac * W).toFixed(1);
      svg += '<line x1="' + x + '" y1="2" x2="' + x + '" y2="' + H + '" stroke="#F5F5F2" stroke-width="1" stroke-dasharray="2 2"/>';
      navSvg.innerHTML = svg;
    };
    var NAV_TICKS = 95, nav = {};
    var navStart = function () { nav = { t: 0 }; navTick(); };
    var navTick = function () {
      var f = Math.min(nav.t / NAV_TICKS, 1);
      navEls.done.textContent = (1.16 + 0.52 * f).toFixed(2);
      navEls.left.textContent = (1.74 - 0.52 * f).toFixed(2);
      navEls.up.textContent = String(Math.round(56 + 17 * f));
      navEls.down.textContent = String(Math.round(13 + 6 * f));
      navEls.next.textContent = String(Math.max(10, Math.round(340 - 330 * f)));
      drawProfile(0.4 + 0.3 * f);
      return ++nav.t > NAV_TICKS + 12;
    };

    /* ---- Circuit laps ---- */
    var lapPanel = makePanel(document.getElementById("gd-lapcard"), document.getElementById("gd-laptime"), document.getElementById("gd-lapdelta"));
    var BEST_LAP = 98.4, LAP_SECTORS = [31.8, 34.2, 32.4];
    var lap = {};
    var lapStart = function () {
      lap = { mini: 0, tick: 0, t: 0, sec: 0, gap: 0, secGap: 0, dur: LAP_SECTORS[0] + (Math.random() - 0.5) * 1.6, done: 0 };
      lapPanel.reset();
      lapPanel.time("0:00.0");
      lapDone.classList.remove("is-active");
    };
    var lapTick = function () {
      if (lap.done > 0) {
        if (--lap.done === 0) { lapDone.classList.remove("is-active"); return true; }
        return false;
      }
      var step = lap.dur / (3 * 10);
      lap.sec += step;
      lap.t += step;
      lapPanel.time(fmtLap(lap.t));                                  /* lap clock keeps its tenths */
      var sector = Math.floor(lap.mini / 3);
      lapPanel.pillLive(sector, String(Math.floor(lap.sec)));
      if (++lap.tick < 10) return false;
      lap.tick = 0;
      var m = rollMini();
      lapPanel.mini(lap.mini, sectorColour(m.pos));
      lap.gap += m.d * 0.6;
      lap.secGap += m.d * 0.6;
      lapPanel.gap(lap.gap);
      lap.mini++;
      if (lap.mini % 3 === 0) {
        lapPanel.pillDone(sector, sectorColour(sectorPos(lap.secGap)), fmtSector(lap.sec));
        lap.sec = 0;
        lap.secGap = 0;
        if (lap.mini < 9) lap.dur = LAP_SECTORS[lap.mini / 3] + (Math.random() - 0.5) * 1.6;
      }
      if (lap.mini === 9) {
        /* lap complete screen: the time, then best lap (green) or the gap (red) */
        var best = lap.t < BEST_LAP;
        document.getElementById("gd-ld-time").textContent = fmtLap(lap.t);
        var label = lapDone.querySelectorAll(".gd-caps")[1], gapEl = document.getElementById("gd-ld-gap");
        label.textContent = best ? "Best lap" : "vs best";
        label.style.color = best ? "#30D158" : GREY;
        gapEl.textContent = fmtGap(lap.t - BEST_LAP, true);
        gapEl.style.color = best ? "#30D158" : "#FF453A";
        lapDone.classList.add("is-active");
        lap.done = 28;
      }
      return false;
    };

    /* ---- Cycle ---- */
    var ORDER = ["stage", "nav", "laps"];
    var views = {
      stage: { start: stageStart, tick: stageTick },
      nav: { start: navStart, tick: navTick },
      laps: { start: lapStart, tick: lapTick }
    };
    var current = "stage";
    var show = function (name) {
      current = name;
      lapDone.classList.remove("is-active");   /* a tab tap can leave the lap screen mid-hold */
      ORDER.forEach(function (n) { scenes[n].classList.toggle("is-active", n === name); });
      Array.prototype.forEach.call(tabs, function (t) { t.classList.toggle("is-active", t.dataset.go === name); });
      views[name].start();
    };
    Array.prototype.forEach.call(tabs, function (t) {
      t.addEventListener("click", function () { show(t.dataset.go); });
    });

    if (reducedMotion || !("IntersectionObserver" in window)) {
      /* Still frames: a finished PB run; tabs switch between the three views. */
      stageStart();
      resting(false);
      stagePanel.time("4:11");
      [[null, "1:21.9"], [0.1, "1:24.8"], [0.1, "1:24.3"]].forEach(function (p, i) { stagePanel.pillDone(i, sectorColour(p[0]), p[1]); });
      for (var k = 0; k < 9; k++) stagePanel.mini(k, sectorColour(k % 4 === 1 ? null : k % 3 === 2 ? 0.5 : 0.1));
      stagePanel.edge(PB, true);
      stagePanel.gap(-1.4, PB);
      views.stage.start = function () {};
      views.nav.start = function () { nav = { t: NAV_TICKS / 2 }; navTick(); };
      views.laps.start = function () { lapStart(); lapPanel.time("0:52.3"); lapPanel.gap(-0.3); };
    } else {
      stageStart();
      var gdTimer = null;
      var gdTickAll = function () {
        if (views[current].tick()) show(ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]);
      };
      var gdIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && !gdTimer) {
            gdTimer = setInterval(gdTickAll, 100);
          } else if (!entry.isIntersecting && gdTimer) {
            clearInterval(gdTimer);
            gdTimer = null;
          }
        });
      });
      gdIO.observe(gdStage);
    }
  }

  /* GhostDelta iPhone (see §5's header). The three Stages of one ride:
     time, gap to your previous best (null = First Run), the trace of that
     gap along the Stage (signed as the headline reads it: − ahead), and
     each sector's time and colour position (null = purple, best ever;
     0 → 1 = green → yellow) with its three sub-sectors. */
  var gpPhone = document.getElementById("gd-phone");
  if (gpPhone) {
    var GP_STAGES = [
      { name: "Ridgeline DH", time: "4:12.5", gap: -1.8, pb: true, km: 2.1,
        trace: [0, 0.4, 0.7, 0.2, -0.5, -0.9, -0.6, -1.3, -1.8],
        sectors: [["1:22.1", 0.15, [0.1, 0.4, 0.05]], ["1:25.0", null, [null, 0.05, null]], ["1:25.4", null, [0.2, null, null]]] },
      { name: "Quarry Line", time: "2:38.1", gap: 0.9, pb: false, km: 1.3,
        trace: [0, -0.3, -0.2, 0.4, 0.6, 0.3, 0.9],
        sectors: [["52.4", 0.1, [0.05, 0.2, 0.1]], ["54.9", 0.8, [0.6, 0.9, 0.7]], ["50.8", 0.4, [0.3, 0.5, 0.35]]] },
      { name: "Lower Bench", time: "1:46.3", gap: null, pb: false, km: 0.8, trace: null,
        sectors: [["35.2", null, [null, null, null]], ["36.4", null, [null, null, null]], ["34.7", null, [null, null, null]]] }
    ];
    var gpColour = function (pos) {   /* the app's sector colour: purple best ever, else HSB 140° → 50° */
      if (pos === null) return "#BF5AF2";
      var c = Math.min(Math.max(pos, 0), 1), h = (140 - 90 * c) / 60, sat = 0.75, v = 0.85;
      var i = Math.floor(h), f = h - i, q = v * (1 - sat * f), t = v * (1 - sat * (1 - f)), pp = v * (1 - sat);
      var rgb = [[v, t, pp], [q, v, pp], [pp, v, t]][i % 3];
      return "#" + rgb.map(function (x) { var hx = Math.round(x * 255).toString(16); return hx.length < 2 ? "0" + hx : hx; }).join("");
    };
    var gpGap = function (d) {   /* FL.deltaText: true minus, " s" */
      return (d < 0 ? "−" : "+") + Math.abs(d).toFixed(1) + " s";
    };
    var gpAlpha = function (hex, a) {
      return "rgba(" + parseInt(hex.slice(1, 3), 16) + "," + parseInt(hex.slice(3, 5), 16) + "," + parseInt(hex.slice(5, 7), 16) + "," + a + ")";
    };
    /* FLGhostTrace: dashed ghost at zero, the run's own extremes as marks,
       fill red above zero / green below, white line, end dot. */
    var gpTrace = function (st) {
      var W = 333, H = 76, R = 34, pts = st.trace, n = pts.length - 1;
      var top = Math.max(0, Math.max.apply(null, pts)), bot = Math.min(0, Math.min.apply(null, pts));
      var pad = Math.max(0.5, (top - bot) * 0.12), y0 = top + pad, y1 = bot - pad;
      var X = function (i) { return (i / n) * (W - R); };
      var Y = function (g) { return ((y0 - g) / (y0 - y1)) * (H - 12); };
      /* smooth with a light cardinal spline through the points */
      var d = "M" + X(0) + "," + Y(pts[0]).toFixed(1);
      for (var i = 0; i < n; i++) {
        var p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, n)];
        var c1 = p1 + (p2 - p0) / 6, c2 = p2 - (p3 - p1) / 6;
        d += " C" + (X(i) + (X(i + 1) - X(i)) / 3).toFixed(1) + "," + Y(c1).toFixed(1) + " " + (X(i + 1) - (X(i + 1) - X(i)) / 3).toFixed(1) + "," + Y(c2).toFixed(1) + " " + X(i + 1).toFixed(1) + "," + Y(p2).toFixed(1);
      }
      var zy = Y(0).toFixed(1), last = pts[n], end = last <= 0 ? "#30D158" : "#FF453A";
      var area = d + " L" + X(n) + "," + zy + " L0," + zy + " Z";
      var gid = "gp-g" + st.name.length;
      var zf = (Y(0) / (H - 12)).toFixed(3);
      var marks = [0];
      if (top > 0) marks.push(top);
      if (bot < 0) marks.push(bot);
      var axis = marks.map(function (m) {
        return '<text class="gp-ax" x="' + (W - R + 6) + '" y="' + (Y(m) + 3).toFixed(1) + '">' + (m === 0 ? "0" : gpGap(m).replace(" s", "")) + "</text>";
      }).join("");
      var half = (st.km / 2).toFixed(1);
      var xs = '<text class="gp-ax" x="0" y="' + H + '">0</text><text class="gp-ax" x="' + ((W - R) / 2 - 14) + '" y="' + H + '">' + half + ' km</text>' +
        '<line x1="' + (W - R) / 2 + '" y1="0" x2="' + (W - R) / 2 + '" y2="' + (H - 12) + '" stroke="rgba(255,255,255,.05)"/>';
      return '<svg viewBox="0 0 ' + W + " " + H + '">' +
        '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#FF453A" stop-opacity=".55"/><stop offset="' + zf + '" stop-color="#FF453A" stop-opacity=".2"/>' +
        '<stop offset="' + zf + '" stop-color="#30D158" stop-opacity=".2"/><stop offset="1" stop-color="#30D158" stop-opacity=".55"/></linearGradient></defs>' +
        xs + axis +
        '<g class="gp-reveal"><path d="' + area + '" fill="url(#' + gid + ')"/>' +
        '<line x1="0" y1="' + zy + '" x2="' + (W - R) + '" y2="' + zy + '" stroke="rgba(255,255,255,.35)" stroke-dasharray="3 4"/>' +
        '<path d="' + d + '" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>' +
        '<circle cx="' + X(n) + '" cy="' + Y(last).toFixed(1) + '" r="4" fill="' + end + '" stroke="#111317" stroke-width="1.5"/></g></svg>';
    };
    var gpRows = GP_STAGES.map(function (st, i) {
      var dcol = st.gap === null ? "" : st.gap < 0 ? (st.pb ? "gp-c-pb" : "") : "gp-c-dim";
      var minis = function (ms) { return ms.map(function (m) { return '<i style="background:' + gpColour(m) + '"></i>'; }).join(""); };
      var compact = st.sectors.map(function (sec) { return '<span><i style="background:' + gpColour(sec[1]) + '"></i><em>' + minis(sec[2]) + "</em></span>"; }).join("");
      var cells = st.sectors.map(function (sec) {
        var c = gpColour(sec[1]), text = sec[1] === null ? "#D9A6F7" : c;
        return '<span><b style="color:' + text + ";background:" + gpAlpha(c, 0.14) + ";border-color:" + gpAlpha(c, 0.35) + '">' + sec[0] + "</b><em>" + minis(sec[2]) + "</em></span>";
      }).join("");
      var gapRow = st.gap === null
        ? '<div class="gp-gaprow">First Run</div>'
        : '<div class="gp-gaprow"><span>Gap to your previous best</span><b class="' + dcol + '">' + gpGap(st.gap) + "</b></div>";
      return '<div class="gp-st' + (i === 0 ? " is-open" : "") + '">' +
        '<div class="gp-row"><span class="gp-name">' + st.name + "</span>" + (st.pb ? '<span class="gp-pbb">PB</span>' : "") +
        '<span class="gp-tr"><span class="gp-time">' + st.time + "</span>" +
        (st.gap === null ? "" : '<span class="gp-dl ' + dcol + '">' + gpGap(st.gap) + "</span>") + "</span></div>" +
        '<div class="gp-mini">' + compact + "</div>" +
        '<div class="gp-det">' + gapRow + (st.trace ? '<div class="gp-trace">' + gpTrace(st) + "</div>" : "") +
        '<div class="gp-cells">' + cells + "</div></div></div>";
    }).join("");
    var gpPanel = document.getElementById("gp-stages");
    gpPanel.innerHTML = gpRows;
    var gpCells = gpPanel.querySelectorAll(".gp-st");
    var gpOpen = 0;
    var gpShow = function (i, animate) {
      gpOpen = i;
      Array.prototype.forEach.call(gpCells, function (c, j) { c.classList.toggle("is-open", j === i); });
      var rv = gpCells[i].querySelector(".gp-reveal");
      if (!rv) return;
      rv.classList.remove("is-on");
      if (animate) { void rv.getBoundingClientRect(); requestAnimationFrame(function () { rv.classList.add("is-on"); }); }
      else rv.classList.add("is-on");
    };
    /* the header's figures count up as the page arrives */
    var gpCount = function () {
      var els = gpPhone.querySelectorAll("[data-count]"), t0 = performance.now();
      var fmt = function (el, v) {
        var f = el.dataset.fmt;
        if (f === "dur") { var h = Math.floor(v / 3600), m = Math.floor(v / 60) % 60, sec = Math.floor(v % 60); return h + ":" + (m < 10 ? "0" : "") + m + ":" + (sec < 10 ? "0" : "") + sec; }
        if (f === "km") return v.toFixed(2) + " km";
        return String(Math.round(v));
      };
      var step = function (now) {
        var k = Math.min((now - t0) / 900, 1), e = 1 - Math.pow(1 - k, 3);
        Array.prototype.forEach.call(els, function (el) { el.textContent = fmt(el, parseFloat(el.dataset.count) * e); });
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    if (reducedMotion || !("IntersectionObserver" in window)) {
      gpPhone.classList.add("is-drawn");
      gpShow(0, false);
    } else {
      var gpTimer = null, gpArrived = false;
      var gpIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            if (!gpArrived) {
              gpArrived = true;
              gpPhone.classList.add("is-drawn");
              gpCount();
              setTimeout(function () { gpShow(0, true); }, 900);
            }
            /* every 7 s the next Stage opens, as a tap on its row does */
            if (!gpTimer) gpTimer = setInterval(function () { gpShow((gpOpen + 1) % gpCells.length, true); }, 7000);
          } else if (gpTimer) {
            clearInterval(gpTimer);
            gpTimer = null;
          }
        });
      }, { threshold: 0.35 });
      gpIO.observe(gpPhone);
    }
  }

  /* ------------------------------------------------------------------
     6. BananaBomb — the app's review screen on an iPhone. Photo cards
        (drawn here, standing in for the visitor's own library) are
        served worst-first: a sunset, an old screenshot, a dark pocket
        shot, a dinner, then a bunch of three near-duplicates. Each card
        sits at its own aspect ratio, pinned above the toolbar with the
        back cards fanned up (Cardstackview.cardOffsets: scale 0.9/0.8
        from the top, blur 2/4). Barry's pose follows the photo's
        category, as the app's fallback does; on Apple Intelligence
        devices he also speaks (the bubble). Peel flies right, bomb left
        (no rotation), skip down; a bunch is bombed from the toolbar
        through "Bomb this Bunch?" and leaves rotated −20°, the app's
        move. Counters tick with a 150ms tint flash. Reduced motion
        shows the first card at rest; paused offscreen.
     ------------------------------------------------------------------ */
  var bbDemo = document.getElementById("bb-demo");
  if (bbDemo) {
    var bbStage = document.getElementById("bb-stage");
    var bbBarry = document.getElementById("bb-barry");
    var bbQuip = document.getElementById("bb-quip");
    var bbConfirm = document.getElementById("bb-confirm");
    var bbKeptEl = document.getElementById("bb-kept"), bbBombedEl = document.getElementById("bb-bombed");
    var bbKeepPill = bbDemo.querySelector(".bb-keep"), bbBombPill = bbDemo.querySelector(".bb-bomb");
    var bbBtn = {};
    Array.prototype.forEach.call(bbDemo.querySelectorAll(".bb-btn"), function (b) { bbBtn[b.dataset.b] = b; });
    var bbKept = 214, bbBombed = 387;

    /* the photos: SVG scenes at their aspect ratio (width / height) */
    var SCENES = {
      screenshot: { ar: 0.62, barry: "screenshot", act: "bomb", quip: "A screenshot of a receipt from 2021. Bold.",
        svg: '<rect width="300" height="484" fill="#f2f2f7"/><rect x="18" y="14" width="40" height="8" rx="4" fill="#1c1c1e"/><rect x="232" y="14" width="50" height="8" rx="4" fill="#1c1c1e"/>' +
          '<rect x="18" y="52" width="170" height="20" rx="5" fill="#1c1c1e"/><rect x="18" y="82" width="110" height="10" rx="5" fill="#8e8e93"/>' +
          '<rect x="14" y="112" width="272" height="200" rx="14" fill="#fff"/>' +
          [0, 1, 2, 3, 4].map(function (i) { var y = 134 + i * 34; return '<rect x="30" y="' + y + '" width="' + (120 + (i * 37) % 60) + '" height="10" rx="5" fill="#3a3a3c"/><rect x="226" y="' + y + '" width="44" height="10" rx="5" fill="#3a3a3c"/>' + (i < 4 ? '<rect x="30" y="' + (y + 22) + '" width="240" height="1" fill="#e5e5ea"/>' : ""); }).join("") +
          '<rect x="14" y="328" width="272" height="56" rx="14" fill="#fff"/><rect x="30" y="350" width="70" height="12" rx="6" fill="#1c1c1e"/><rect x="206" y="348" width="64" height="16" rx="6" fill="#1c1c1e"/>' +
          '<rect x="60" y="414" width="180" height="40" rx="20" fill="#007aff"/><rect x="110" y="429" width="80" height="10" rx="5" fill="#fff"/>' },
      sunset: { ar: 0.75, barry: "landscape", act: "peel",
        svg: '<defs><linearGradient id="bbs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#241a46"/><stop offset=".4" stop-color="#b53f6a"/><stop offset=".62" stop-color="#ff8f3a"/><stop offset=".78" stop-color="#ffcf7a"/></linearGradient></defs>' +
          '<rect width="300" height="400" fill="url(#bbs)"/><circle cx="190" cy="250" r="30" fill="#ffe7a8"/>' +
          '<path d="M0 262 L50 214 L95 244 L150 186 L205 238 L250 204 L300 236 V400 H0Z" fill="#3a2342"/>' +
          '<path d="M0 292 L70 256 L130 284 L190 250 L250 282 L300 264 V400 H0Z" fill="#241830"/>' +
          '<rect y="312" width="300" height="88" fill="#1a1226"/><rect x="168" y="322" width="44" height="3" rx="1.5" fill="#ffd27a" opacity=".7"/><rect x="176" y="336" width="28" height="3" rx="1.5" fill="#ffd27a" opacity=".5"/><rect x="182" y="350" width="16" height="3" rx="1.5" fill="#ffd27a" opacity=".35"/>' },
      dark: { ar: 0.75, barry: "lowlight", act: "bomb",
        svg: '<defs><filter id="bbb"><feGaussianBlur stdDeviation="14"/></filter></defs><rect width="300" height="400" fill="#0d0b0a"/>' +
          '<g filter="url(#bbb)"><circle cx="90" cy="120" r="38" fill="#7a4a1c" opacity=".7"/><circle cx="210" cy="170" r="26" fill="#a8622a" opacity=".6"/><circle cx="150" cy="290" r="60" fill="#2a1d14"/><rect x="30" y="230" width="120" height="40" fill="#3b2a1d" opacity=".6"/></g>' },
      dinner: { ar: 0.75, barry: "food", act: "skip",
        svg: '<rect width="300" height="400" fill="#6b4a33"/><path d="M0 0h300v400H0z" fill="url(#none)"/>' +
          [0, 1, 2, 3, 4, 5].map(function (i) { return '<rect y="' + (i * 70) + '" width="300" height="2" fill="#5a3d29"/>'; }).join("") +
          '<circle cx="150" cy="200" r="118" fill="#f4f1ea"/><circle cx="150" cy="200" r="92" fill="#e9e3d6"/>' +
          '<circle cx="150" cy="200" r="78" fill="#d9822b"/><circle cx="150" cy="200" r="70" fill="#e8973a"/>' +
          '<ellipse cx="125" cy="180" rx="22" ry="16" fill="#fff"/><circle cx="125" cy="180" r="9" fill="#f5b400"/>' +
          '<path d="M160 160c20 10 30 30 26 50" stroke="#f6e3b0" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M150 220c18 8 34 4 44-8" stroke="#f6e3b0" stroke-width="7" fill="none" stroke-linecap="round"/>' +
          '<circle cx="170" cy="235" r="5" fill="#4caf50"/><circle cx="182" cy="226" r="4" fill="#4caf50"/><circle cx="120" cy="230" r="5" fill="#4caf50"/>' +
          '<rect x="262" y="70" width="10" height="260" rx="5" fill="#c9c4b8"/>' },
      bunch: { ar: 0.75, barry: "confused", act: "bunch",
        svg: '<defs><linearGradient id="bbk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5ab3e8"/><stop offset="1" stop-color="#bfe6fa"/></linearGradient></defs>' +
          '<rect width="300" height="400" fill="url(#bbk)"/><rect y="200" width="300" height="70" fill="#1d7fb3"/><rect y="262" width="300" height="138" fill="#ecd6a4"/>' +
          '<path d="M0 262c50-10 100 8 150 0s100-10 150 0v8H0z" fill="#f7f4ee" opacity=".8"/>' +
          '<path d="M120 300 L120 220" stroke="#5a4636" stroke-width="4"/><path d="M60 225 Q120 175 180 225Z" fill="#ff5a5f"/>' +
          '<circle cx="212" cy="286" r="9" fill="#5a3b2a"/><rect x="204" y="294" width="16" height="34" rx="7" fill="#ffd60a"/>' +
          '<circle cx="240" cy="290" r="8" fill="#3b2a20"/><rect x="233" y="297" width="14" height="30" rx="6" fill="#30d158"/>' }
    };
    var ORDER = ["sunset", "screenshot", "dark", "dinner", "bunch"];
    var BARRY = { screenshot: "assets/barry-screenshot.png", landscape: "assets/barry-landscape.png", lowlight: "assets/barry-lowlight.png", food: "assets/barry-food.png", confused: "assets/barry-confused.png" };

    var makeCard = function (key) {
      var sc = SCENES[key], el = document.createElement("div");
      var w = sc.ar >= 1 ? 400 : 300, h = Math.round(w / sc.ar);
      el.className = "bb-card";
      el.dataset.key = key;
      el.innerHTML = '<svg class="bb-photo" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="xMidYMid slice">' + sc.svg + "</svg>" +
        (key === "bunch" ? '<div class="bb-bunch"><img src="assets/bb-split.png" alt="" width="200" height="200"><span><b>3 Photo Bunch</b><small>Tap to split</small></span><i>&rsaquo;</i></div>' : "") +
        '<span class="bb-stamp"><span></span></span>';
      return el;
    };
    var bbDeck = ORDER.map(makeCard);
    bbDeck.forEach(function (c) { bbStage.appendChild(c); });

    /* Cardstackview.cardOffsets, in this stage's pixels */
    var bbLayout = function () {
      var W = bbStage.clientWidth, H = bbStage.clientHeight, pt = W / 393;
      var cw = W - 40 * pt, visible = Math.min(3, bbDeck.length);
      var frontAR = SCENES[bbDeck[0].dataset.key].ar;
      var fh = cw / frontAR;
      var frontTop = Math.max(0, Math.min(H - fh - 16 * pt, H * 0.6));
      var gap = Math.max(20 * pt, Math.max(0, frontTop - 20 * pt) / (visible - 1));
      bbDeck.forEach(function (card, i) {
        var ar = SCENES[card.dataset.key].ar;
        card.style.height = cw / ar + "px";
        card.style.zIndex = String(10 - i);
        if (i < visible) {
          var top = i === 0 ? frontTop : Math.max(0, frontTop - gap * i);
          card.style.opacity = "1";
          card.style.transform = "translateY(" + top + "px) scale(" + (1 - 0.1 * i) + ")";
          card.style.filter = i ? "blur(" + 2 * i + "px)" : "none";
        } else {
          card.style.opacity = "0";
          card.style.transform = "translateY(0) scale(0.7)";
          card.style.filter = "blur(6px)";
        }
      });
      var key = bbDeck[0].dataset.key, src = BARRY[SCENES[key].barry];
      if (bbBarry.getAttribute("src") !== src) {
        bbBarry.classList.add("is-swap");
        setTimeout(function () { bbBarry.setAttribute("src", src); bbBarry.classList.remove("is-swap"); }, 180);
      }
    };

    var flash = function (pill) { pill.classList.add("flash"); setTimeout(function () { pill.classList.remove("flash"); }, 150); };
    var press = function (el, ms) { el.classList.add("is-press"); setTimeout(function () { el.classList.remove("is-press"); }, ms || 180); };
    var bbTimer = null;
    var later = function (fn, ms) { bbTimer = setTimeout(fn, ms); };

    /* one card: drag (or toolbar) → stamp → fly off → recycle → next */
    var bbStep = function () {
      bbLayout();
      var card = bbDeck[0], key = card.dataset.key, sc = SCENES[key];
      var stamp = card.querySelector(".bb-stamp"), label = stamp.firstElementChild;
      if (sc.quip) { bbQuip.textContent = sc.quip; bbQuip.classList.add("show"); }
      var fly = function (transform, counter) {
        card.style.transition = "transform 0.45s cubic-bezier(0.3, 0, 0.8, 1), opacity 0.35s ease-in";
        card.style.transform = transform;
        card.style.opacity = "0";
        if (counter) counter();
        later(function () {
          stamp.className = "bb-stamp";
          bbQuip.classList.remove("show");
          bbDeck.push(bbDeck.shift());
          card.style.transition = "none";
          card.style.transformOrigin = "";
          card.style.opacity = "0";
          card.style.transform = "translateY(0) scale(0.7)";
          void card.offsetWidth;
          card.style.transition = "";
          bbLayout();
          later(bbStep, 1500);
        }, 500);
      };
      var base = card.style.transform;
      later(function () {
        if (sc.act === "bunch") {
          /* bunches go from the toolbar, through the app's confirmation */
          press(bbBtn.bomb, 220);
          later(function () {
            bbConfirm.classList.add("show");
            later(function () {
              press(bbConfirm.querySelector(".go"), 220);
              later(function () {
                bbConfirm.classList.remove("show");
                card.style.transformOrigin = "100% 100%";
                fly(base + " translateX(-700px) rotate(-20deg)", function () {
                  bbBombed += 3; bbBombedEl.textContent = bbBombed; flash(bbBombPill);
                });
              }, 300);
            }, 1700);
          }, 300);
          return;
        }
        var dir = sc.act === "peel" ? 1 : sc.act === "bomb" ? -1 : 0;
        stamp.className = "bb-stamp " + sc.act;
        label.innerHTML = sc.act === "skip"
          ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="9.5"/><path d="M12 7v10M8 13l4 4 4-4" stroke-linecap="round" stroke-linejoin="round"/></svg>SKIP'
          : sc.act.toUpperCase();
        /* the drag toward the decision; the stamp fades in with it */
        card.style.transform = base + (dir ? " translateX(" + dir * 40 + "px)" : " translateY(34px)");
        stamp.classList.add("show");
        later(function () {
          if (sc.act === "peel") fly(base + " translateX(700px)", function () { bbKept++; bbKeptEl.textContent = bbKept; flash(bbKeepPill); });
          else if (sc.act === "bomb") fly(base + " translateX(-700px)", function () { bbBombed++; bbBombedEl.textContent = bbBombed; flash(bbBombPill); });
          else fly(base + " translateY(700px)", null);   /* skip: comes back later, no count */
        }, 850);
      }, sc.quip ? 1800 : 900);
    };

    bbLayout();
    if (!reducedMotion && "IntersectionObserver" in window) {
      var bbIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && !bbTimer) {
            later(bbStep, 700);
          } else if (!entry.isIntersecting && bbTimer) {
            clearTimeout(bbTimer);
            bbTimer = null;
            /* settle whatever was mid-flight so the next start is clean */
            bbConfirm.classList.remove("show");
            bbQuip.classList.remove("show");
            bbDeck.forEach(function (c) { c.style.transition = ""; c.style.transformOrigin = ""; c.querySelector(".bb-stamp").className = "bb-stamp"; });
            bbLayout();
          }
        });
      });
      bbIO.observe(bbDemo);
    }
    window.addEventListener("resize", function () { if (!bbTimer) bbLayout(); });
  }

  /* ------------------------------------------------------------------
     7. PointFoundry — fake LiDAR point cloud: a scanned room (floor,
        two walls, a crate) slowly orbiting on a canvas. Procedural, so
        it costs a couple of KB of JS instead of shipping a real scan.
        Points are jittered so flat surfaces read as scan data, and
        coloured floor→ceiling on the app's cyan→orange ramp.
     ------------------------------------------------------------------ */
  var pfCanvas = document.getElementById("pf-cloud");
  if (pfCanvas && pfCanvas.getContext) {
    var pfCtx = pfCanvas.getContext("2d");

    /* points are bucketed by height so each frame sets fillStyle a
       dozen times instead of ~2000 */
    var PF_BUCKETS = 12;
    var pfBuckets = [];
    var pfColors = [];
    var pfMix = function (a, c, t) { return Math.round(a + (c - a) * t); };
    var pfB;
    for (pfB = 0; pfB < PF_BUCKETS; pfB++) {
      pfBuckets.push([]);
      var pfT = pfB / (PF_BUCKETS - 1);
      pfColors.push(
        "rgba(" + pfMix(0, 255, pfT) + ", " + pfMix(181, 107, pfT) + ", " + pfMix(217, 43, pfT) + ", 0.85)"
      );
    }
    var pfJitter = function (v) { return v + (Math.random() - 0.5) * 0.036; };
    var pfAdd = function (x, y, z) {
      var t = Math.max(0, Math.min(1, (y + 0.66) / 1.4));
      pfBuckets[Math.min(PF_BUCKETS - 1, Math.floor(t * PF_BUCKETS))].push([pfJitter(x), pfJitter(y), pfJitter(z)]);
    };

    /* the room: a full four-wall scan (no ceiling — it would occlude the
       look-down view, and real scans rarely capture one) with a door
       opening, a window opening, a couch against the back wall and a
       table with four legs */
    var PF_STEP = 0.08;
    var pfX, pfY, pfZ;
    var PF_FLOOR = -0.62;
    var PF_TOP = 0.74;
    /* door hole in the z=+1 wall, window hole in the x=-1 wall */
    var pfInDoor = function (x, y) { return x > 0.12 && x < 0.58 && y < 0.46; };
    var pfInWindow = function (z, y) { return z > -0.52 && z < 0.12 && y > -0.1 && y < 0.5; };
    for (pfX = -1; pfX <= 1; pfX += PF_STEP) {
      for (pfZ = -1; pfZ <= 1; pfZ += PF_STEP) pfAdd(pfX, PF_FLOOR, pfZ);
    }
    for (pfX = -1; pfX <= 1; pfX += PF_STEP) {
      for (pfY = PF_FLOOR; pfY <= PF_TOP; pfY += PF_STEP) {
        pfAdd(pfX, pfY, -1);
        if (!pfInDoor(pfX, pfY)) pfAdd(pfX, pfY, 1);
      }
    }
    for (pfZ = -1; pfZ <= 1; pfZ += PF_STEP) {
      for (pfY = PF_FLOOR; pfY <= PF_TOP; pfY += PF_STEP) {
        if (!pfInWindow(pfZ, pfY)) pfAdd(-1, pfY, pfZ);
        pfAdd(1, pfY, pfZ);
      }
    }
    /* couch against the back wall: seat, front face, arms, backrest */
    var PF_BOX = 0.055;
    for (pfX = -0.78; pfX <= -0.08; pfX += PF_BOX) {
      for (pfZ = -0.92; pfZ <= -0.5; pfZ += PF_BOX) pfAdd(pfX, -0.22, pfZ);
      for (pfY = PF_FLOOR; pfY <= -0.22; pfY += PF_BOX) pfAdd(pfX, pfY, -0.5);
      for (pfZ = -0.92; pfZ <= -0.75; pfZ += PF_BOX) pfAdd(pfX, 0.08, pfZ);
      for (pfY = -0.22; pfY <= 0.08; pfY += PF_BOX) pfAdd(pfX, pfY, -0.75);
    }
    for (pfZ = -0.92; pfZ <= -0.5; pfZ += PF_BOX) {
      for (pfY = PF_FLOOR; pfY <= -0.22; pfY += PF_BOX) {
        pfAdd(-0.78, pfY, pfZ);
        pfAdd(-0.08, pfY, pfZ);
      }
    }
    /* table with four legs */
    for (pfX = 0.3; pfX <= 0.78; pfX += PF_BOX) {
      for (pfZ = -0.15; pfZ <= 0.33; pfZ += PF_BOX) pfAdd(pfX, -0.26, pfZ);
    }
    var pfLegs = [[0.35, -0.1], [0.35, 0.28], [0.73, -0.1], [0.73, 0.28]];
    for (var pfL = 0; pfL < pfLegs.length; pfL++) {
      for (pfY = PF_FLOOR; pfY <= -0.26; pfY += 0.06) {
        pfAdd(pfLegs[pfL][0], pfY, pfLegs[pfL][1]);
      }
    }

    var PF_TILT = 0.7; /* look down into the room at ~40° */
    var pfCT = Math.cos(PF_TILT);
    var pfST = Math.sin(PF_TILT);

    var pfSize = function () {
      var rect = pfCanvas.getBoundingClientRect();
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      pfCanvas.width = Math.round(rect.width * dpr);
      pfCanvas.height = Math.round(rect.height * dpr);
    };

    var pfDraw = function (angle) {
      var w = pfCanvas.width;
      var h = pfCanvas.height;
      pfCtx.clearRect(0, 0, w, h);
      var ca = Math.cos(angle);
      var sa = Math.sin(angle);
      for (var bi = 0; bi < PF_BUCKETS; bi++) {
        pfCtx.fillStyle = pfColors[bi];
        var pts = pfBuckets[bi];
        for (var i = 0; i < pts.length; i++) {
          var p = pts[i];
          var rx = p[0] * ca + p[2] * sa;
          var rz = p[2] * ca - p[0] * sa;
          /* tilt the world down so the camera sits above: near edge low
             on screen, far edge high — a true look-down into the room */
          var ry = p[1] * pfCT + rz * pfST;
          var depth = rz * pfCT - p[1] * pfST + 3.1;
          var s = w * 0.3 * (2.4 / depth);
          var size = Math.max(1.5, w * 0.0052 * (2.4 / depth));
          /* -0.06h vertical offset centres the full rotation sweep */
          pfCtx.fillRect(w / 2 + rx * s - size / 2, h / 2 - h * 0.06 - ry * s - size / 2, size, size);
        }
      }
    };

    pfSize();
    if (reducedMotion || !("IntersectionObserver" in window)) {
      pfDraw(-0.5); /* static three-quarter view */
    } else {
      var pfAngle = -0.5;
      var pfLast = null;
      var pfRaf = null;
      var pfFrame = function (ts) {
        if (pfLast !== null) pfAngle += (ts - pfLast) * 0.00016;
        pfLast = ts;
        pfDraw(pfAngle);
        pfRaf = requestAnimationFrame(pfFrame);
      };
      var pfIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && !pfRaf) {
            pfLast = null;
            pfRaf = requestAnimationFrame(pfFrame);
          } else if (!entry.isIntersecting && pfRaf) {
            cancelAnimationFrame(pfRaf);
            pfRaf = null;
          }
        });
      });
      pfIO.observe(pfCanvas);
      window.addEventListener("resize", function () {
        pfSize();
        if (!pfRaf) pfDraw(pfAngle);
      });
    }
  }

  /* ------------------------------------------------------------------
     8. PowerGlass dashboard — 3.5 simulated days in ~35s. The battery
        history line traces out (with overnight charges as steep cyan
        climbs), the dashed blue forecast walks ahead of the now-beam,
        and the Usage History bars start as the app's grey iPhone seed
        profile (~24h per charge) and sharpen into learned heat colours
        as each hour is observed — the app's "the more you use it"
        learning story, with hours@100 drifting up as the seed retires.
        Chart grammar mirrors the app: height-anchored colour ramps,
        #4073FF now-beam, weekday labels at midnight rules.
     ------------------------------------------------------------------ */
  var pgDemo = document.getElementById("pg-demo");
  if (pgDemo) {
    var pgHoursEl = document.getElementById("pg-hours");
    var pgAvgEl = document.getElementById("pg-avg");
    var pgBandEl = document.getElementById("pg-band");
    var pgCapEl = document.getElementById("pg-cap");
    var pgHist = document.getElementById("pg-history").getContext("2d");
    var pgUse = document.getElementById("pg-usage").getContext("2d");

    /* the app's ramp, low→high: cyan, green, yellow, amber, orange */
    var PG_RAMP = [[100, 210, 255], [48, 209, 88], [255, 214, 10], [255, 191, 0], [255, 159, 10]];
    var PG_NOW = "#4073ff";
    var PG_SEED_GREY = "#3a3a3c";
    var PG_LABEL = "rgba(235, 235, 245, 0.6)";
    var PG_FONT = "20px -apple-system, 'Segoe UI', sans-serif";

    var pgRampAt = function (t, alpha) {
      var pos = Math.max(0, Math.min(1, t)) * (PG_RAMP.length - 1);
      var i = Math.min(PG_RAMP.length - 2, Math.floor(pos));
      var f = pos - i;
      var mix = function (k) {
        return Math.round(PG_RAMP[i][k] + (PG_RAMP[i + 1][k] - PG_RAMP[i][k]) * f);
      };
      return "rgba(" + mix(0) + ", " + mix(1) + ", " + mix(2) + ", " + alpha + ")";
    };

    var pgUrgency = function (h) {
      return h < 2 ? "#ff453a" : h < 6 ? "#ff9f0a" : h < 12 ? "#ffd60a" : "#30d158";
    };

    /* true hourly drain (%/hr by hour of day) the sim "lives" */
    var PG_CURVE = [0.7, 0.6, 0.6, 0.6, 0.7, 0.9, 1.8, 3.2, 3.6, 3.0, 2.6, 3.4, 4.2, 3.2, 2.8, 3.0, 3.6, 4.6, 5.4, 5.8, 4.8, 3.4, 1.8, 1.0];
    /* the app never starts empty: a generic iPhone seed profile stands in
       for every hour until it's actually observed. Mean ≈ 4.2%/hr, i.e.
       ~24h from a full charge — learning the real (lighter) curve slowly
       lifts the hours@100 toward ~37h */
    var PG_SEED = [2.4, 2.2, 2.2, 2.2, 2.4, 2.8, 3.6, 4.6, 5.2, 5.2, 5.0, 5.2, 5.4, 5.2, 5.0, 5.0, 5.2, 5.6, 5.8, 5.6, 5.0, 4.2, 3.2, 2.6];
    var PG_TOTAL = 84; /* sim hours per loop (3.5 days) */
    var PG_SPEED = 2.5; /* sim hours per real second */
    var PG_START = 7; /* the loop starts Friday 07:00 */
    var PG_DAYS = ["Sat", "Sun", "Mon", "Tue"];

    var pgT, pgLevel, pgCharging, pgPoints, pgSum, pgCnt, pgHourAcc, pgHourDirty, pgJitter, pgHold, pgShownHours;

    var pgReset = function () {
      pgT = 0;
      pgLevel = 82;
      pgShownHours = Infinity;
      pgCharging = false;
      pgPoints = [{ t: 0, l: 82 }];
      pgSum = [];
      pgCnt = [];
      for (var i = 0; i < 24; i++) {
        pgSum.push(0);
        pgCnt.push(0);
      }
      pgHourAcc = 0;
      pgHourDirty = false;
      /* per-day wobble so the three passes over each hour differ */
      pgJitter = [];
      for (var j = 0; j < 96; j++) pgJitter.push(0.82 + Math.random() * 0.36);
      pgHold = 0;
    };

    /* per-hour estimate: learned average once observed, seed until then */
    var pgVal = function (h) {
      return pgCnt[h] ? pgSum[h] / pgCnt[h] : PG_SEED[h];
    };

    var pgAvgDrain = function () {
      var s = 0;
      for (var i = 0; i < 24; i++) s += pgVal(i);
      return s / 24;
    };

    /* the app's prediction is an integration over the usage curve from
       now, not level ÷ flat average: walk the blended per-hour estimates
       forward until `level` percent is spent */
    var pgHoursToEmpty = function (fromT, level) {
      var remaining = level;
      var t = fromT;
      var spent = 0;
      while (remaining > 0 && spent < 240) {
        var clock = (PG_START + t) % 24;
        var frac = 1 - (clock % 1);
        var drain = pgVal(Math.floor(clock)) * frac;
        if (drain >= remaining) return spent + frac * (remaining / drain);
        remaining -= drain;
        spent += frac;
        t += frac;
      }
      return spent;
    };

    var pgStep = function (dtH) {
      var left = dtH;
      while (left > 0 && pgT < PG_TOTAL) {
        var dt = Math.min(0.05, left);
        left -= dt;
        var prevHour = Math.floor(PG_START + pgT);
        pgT += dt;
        var hod = Math.floor((PG_START + pgT) % 24);
        if (pgCharging) {
          pgLevel = Math.min(100, pgLevel + 55 * dt);
          pgHourDirty = true;
          if (pgLevel >= 100) pgCharging = false;
        } else {
          var drain = PG_CURVE[hod] * pgJitter[Math.floor(PG_START + pgT) % 96];
          pgLevel = Math.max(0, pgLevel - drain * dt);
          pgHourAcc += drain * dt;
          if (pgLevel <= 10) pgCharging = true;
        }
        if (Math.floor(PG_START + pgT) !== prevHour) {
          /* completed an hour: learn it, unless charging polluted it */
          var h = prevHour % 24;
          if (!pgHourDirty) {
            pgSum[h] += pgHourAcc;
            pgCnt[h]++;
          }
          pgHourAcc = 0;
          pgHourDirty = false;
        }
        /* record ~0.15h apart — finer than a plot pixel, 3× fewer points */
        if (pgT - pgPoints[pgPoints.length - 1].t >= 0.15 || pgT >= PG_TOTAL) {
          pgPoints.push({ t: pgT, l: pgLevel });
        }
      }
    };

    /* ---- battery history & forecast (640×220 canvas space) ---- */
    var pgAreaGrad = null;
    var pgLineGrad = null;
    var pgDrawHistory = function () {
      var W = 640;
      var H = 220;
      var L = 14;
      var R = 74;
      var T = 12;
      var B = 34;
      var plotW = W - L - R;
      var plotH = H - T - B;
      var x = function (t) { return L + (t / PG_TOTAL) * plotW; };
      var y = function (l) { return T + (1 - l / 100) * plotH; };
      var g = pgHist;
      g.clearRect(0, 0, W, H);

      /* midnight rules + weekday labels */
      g.font = PG_FONT;
      g.textAlign = "center";
      for (var m = 24 - PG_START, d = 0; m < PG_TOTAL; m += 24, d++) {
        g.strokeStyle = "rgba(255, 255, 255, 0.18)";
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(x(m), T);
        g.lineTo(x(m), T + plotH);
        g.stroke();
        g.fillStyle = PG_LABEL;
        g.fillText(PG_DAYS[d], x(m), H - 8);
      }

      /* traced history: area fill then line, both anchored to height.
         Gradients have constant geometry, so build them once. */
      if (pgPoints.length > 1) {
        if (!pgAreaGrad) {
          pgAreaGrad = g.createLinearGradient(0, T + plotH, 0, T);
          pgAreaGrad.addColorStop(0, "rgba(255, 159, 10, 0)");
          pgAreaGrad.addColorStop(0.25, "rgba(255, 191, 0, 0.09)");
          pgAreaGrad.addColorStop(0.5, "rgba(255, 214, 10, 0.18)");
          pgAreaGrad.addColorStop(0.75, "rgba(48, 209, 88, 0.26)");
          pgAreaGrad.addColorStop(1, "rgba(100, 210, 255, 0.35)");
          pgLineGrad = g.createLinearGradient(0, T + plotH, 0, T);
          pgLineGrad.addColorStop(0, "#ff9f0a");
          pgLineGrad.addColorStop(0.25, "#ffbf00");
          pgLineGrad.addColorStop(0.5, "#ffd60a");
          pgLineGrad.addColorStop(0.75, "#30d158");
          pgLineGrad.addColorStop(1, "#64d2ff");
        }

        /* one polyline, drawn twice: closed copy for the fill, open for
           the stroke */
        var linePath = new Path2D();
        linePath.moveTo(x(pgPoints[0].t), y(pgPoints[0].l));
        for (var i = 1; i < pgPoints.length; i++) linePath.lineTo(x(pgPoints[i].t), y(pgPoints[i].l));
        var last = pgPoints[pgPoints.length - 1];
        var areaPath = new Path2D(linePath);
        areaPath.lineTo(x(last.t), y(0));
        areaPath.lineTo(x(pgPoints[0].t), y(0));
        areaPath.closePath();
        g.fillStyle = pgAreaGrad;
        g.fill(areaPath);
        g.strokeStyle = pgLineGrad;
        g.lineWidth = 4;
        g.lineJoin = "round";
        g.stroke(linePath);

        /* dashed forecast: integrate the blended usage curve forward from
           now — steeper through expensive hours, flatter overnight */
        g.beginPath();
        g.moveTo(x(last.t), y(last.l));
        var fcT = pgT;
        var fcL = pgLevel;
        while (fcL > 0 && fcT < PG_TOTAL) {
          var fcClock = (PG_START + fcT) % 24;
          var fcStep = Math.min(0.5, 1 - (fcClock % 1) || 1);
          var fcDrain = pgVal(Math.floor(fcClock)) * fcStep;
          if (fcDrain >= fcL) {
            fcT += fcStep * (fcL / fcDrain);
            fcL = 0;
          } else {
            fcL -= fcDrain;
            fcT += fcStep;
          }
          g.lineTo(x(Math.min(fcT, PG_TOTAL)), y(fcL));
        }
        g.setLineDash([8, 8]);
        g.strokeStyle = "rgba(10, 132, 255, 0.6)";
        g.lineWidth = 3;
        g.stroke();
        g.setLineDash([]);

        /* the now-beam */
        g.save();
        g.strokeStyle = PG_NOW;
        g.lineWidth = 5;
        g.lineCap = "round";
        g.shadowColor = "rgba(64, 115, 255, 0.6)";
        g.shadowBlur = 10;
        g.beginPath();
        g.moveTo(x(pgT), T);
        g.lineTo(x(pgT), T + plotH);
        g.stroke();
        g.restore();
      }

      /* y axis: 0 / 50 / 100 on the right, like the app */
      g.fillStyle = PG_LABEL;
      g.textAlign = "left";
      g.fillText("100", W - R + 12, y(100) + 7);
      g.fillText("50", W - R + 12, y(50) + 7);
      g.fillText("0", W - R + 12, y(0) + 7);
    };

    /* ---- usage heat bars (640×170 canvas space) ---- */
    var pgDrawUsage = function () {
      var W = 640;
      var H = 170;
      var L = 14;
      var R = 74;
      var T = 10;
      var B = 32;
      var plotW = W - L - R;
      var plotH = H - T - B;
      var g = pgUse;
      g.clearRect(0, 0, W, H);

      var maxV = 0.01;
      var vals = [];
      for (var h = 0; h < 24; h++) {
        var v = pgVal(h);
        vals.push(v);
        if (v > maxV) maxV = v;
      }
      var top = maxV * 1.2; /* the app's 20% headroom */

      var slot = plotW / 24;
      for (var i = 0; i < 24; i++) {
        var bx = L + i * slot + slot * 0.08;
        var bw = slot * 0.84;
        /* seeded hours draw at their seed height in grey (the app's
           systemGray4 convention) until actually observed */
        var bh = (vals[i] / top) * plotH;
        g.fillStyle = pgCnt[i] ? pgRampAt(vals[i] / maxV, 1) : PG_SEED_GREY;
        if (g.roundRect) {
          g.beginPath();
          g.roundRect(bx, T + plotH - bh, bw, bh, 5);
          g.fill();
        } else {
          g.fillRect(bx, T + plotH - bh, bw, bh);
        }
      }

      /* x labels every 6 hours, the app's fixed clock row */
      var marks = [[0, "12am"], [6, "6am"], [12, "12pm"], [18, "6pm"], [24, "12am"]];
      g.font = PG_FONT;
      g.fillStyle = PG_LABEL;
      for (var mI = 0; mI < marks.length; mI++) {
        /* left-align the first label so it isn't clipped by the canvas edge */
        g.textAlign = mI === 0 ? "left" : "center";
        g.fillText(marks[mI][1], L + (marks[mI][0] / 24) * plotW - (mI === 0 ? 4 : 0), H - 6);
      }

      /* y scale: just the ceiling value on the right */
      g.textAlign = "left";
      g.fillText(top.toFixed(1), W - R + 12, T + 8);
      g.fillText("0", W - R + 12, T + plotH + 7);

      /* now-beam at the current clock position */
      var nowX = L + (((PG_START + pgT) % 24) / 24) * plotW;
      g.save();
      g.strokeStyle = PG_NOW;
      g.lineWidth = 5;
      g.lineCap = "round";
      g.shadowColor = "rgba(64, 115, 255, 0.6)";
      g.shadowBlur = 10;
      g.beginPath();
      g.moveTo(nowX, T);
      g.lineTo(nowX, T + plotH);
      g.stroke();
      g.restore();
    };

    /* text values change every few sim-hours, not every frame — writing
       identical textContent still dirties layout, so cache and diff */
    var pgDomCache = {};
    var pgSetText = function (el, key, text) {
      if (pgDomCache[key] !== text) {
        pgDomCache[key] = text;
        el.textContent = text;
      }
    };
    var pgDrawDom = function () {
      var avg = pgAvgDrain();
      var capH = 100 / avg; /* hours a full charge is worth — rises as the
                               lighter true usage replaces the seed */
      var hoursNow = pgHoursToEmpty(pgT, pgLevel);
      /* learning can revise future hours cheaper and push the estimate UP
         while discharging — a countdown that goes up reads as a bug, so
         the shown value only ratchets down between charges */
      var shown = hoursNow;
      if (!pgCharging && shown > pgShownHours) {
        shown = pgShownHours;
      }
      pgShownHours = shown;
      pgSetText(pgHoursEl, "hours", shown < 0.5 ? "<1h" : Math.round(shown) + "h");
      var tint = pgUrgency(shown);
      if (pgDomCache.tint !== tint) {
        pgDomCache.tint = tint;
        pgHoursEl.style.color = tint;
      }
      if (pgDomCache.bolt !== pgCharging) {
        pgDomCache.bolt = pgCharging;
        pgHoursEl.parentNode.classList.toggle("charging", pgCharging);
      }
      pgSetText(pgAvgEl, "avg", avg.toFixed(2) + "%/hr");
      pgSetText(pgCapEl, "cap", Math.round(capH) + "h");
      /* the app's fill fraction: hours remaining / hours at 100 */
      var bandPct = Math.max(0, Math.min(1, hoursNow / capH)) * 100;
      pgBandEl.style.clipPath = "inset(0 " + (100 - bandPct).toFixed(1) + "% 0 0 round 999px)";
    };

    var pgRender = function () {
      pgDrawHistory();
      pgDrawUsage();
      pgDrawDom();
    };

    pgReset();
    if (reducedMotion || !("IntersectionObserver" in window)) {
      /* static: show the loop's completed state */
      pgStep(PG_TOTAL);
      pgRender();
    } else {
      var pgLast = null;
      var pgRaf = null;
      var pgFading = false;
      var pgFrame = function (ts) {
        if (pgLast !== null) {
          var dt = Math.min(0.1, (ts - pgLast) / 1000);
          if (pgHold > 0) {
            pgHold -= dt;
            /* last 0.5s of the hold: cross-fade the readouts out so the
               reset happens while they're invisible */
            if (pgHold <= 0.5 && !pgFading) {
              pgFading = true;
              pgDemo.classList.add("resetting");
            }
            if (pgHold > 0) {
              /* nothing changes during the hold — keep time, skip drawing */
              pgLast = ts;
              pgRaf = requestAnimationFrame(pgFrame);
              return;
            }
            pgReset();
            pgFading = false;
            pgDemo.classList.remove("resetting"); /* fresh run fades in */
          } else {
            pgStep(dt * PG_SPEED);
            if (pgT >= PG_TOTAL) pgHold = 3.2; /* linger on the full picture */
          }
        }
        pgLast = ts;
        pgRender();
        pgRaf = requestAnimationFrame(pgFrame);
      };
      var pgIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && !pgRaf) {
            pgLast = null;
            pgRaf = requestAnimationFrame(pgFrame);
          } else if (!entry.isIntersecting && pgRaf) {
            cancelAnimationFrame(pgRaf);
            pgRaf = null;
          }
        });
      });
      pgIO.observe(pgDemo);
    }
  }

  /* ------------------------------------------------------------------
     9. Hero tagline rotation — the lines themselves live in index.html
        (the HERO TAGLINES list). The first line arrives with the hero's
        entrance; rotation starts once that finishes, then cycles in order.
        Pauses while the tab is hidden; off entirely for reduced motion.
     ------------------------------------------------------------------ */
  var rotator = document.querySelector(".tagline-rotator");
  var taglines = rotator ? rotator.children : [];
  if (taglines.length > 1 && !reducedMotion) {
    var TAGLINE_HOLD = 5200; // ms each line stays up (crossfade included)
    var taglineIndex = 0;
    var taglineTimer = null;
    var taglineStarted = false;

    var nextTagline = function () {
      taglines[taglineIndex].classList.remove("is-active");
      taglineIndex = (taglineIndex + 1) % taglines.length;
      taglines[taglineIndex].classList.add("is-active");
      scheduleTagline();
    };
    var scheduleTagline = function () {
      clearTimeout(taglineTimer);
      taglineTimer = document.hidden ? null : setTimeout(nextTagline, TAGLINE_HOLD);
    };
    var startTaglines = function () {
      if (taglineStarted) return;
      taglineStarted = true;
      scheduleTagline();
    };

    // Wait for the entrance ("rise") to end; the timeout is a safety net
    // in case the animation event never fires.
    rotator.addEventListener("animationend", function (e) {
      if (e.target === rotator) startTaglines();
    });
    setTimeout(startTaglines, 2000);

    // Returning to the tab gives the current line a full hold, no jump.
    document.addEventListener("visibilitychange", function () {
      if (taglineStarted) scheduleTagline();
    });
  }

  /* ------------------------------------------------------------------
     10. Parlato chat — replica of the app's chat screen. The turn moves
         between people (and you), two talk over each other to show it's
         full duplex, and Sam drops out and reconnects on his own.
         Static frame for reduced motion; paused offscreen.
     ------------------------------------------------------------------ */
  var ptDemo = document.getElementById("pt-demo");
  if (ptDemo) {
    var ptCards = {};
    Array.prototype.forEach.call(ptDemo.querySelectorAll(".pt-card"), function (el) {
      ptCards[el.dataset.peer] = { el: el, state: el.querySelector(".pt-state"), bars: el.querySelectorAll(".pt-peerwave span") };
    });
    var ptYouBars = ptDemo.querySelectorAll(".pt-you span");
    var ptStatus = document.getElementById("pt-status");
    var ptTimerEl = document.getElementById("pt-timer");
    var ptSeconds = 23 * 60 + 42;
    var ptT = 0;

    /* Who's doing what, in seconds from the start of the loop */
    var PT_LOOP = 22;
    var ptScript = function (t) {
      return {
        maya: (t >= 0.5 && t < 4) || (t >= 16 && t < 19.5),
        you: t >= 4.8 && t < 7.6,
        leo: (t >= 8.4 && t < 11) || (t >= 17 && t < 20),
        samDown: t >= 11.6 && t < 15.6
      };
    };
    /* the resting dome, as in the app */
    var ptDome = function (i, n) {
      var x = (i - (n - 1) / 2) / ((n - 1) / 2);
      return 6 + 8 * (1 - x * x);
    };
    var ptVoice = function (bars, maxH, on, phase) {
      for (var i = 0; i < bars.length; i++) {
        var h;
        if (on) {
          var env = 0.55 + 0.45 * Math.sin(phase * 1.7 + i * 0.9) * Math.sin(phase * 0.6 + 1);
          h = 4 + Math.random() * maxH * Math.max(0.25, env);
        } else {
          h = bars.length > 10 ? ptDome(i, bars.length) : 4;
        }
        bars[i].style.height = h.toFixed(1) + "px";
      }
    };
    var ptRender = function () {
      var s = ptScript(ptT % PT_LOOP);
      ["leo", "maya", "sam"].forEach(function (k) {
        var c = ptCards[k];
        var talking = !!s[k];
        var down = k === "sam" && s.samDown;
        c.el.classList.toggle("is-speaking", talking && !down);
        c.el.classList.toggle("is-reconnecting", down);
        c.state.textContent = down
          ? "Reconnecting · " + Math.max(1, Math.ceil((ptT % PT_LOOP) - 11.6)) + "s"
          : talking ? "Speaking" : "Active";
        if (talking) ptVoice(c.bars, 18, true, ptT * 6);
      });
      ptDemo.classList.toggle("is-sending", s.you);
      ptStatus.textContent = s.you ? "Transmitting" : "Listening";
      ptVoice(ptYouBars, 24, s.you, ptT * 6);
      var m = Math.floor(ptSeconds / 60), sec = ptSeconds % 60;
      ptTimerEl.textContent = m + ":" + (sec < 10 ? "0" : "") + sec;
    };

    if (reducedMotion) {
      ptT = 2; /* a still of Maya talking */
      ptRender();
    } else if ("IntersectionObserver" in window) {
      ptRender();
      var ptTimer = null;
      var ptTick = function () {
        var before = Math.floor(ptT);
        ptT += 0.1;
        if (Math.floor(ptT) !== before) ptSeconds++;
        ptRender();
      };
      var ptIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && !ptTimer) {
            ptTimer = setInterval(ptTick, 100);
          } else if (!entry.isIntersecting && ptTimer) {
            clearInterval(ptTimer);
            ptTimer = null;
          }
        });
      });
      ptIO.observe(ptDemo);
    }
  }

  /* ------------------------------------------------------------------
     11. ThumbControl — replica of the app's Home screen. The situation
         changes, the Action Button is pressed, the rules are checked top
         to bottom and the first one that fits lights up (the fallback
         when none do). Background actions (music, home scenes, Health)
         post the app's confirmation banner, as the app does; actions that open
         another app don't. Static frame for reduced motion; paused
         offscreen. Only show actions that work from a press: the torch
         is blocked in the background by iOS, so it's never shown here.
     ------------------------------------------------------------------ */
  var tcDemo = document.getElementById("tc-demo");
  if (tcDemo) {
    var tcNow = document.getElementById("tc-now");
    var tcMsg = document.getElementById("tc-msg");
    var tcRows = tcDemo.querySelectorAll(".tc-row");
    var tcCls = { t: "c-time", p: "c-place", a: "c-audio", m: "c-move" };
    /* each scene: what's true right now, which rule wins, and the banner
       text if the app would post one */
    var tcScenes = [
      { now: [["t", "8:05 AM"], ["m", "Driving"], ["a", "CarPlay"]], win: 0, msg: "Playing Music" },
      { now: [["t", "6:40 PM"], ["p", "Home"]], win: 2 },
      { now: [["t", "10:30 PM"], ["p", "Home"]], win: 1, msg: "Activated Goodnight" },
      { now: [["t", "5:15 PM"], ["p", "Supermarket"]], win: 3 },
      { now: [["t", "2:30 PM"], ["p", "Work"]], win: 4, msg: "Logged Water Intake: 250ml" }
    ];
    var TC_SCENE = 4.6; /* seconds per scene */
    var tcShown = -1;
    var tcSetNow = function (scene) {
      var html = '<span class="tc-now-label">RIGHT NOW</span>';
      scene.now.forEach(function (c) {
        html += '<span class="tc-pill ' + tcCls[c[0]] + '">' + c[1] + "</span>";
      });
      tcNow.innerHTML = html;
    };
    var tcRender = function (t) {
      var i = Math.floor(t / TC_SCENE) % tcScenes.length;
      var u = t % TC_SCENE; /* time within the scene */
      var sc = tcScenes[i];
      if (i !== tcShown) {
        tcShown = i;
        tcSetNow(sc);
      }
      tcNow.classList.toggle("is-changing", u > TC_SCENE - 0.3);
      tcDemo.classList.toggle("is-pressed", u >= 0.9 && u < 1.15);
      tcDemo.classList.toggle("is-glowing", u >= 0.95 && u < 2.6);
      /* the check runs down the list, one rule every 0.14s */
      var checked = u < 1.1 ? -1 : Math.floor((u - 1.1) / 0.14);
      var clear = u >= 4.1;
      for (var r = 0; r < tcRows.length; r++) {
        var done = !clear && checked >= Math.min(r, sc.win);
        tcRows[r].classList.toggle("is-match", done && r === sc.win);
        tcRows[r].classList.toggle("is-skipped", done && r !== sc.win);
      }
      var bannerOn = !!sc.msg && u >= 1.9 && u < 3.9;
      if (bannerOn) tcMsg.textContent = sc.msg;
      tcDemo.classList.toggle("is-banner", bannerOn);
    };

    if (reducedMotion) {
      tcRender(2 * TC_SCENE + 3); /* a still of the bedtime press: Goodnight wins over the TV remote */
    } else if ("IntersectionObserver" in window) {
      var tcT = 0.4;
      tcRender(tcT);
      var tcTimer = null;
      var tcIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && !tcTimer) {
            tcTimer = setInterval(function () {
              tcT += 0.05;
              tcRender(tcT);
            }, 50);
          } else if (!entry.isIntersecting && tcTimer) {
            clearInterval(tcTimer);
            tcTimer = null;
          }
        });
      });
      tcIO.observe(tcDemo);
    }
  }

  /* ------------------------------------------------------------------
     12. BikeSpec — replica of the bike screen's Suspension card, using
         the Intense Tracer sample bike's values. The + button nudges
         fork pressure, fork LSC and shock pressure back to their
         reference: each changed figure rolls, turns orange with a dot
         and a "WAS n" note, and its caption moves from "n under ref" to
         "on ref". The glass save bar rises with the change count; Save
         commits them (one change-log entry in the app) and the bar drops
         away. Then the card resets for the next loop. Static frame for
         reduced motion (changes pending, bar up); paused offscreen.
         The topo contours are the app's TopoLines formula, drawn once.
     ------------------------------------------------------------------ */
  var bsDemo = document.getElementById("bs-demo");
  if (bsDemo) {
    /* topo contours: three "hills" of wobbling loops, every 5th heavier */
    var bsTopo = bsDemo.querySelector(".bs-topo");
    var W = 560, H = 620, topo = "";
    [[0.82, 0.1, 14, 26], [0.05, 0.42, 11, 24], [0.7, 0.78, 12, 28]].forEach(function (hill, h) {
      var cx = W * hill[0], cy = H * hill[1];
      for (var k = 1; k <= hill[2]; k++) {
        var r = k * hill[3], ph = 1.7 + h * 2.3 + k * 0.21, n = 48, pts = [];
        for (var i = 0; i < n; i++) {
          var a = (i / n) * 2 * Math.PI;
          var w = 1 + 0.16 * Math.sin(2 * a + ph) + 0.08 * Math.sin(3 * a + ph * 1.7) + 0.04 * Math.sin(5 * a + ph * 0.6 + r * 0.01);
          pts.push([cx + r * w * Math.cos(a), cy + r * w * Math.sin(a) * 0.78]);
        }
        var mid = function (p, q) { return ((p[0] + q[0]) / 2).toFixed(1) + " " + ((p[1] + q[1]) / 2).toFixed(1); };
        var d = "M" + mid(pts[n - 1], pts[0]);
        for (var j = 0; j < n; j++) d += "Q" + pts[j][0].toFixed(1) + " " + pts[j][1].toFixed(1) + " " + mid(pts[j], pts[(j + 1) % n]);
        topo += '<path' + (k % 5 === 0 ? ' class="ix"' : "") + ' d="' + d + 'Z"/>';
      }
    });
    bsTopo.innerHTML = topo;

    /* each row: saved value, reference, unit, and when + is pressed */
    var bsRows = {
      fp: { v: 82, ref: 85, unit: "psi", steps: [0.8, 1.35, 1.9] },
      fs: { v: 18, ref: 20, unit: "%", steps: [] },
      fl: { v: 8, ref: 10, unit: "clk", steps: [3.0, 3.55] },
      sp: { v: 195, ref: 200, unit: "psi", steps: [4.6, 4.95, 5.25, 5.5, 5.72] }
    };
    bsRows.ss = { v: 30, ref: 30, unit: "%", steps: [] };
    var BS_SAVE = 7.4, BS_RESET = 10.4, BS_LOOP = 11.2;
    var bsCard = bsDemo.querySelector(".bs-card");
    var bsCount = bsDemo.querySelector(".bs-count b");
    var bsSave = bsDemo.querySelector(".bs-save");
    Object.keys(bsRows).forEach(function (k) {
      var el = bsDemo.querySelector('.bs-row[data-k="' + k + '"]');
      var row = bsRows[k];
      row.el = el;
      row.fig = el.querySelector(".bs-val b");
      row.unitEl = el.querySelector(".bs-val em");
      row.dev = el.querySelector(".bs-dev");
      row.plus = el.querySelectorAll(".bs-btn")[1];
      row.shown = null;
    });
    var bsShownCount = null, bsWasReset = false;

    var bsRender = function (t) {
      var u = t % BS_LOOP;
      var pending = 0;
      Object.keys(bsRows).forEach(function (k) {
        var row = bsRows[k];
        var n = 0, pressed = false;
        row.steps.forEach(function (s) {
          if (u >= s && u < BS_RESET) n++;
          if (u >= s - 0.12 && u < s + 0.06) pressed = true;
        });
        var val = row.v + n;
        var isPending = n > 0 && u < BS_SAVE;
        if (isPending) pending++;
        if (val !== row.shown) {
          row.fig.textContent = val;
          if (row.shown !== null && u < BS_RESET) {
            row.fig.classList.remove("roll");
            void row.fig.offsetWidth;
            row.fig.classList.add("roll");
          }
          row.shown = val;
          var d = val - row.ref;
          row.dev.className = "bs-dev " + (d === 0 ? "on" : d > 0 ? "above" : "below");
          row.dev.textContent = d === 0 ? "\u2713 on ref" : (d > 0 ? "\u2191 " : "\u2193 ") + Math.abs(d) + " " + row.unit + (d > 0 ? " over ref" : " under ref");
        }
        row.el.classList.toggle("is-pending", isPending);
        row.unitEl.textContent = isPending ? "was " + row.v : row.unit;
        row.plus.classList.toggle("is-press", pressed);
      });
      if (pending && pending !== bsShownCount) {
        bsCount.textContent = pending + (pending === 1 ? " change" : " changes");
        bsShownCount = pending;
      }
      bsDemo.classList.toggle("is-dirty", pending > 0);
      bsSave.classList.toggle("is-press", u >= BS_SAVE - 0.2 && u < BS_SAVE);
      /* a soft fade as the card returns to its starting values */
      var reset = u >= BS_RESET;
      if (reset && !bsWasReset) {
        bsCard.classList.remove("is-fresh");
        void bsCard.offsetWidth;
        bsCard.classList.add("is-fresh");
      }
      bsWasReset = reset;
    };

    if (reducedMotion) {
      bsRender(6.2); /* three changes pending, save bar up */
    } else if ("IntersectionObserver" in window) {
      var bsT = 0;
      bsRender(bsT);
      var bsTimer = null;
      var bsIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && !bsTimer) {
            bsTimer = setInterval(function () {
              bsT += 0.05;
              bsRender(bsT);
            }, 50);
          } else if (!entry.isIntersecting && bsTimer) {
            clearInterval(bsTimer);
            bsTimer = null;
          }
        });
      });
      bsIO.observe(bsDemo);
    } else {
      bsRender(0);
    }
  }
})();
