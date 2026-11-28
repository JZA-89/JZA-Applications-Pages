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

  /* Snapping only while every chapter fits on the screen. A chapter taller
     than the screen can't be read with mandatory snapping: the next scroll
     jumps to the next chapter. Measured against the smallest viewport
     (100svh) so Safari's toolbar showing and hiding doesn't flip it, and
     re-measured whenever a chapter or the window changes size. */
  var snapProbe = document.createElement("div");
  snapProbe.setAttribute("aria-hidden", "true");
  snapProbe.style.cssText =
    "position:fixed;top:0;left:0;width:0;height:100vh;height:100svh;visibility:hidden;pointer-events:none";
  document.body.appendChild(snapProbe);
  var snapQueued = false;
  function checkSnap() {
    snapQueued = false;
    var screenH = snapProbe.offsetHeight || window.innerHeight;
    var tooTall = false;
    for (var i = 0; i < chapters.length; i++) {
      if (chapters[i].offsetHeight > screenH + 1) { tooTall = true; break; }
    }
    html.classList.toggle("no-snap", tooTall);
  }
  function queueSnap() {
    if (!snapQueued) { snapQueued = true; requestAnimationFrame(checkSnap); }
  }
  checkSnap();
  window.addEventListener("resize", queueSnap);
  window.addEventListener("load", queueSnap);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(queueSnap);
  if ("ResizeObserver" in window) {
    var snapSizes = new ResizeObserver(queueSnap);
    chapters.forEach(function (el) { snapSizes.observe(el); });
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

  /* ------------------------------------------------------------------
     13. MORPHOS pond — one short life, drawn the way the game draws it.
         The drawing routines (membrane blob, cell body, cilia, tails,
         jaws, food sprite, Pulse arc, division rings, the YOU
         marker, danger and edible cues) are ported from the game's
         renderer in morphos.html, with its colours and proportions, at
         the game's real sizes (player r 22 → 28 at the first division,
         prey ~12, hunter ~38, Pulse reach r + 110, half-angle 60°).
         The script follows the game's rules: the cell feeds on algae,
         kills a prey with a Pulse, then a hunter winds up (jaws open,
         chevrons above), the cell fast-swims aside, the lunge misses
         and the cell strikes during the hunter's recovery before
         escaping. At 80 growth it divides as the game shows it, without
         stopping: division rings, then over 1.8 s two cells bud apart
         inside one shared membrane. Its kills have trained the Predator
         class, so its first organ (Predator I: feeding jaws) fades in and
         grows outward as its colour turns Predator. The camera follows the
         cell like the game's does. Reduced motion draws one frame
         mid-fight; offscreen it pauses. Units are the game's world units.
     ------------------------------------------------------------------ */
  /* its own scope: these short names must not clash with earlier sections */
  (function () {
  var moDrop = document.getElementById("mo-drop");
  var moCanvas = document.getElementById("mo-pond");
  if (moDrop && moCanvas && moCanvas.getContext) {
    var c = moCanvas.getContext("2d");
    var TAU = Math.PI * 2, VIEW = 350; /* world units across the drop */
    var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
    var rgba = function (a, o) { return "rgba(" + (a[0] | 0) + "," + (a[1] | 0) + "," + (a[2] | 0) + "," + o + ")"; };
    var mix = function (a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; };
    var rnd = function (n) { var x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
    var ease = function (u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
    var PAL = { deep: [5, 24, 29], light: [15, 57, 55], fluid: [87, 161, 130] };
    var PREY = [98, 194, 218], HUNTER = [237, 110, 103], UNFORMED = [133, 235, 211], PREDATOR = [240, 164, 126];
    var z = 1; /* camera zoom in canvas px per world unit (game's this.camera.zoom) */

    /* ---- the game's drawing, ported ---- */
    var smoothBlob = function (r, t, phase, stretch, rough, points, lobes) {
      points = points || 16; lobes = lobes || 3;
      var pts = [];
      for (var i = 0; i < points; i++) {
        var a = (i / points) * TAU, k = 1 + rough * Math.sin(a * lobes + t * 1.1 + phase) + rough * 0.6 * Math.sin(a * (lobes + 2) - t * 0.73 + phase * 1.8);
        pts.push([Math.cos(a) * r * k * stretch, Math.sin(a) * r * k]);
      }
      c.beginPath();
      c.moveTo((pts[0][0] + pts[points - 1][0]) * 0.5, (pts[0][1] + pts[points - 1][1]) * 0.5);
      for (var j = 0; j < points; j++) {
        var p = pts[j], q = pts[(j + 1) % points];
        c.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) * 0.5, (p[1] + q[1]) * 0.5);
      }
      c.closePath();
    };
    var ellipse = function (x, y, rx, ry, a) { c.beginPath(); c.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), a || 0, 0, TAU); };
    var glows = {};
    var glow = function (co) {
      var key = co.map(function (x) { return Math.round(x / 4) * 4; }).join(",");
      if (glows[key]) return glows[key];
      var cv = document.createElement("canvas"); cv.width = cv.height = 128;
      var g2 = cv.getContext("2d"), g = g2.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, rgba(co, 0.45)); g.addColorStop(0.2, rgba(co, 0.19)); g.addColorStop(0.55, rgba(co, 0.055)); g.addColorStop(1, rgba(co, 0));
      g2.fillStyle = g; g2.fillRect(0, 0, 128, 128);
      return (glows[key] = cv);
    };
    var algae = (function () {
      var cv = document.createElement("canvas"); cv.width = cv.height = 64;
      var x = cv.getContext("2d"), co = [130, 241, 154];
      var g = x.createRadialGradient(32, 32, 1, 32, 32, 31);
      g.addColorStop(0, rgba(co, 0.36)); g.addColorStop(0.35, rgba(co, 0.13)); g.addColorStop(1, rgba(co, 0));
      x.fillStyle = g; x.fillRect(0, 0, 64, 64); x.translate(32, 32);
      x.beginPath(); x.ellipse(0, 0, 10, 8, 0.3, 0, TAU);
      var gg = x.createRadialGradient(-3, -4, 1, 0, 0, 11);
      gg.addColorStop(0, rgba(mix(co, [255, 255, 230], 0.55), 0.86)); gg.addColorStop(0.5, rgba(co, 0.58)); gg.addColorStop(1, rgba(co, 0.13));
      x.fillStyle = gg; x.fill(); x.strokeStyle = rgba(co, 0.75); x.lineWidth = 0.8; x.stroke();
      x.strokeStyle = rgba([5, 36, 35], 0.55); x.lineWidth = 1.2;
      for (var i = -1; i < 2; i++) { x.beginPath(); x.moveTo(-5, i * 3); x.quadraticCurveTo(0, i * 3 - 2, 5, i * 3); x.stroke(); }
      return cv;
    })();

    var cellBody = function (r, t, phase, co, detail, stretch, rough, lobes, clarity) {
      smoothBlob(r, t, phase, stretch, rough, 18, lobes);
      var g = c.createRadialGradient(-r * 0.28, -r * 0.3, r * 0.02, 0, 0, r * 1.15);
      g.addColorStop(0, rgba(mix(co, [237, 255, 244], 0.5), 0.25 + clarity * 0.08)); g.addColorStop(0.35, rgba(co, 0.16 + clarity * 0.04));
      g.addColorStop(0.7, rgba(co, 0.09 + clarity * 0.03)); g.addColorStop(0.91, rgba(co, 0.21 + clarity * 0.05)); g.addColorStop(1, rgba(co, 0.045));
      c.fillStyle = g; c.fill();
      c.strokeStyle = rgba(mix(co, [232, 255, 244], 0.55), 0.66 + clarity * 0.14); c.lineWidth = Math.max(0.65 / z, r * 0.023, (clarity * 0.85) / z); c.stroke();
      smoothBlob(r * 0.934, t, phase + 0.1, stretch, rough * 0.95, 18, lobes); c.strokeStyle = rgba(co, 0.26); c.lineWidth = Math.max(0.4 / z, r * 0.012); c.stroke();
      var nr = r * 0.26, nx = -r * 0.1 + Math.sin(t * 0.4 + phase) * r * 0.027, ny = r * 0.07;
      ellipse(nx, ny, nr, nr * 0.9, phase * 0.1);
      var ng = c.createRadialGradient(nx - nr * 0.3, ny - nr * 0.3, 0, nx, ny, nr);
      ng.addColorStop(0, "rgba(118,122,180,.43)"); ng.addColorStop(0.6, "rgba(63,76,128,.44)"); ng.addColorStop(1, rgba(co, 0.2));
      c.fillStyle = ng; c.fill(); c.strokeStyle = rgba(mix(co, [171, 168, 220], 0.6), 0.68); c.lineWidth = Math.max(0.55 / z, r * 0.016); c.stroke();
      ellipse(nx + nr * 0.22, ny - nr * 0.12, nr * 0.27, nr * 0.23); c.fillStyle = "rgba(216,210,237,.45)"; c.fill();
      var count = (detail > 1 ? 9 : detail > 0 ? 5 : 3) + (Math.floor(phase * 7) % 3);
      for (var i = 0; i < count; i++) {
        var a = i * 2.399 + phase * 0.7 + Math.sin(t * 0.2 + i) * 0.08, rr = r * (0.43 + rnd(i + Math.floor(phase * 41)) * 0.23);
        var size = r * (0.052 + rnd(i * 13 + 91) * 0.034);
        c.save(); c.translate(Math.cos(a) * rr * stretch, Math.sin(a) * rr); c.rotate(a + 0.5); ellipse(0, 0, size * 1.6, size);
        c.fillStyle = i % 3 === 0 ? "rgba(221,184,108,.25)" : rgba(co, 0.22); c.fill();
        c.strokeStyle = i % 3 === 0 ? "rgba(243,211,137,.45)" : rgba(mix(co, [209, 250, 203], 0.3), 0.4); c.lineWidth = Math.max(0.4 / z, r * 0.009); c.stroke();
        c.restore();
      }
      if (detail > 0) {
        c.save(); c.translate(r * 0.31, -r * 0.14); c.rotate(0.45); c.strokeStyle = rgba(co, 0.42); c.lineWidth = Math.max(0.55 / z, r * 0.015);
        for (var j = 0; j < 4; j++) { c.beginPath(); c.ellipse(0, 0, r * (0.15 + j * 0.033), r * (0.08 + j * 0.026), 0, -1.2, 1.2); c.stroke(); }
        c.restore();
      }
      c.beginPath(); c.ellipse(-r * 0.04, -r * 0.04, r * 0.86 * stretch, r * 0.86, 0, 3.65, 4.95);
      c.strokeStyle = "rgba(224,255,242,.28)"; c.lineWidth = Math.max(0.7 / z, r * 0.032); c.stroke();
    };
    var cilia = function (r, t, phase, co, count, length) {
      c.strokeStyle = rgba(co, 0.38); c.lineWidth = 0.65 / z * 1.4;
      for (var i = 0; i < count; i++) {
        var a = (i / count) * TAU + phase * 0.1, ca = Math.cos(a), sa = Math.sin(a), w = Math.sin(t * 4 + phase + i * 0.9), x = ca * r, y = sa * r;
        c.beginPath(); c.moveTo(x, y);
        c.quadraticCurveTo(x + ca * length * 0.5 - sa * w * length * 0.26, y + sa * length * 0.5 + ca * w * length * 0.26, x + ca * length - sa * w * length * 0.35, y + sa * length + ca * w * length * 0.35);
        c.stroke();
      }
    };
    var tails = function (r, t, co, count, strength) {
      for (var j = 0; j < count; j++) {
        var off = (j - (count - 1) / 2) * r * 0.24, len = r * (1.5 + strength * 0.5);
        c.beginPath(); c.moveTo(-r * 0.78, off);
        for (var k = 1; k <= 12; k++) { var u = k / 12; c.lineTo(-r * 0.78 - u * len, off + Math.sin(u * 8 - t * 6 + j) * r * 0.15 * (0.3 + u)); }
        c.strokeStyle = rgba(co, 0.15); c.lineWidth = 3.2 / z; c.stroke();
        c.strokeStyle = rgba(mix(co, [245, 255, 247], 0.4), 0.55); c.lineWidth = 1 / z; c.stroke();
      }
    };
    var jaws = function (r, t, co, level, openness) {
      var gap = openness !== undefined ? clamp(openness, 0.06, 0.65) : 0.23 + 0.035 * Math.sin(t * 2.5), len = r * (0.32 + level * 0.075);
      c.strokeStyle = rgba(mix(co, [255, 223, 190], 0.3), 0.8); c.fillStyle = rgba(co, 0.17); c.lineWidth = 1.3 / z;
      [-1, 1].forEach(function (s) {
        c.beginPath(); c.moveTo(r * 0.62, s * r * 0.5); c.quadraticCurveTo(r * 1.06, s * r * 0.65, r + len, s * r * gap);
        c.lineTo(r * 1.01, s * r * 0.29); c.lineTo(r * 0.84, s * r * 0.45); c.closePath(); c.fill(); c.stroke();
      });
    };

    /* ---- one scripted life ---- */
    var seed = 11;
    var rand = function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    var S;
    var reset = function () {
      seed = 11;
      S = {
        t: 0, fade: 0, fadeIn: 1, beat: "feed", beatT: 0,
        cam: { x: 0, y: 0 },
        p: { x: 0, y: 0, vx: 0, vy: 0, a: -0.6, r: 22, cells: 1, split: 1, predator: 0, organ: 0, evo: 0, sprint: false, cd: 0, growth: 0, aim: null },
        foods: [], prey: null, hunter: null, effects: [], parts: [], divT: -1
      };
      for (var i = 0; i < 12; i++) addFood(0, 0, -0.6, 70, 260, 2.6);
      hud();
    };
    var addFood = function (x, y, dir, near, far, spread) {
      var a = dir + (rand() - 0.5) * spread, d = near + rand() * (far - near);
      S.foods.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, ph: rand() * TAU, rot: rand() * TAU });
    };
    var effect = function (x, y, kind, maxR, colour, life, extra) {
      var e = { x: x, y: y, kind: kind, maxR: maxR, colour: colour, life: life, maxLife: life };
      for (var k in extra) e[k] = extra[k];
      S.effects.push(e);
    };
    var particles = function (x, y, colour, n, speed) {
      for (var i = 0; i < n; i++) {
        var a = rand() * TAU, v = speed * (0.3 + rand() * 0.7), life = 0.35 + rand() * 0.5;
        S.parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life, maxLife: life, r: 1.4 + rand() * 2.4, colour: colour });
      }
    };
    var reach = function () { return S.p.r + 110 + (S.p.cells > 1 ? 8 : 0); };
    var steer = function (o, tx, ty, speed, turn, dt) {
      var dx = tx - o.x, dy = ty - o.y, d = Math.hypot(dx, dy) || 1;
      o.vx += ((dx / d) * speed - o.vx) * Math.min(1, turn * dt);
      o.vy += ((dy / d) * speed - o.vy) * Math.min(1, turn * dt);
    };
    var faceTo = function (o, want, rate, dt) {
      var da = Math.atan2(Math.sin(want - o.a), Math.cos(want - o.a));
      o.a += da * Math.min(1, rate * dt);
    };
    var pulse = function (target) {
      var p = S.p, ang = Math.atan2(target.y - p.y, target.x - p.x);
      p.aim = ang; p.cd = 0.55;
      effect(p.x, p.y, "pulse", reach(), "#b5f6e5", 0.32, { angle: ang, half: Math.PI / 3 });
      target.flash = 0.65;
      target.hp -= 11;
    };
    var grow = function (v) {
      var p = S.p;
      if (p.cells > 1) { p.growth += v; return; }
      p.growth = Math.min(S.beat === "feed2" ? 80 : 76, p.growth + v);
    };
    var eatNearby = function () {
      var p = S.p;
      for (var i = S.foods.length - 1; i >= 0; i--) {
        var f = S.foods[i];
        if (Math.hypot(f.x - p.x, f.y - p.y) < p.r + 8) {
          S.foods.splice(i, 1);
          effect(f.x, f.y, "eat", 16, "#c2ffd7", 0.35);
          particles(f.x, f.y, "#b7ef91", 5, 45);
          grow(4);
        }
      }
      var ahead = 0;
      S.foods.forEach(function (f) { if (Math.hypot(f.x - p.x, f.y - p.y) < 300) ahead++; });
      if (ahead < 9) addFood(p.x, p.y, p.a, 170, 300, 2.2);
      S.foods = S.foods.filter(function (f) { return Math.hypot(f.x - p.x, f.y - p.y) < 700; });
    };
    var nearestFood = function () {
      var p = S.p, best = null, bd = 1e9;
      S.foods.forEach(function (f) { var d = Math.hypot(f.x - p.x, f.y - p.y); if (d < bd) { bd = d; best = f; } });
      return best;
    };

    var step = function (dt) {
      var p = S.p, h = S.hunter, q = S.prey;
      S.t += dt; S.beatT += dt;
      S.fadeIn = Math.max(0, S.fadeIn - dt * 1.2);
      p.cd = Math.max(0, p.cd - dt);
      p.evo = Math.max(0, p.evo - dt);
      p.sprint = false;
      var speed = 120, target = null;

      if (S.beat === "feed") {
        target = nearestFood();
        if (S.t > 3.6) {
          var a = p.a + 0.5;
          S.prey = { x: p.x + Math.cos(a) * 230, y: p.y + Math.sin(a) * 230, vx: 0, vy: 0, a: rand() * TAU, r: 12, hp: 9, maxHp: 9, flash: 0, ph: 1.3 };
          S.beat = "prey"; S.beatT = 0;
        }
      } else if (S.beat === "prey") {
        var d = Math.hypot(q.x - p.x, q.y - p.y);
        target = q;
        p.aim = Math.atan2(q.y - p.y, q.x - p.x);
        if (d < reach() * 0.72 && p.cd <= 0 && q.hp > 0 && S.beatT > 1.2) pulse(q);
        if (q.hp <= 0 && !q.dead) {
          q.dead = true;
          particles(q.x, q.y, "#c9eeca", 18, 95);
          effect(q.x, q.y, "eat", q.r * 1.6, "#c2ffd7", 0.35);
          grow(9);
          S.beat = "lull"; S.beatT = 0;
        }
      } else if (S.beat === "lull") {
        target = nearestFood();
        if (S.beatT > 1.8) {
          var ha = p.a - 1.1;
          S.hunter = h = { x: p.x + Math.cos(ha) * 290, y: p.y + Math.sin(ha) * 290, vx: 0, vy: 0, a: ha + Math.PI, r: 38, hp: 48, maxHp: 48, flash: 0, ph: 0.4,
            mode: "approach", windup: 0, lunge: 0, recover: 0, attackAngle: 0, give: 0 };
          S.beat = "hunter"; S.beatT = 0;
        }
      } else if (S.beat === "hunter") {
        var hd = Math.hypot(h.x - p.x, h.y - p.y), away = Math.atan2(p.y - h.y, p.x - h.x);
        if (h.mode === "approach") {
          target = nearestFood();
          steer(h, p.x, p.y, 125, 2, dt);
          if (hd < 165) { h.mode = "windup"; h.windup = 0.9; h.attackAngle = Math.atan2(p.y - h.y, p.x - h.x); }
        } else if (h.mode === "windup") {
          h.vx *= 0.85; h.vy *= 0.85; h.windup -= dt;
          /* the wind-up is the warning: fast swim out of its line */
          if (h.windup < 0.4) {
            var side = away + 1.35;
            target = { x: p.x + Math.cos(side) * 200, y: p.y + Math.sin(side) * 200 };
            p.sprint = true; speed = 200;
          } else { target = null; p.aim = Math.atan2(h.y - p.y, h.x - p.x); }
          if (h.windup <= 0) { h.mode = "lunge"; h.lunge = 0.3; }
        } else if (h.mode === "lunge") {
          h.lunge -= dt;
          h.vx = Math.cos(h.attackAngle) * 420; h.vy = Math.sin(h.attackAngle) * 420;
          var side2 = away + 1.25;
          target = { x: p.x + Math.cos(side2) * 200, y: p.y + Math.sin(side2) * 200 };
          p.sprint = true; speed = 200;
          if (h.lunge <= 0) { h.mode = "recover"; h.recover = 1.5; h.vx *= 0.1; h.vy *= 0.1; }
        } else if (h.mode === "recover") {
          h.vx *= 0.9; h.vy *= 0.9; h.recover -= dt;
          /* it's open: turn and Pulse it */
          target = hd > reach() * 0.8 ? h : null;
          p.aim = Math.atan2(h.y - p.y, h.x - p.x);
          if (hd < reach() * 0.9 && p.cd <= 0 && h.hp > 30) pulse(h);
          if (h.recover <= 0) { h.mode = "chase"; }
        } else if (h.mode === "chase") {
          /* escape: fast swim away until it loses interest */
          steer(h, p.x, p.y, 120, 1.5, dt);
          target = { x: p.x + Math.cos(away) * 200, y: p.y + Math.sin(away) * 200 };
          p.sprint = true; speed = 240;
          h.give += dt;
          if (h.give > 1.6) { h.mode = "leave"; }
        } else if (h.mode === "leave") {
          var off = Math.atan2(h.y - p.y, h.x - p.x);
          steer(h, h.x + Math.cos(off) * 100, h.y + Math.sin(off) * 100, 110, 1.5, dt);
          target = nearestFood();
          if (hd > 430) { S.hunter = null; S.beat = "feed2"; S.beatT = 0; }
        }
        if (h) { h.x += h.vx * dt; h.y += h.vy * dt; if (h.mode !== "windup" && h.mode !== "lunge" && Math.hypot(h.vx, h.vy) > 5) faceTo(h, Math.atan2(h.vy, h.vx), 5, dt); else if (h.mode === "windup") faceTo(h, h.attackAngle, 10, dt); }
      } else if (S.beat === "feed2") {
        /* divisions never interrupt play (the game's R4): it keeps swimming */
        target = nearestFood();
        if (p.cells === 1 && p.growth >= 80) {
          /* division: the game's rings and burst, then two cells in one membrane */
          S.divT = S.t; p.cells = 2; p.split = 0; p.predator = 1; p.evo = 3.2;
          effect(p.x, p.y, "division", p.r * 4, "#b0ffdb", 1.5);
          particles(p.x, p.y, "#b0ffdb", 28, 140);
        }
        if (S.divT > 0 && S.t - S.divT > 8.5) {
          S.fade += dt * 1.1;
          if (S.fade >= 1) { reset(); return; }
        }
      }

      if (S.divT > 0) {
        /* the game's morph: 1.8 s, smoothstep, old body → new body */
        var k = ease((S.t - S.divT) / 1.8);
        p.split = k; p.r = 22 + 6 * k; p.organ = k;
      }
      if (target) steer(p, target.x, target.y, speed, p.sprint ? 5 : 3, dt);
      else { p.vx *= 0.86; p.vy *= 0.86; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      var aiming = S.beat === "prey" || (h && (h.mode === "recover" || (h.mode === "windup" && h.windup >= 0.4)));
      var want = p.aim !== null && aiming ? p.aim : Math.atan2(p.vy, p.vx);
      if (Math.hypot(p.vx, p.vy) > 4 || p.aim !== null) faceTo(p, want, 6, dt);
      if (!aiming) p.aim = null;

      if (q && !q.dead) {
        q.ph += dt;
        steer(q, q.x + Math.cos(q.ph * 0.7) * 50, q.y + Math.sin(q.ph * 0.5) * 50, 35, 1, dt);
        q.x += q.vx * dt; q.y += q.vy * dt; faceTo(q, Math.atan2(q.vy, q.vx), 3, dt);
        q.flash = Math.max(0, q.flash - dt * 2);
      }
      if (h) h.flash = Math.max(0, h.flash - dt * 2);
      eatNearby();
      S.effects = S.effects.filter(function (e) { e.life -= dt; return e.life > 0; });
      S.parts = S.parts.filter(function (pt) { pt.life -= dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vx *= 0.94; pt.vy *= 0.94; return pt.life > 0; });
      /* the view follows the cell, and frames a nearby threat too */
      var fx = p.x, fy = p.y;
      if (S.hunter && Math.hypot(S.hunter.x - p.x, S.hunter.y - p.y) < 320) { fx = p.x * 0.6 + S.hunter.x * 0.4; fy = p.y * 0.6 + S.hunter.y * 0.4; }
      S.cam.x += (fx - S.cam.x) * Math.min(1, 2.5 * dt);
      S.cam.y += (fy - S.cam.y) * Math.min(1, 2.5 * dt);
      hud();
    };

    /* the panel under the drop, in the game's words */
    var elCells = document.getElementById("mo-cells"), elPlural = document.getElementById("mo-plural");
    var elId = document.getElementById("mo-id"), elFill = document.getElementById("mo-fill"), elLabel = document.getElementById("mo-label");
    var shown = "";
    var hud = function () {
      var p = S.p, g = Math.round(p.growth), key = p.cells + "|" + g;
      if (key === shown) return;
      shown = key;
      elCells.textContent = p.cells;
      elPlural.textContent = p.cells === 1 ? "cell" : "cells";
      elId.textContent = p.cells === 1 ? "Unformed cell" : "Grazer I";
      var goal = p.cells === 1 ? 80 : 190;
      elFill.style.width = (Math.min(g, goal) / goal) * 100 + "%";
      elLabel.textContent = "Next division: " + Math.min(g, goal) + " / " + goal + " growth";
    };

    /* ---- drawing ---- */
    var size = 0, dpr = 1;
    var resize = function () {
      var s = moDrop.clientWidth, d = Math.min(window.devicePixelRatio || 1, 2);
      if (s === size && d === dpr) return;
      size = s; dpr = d;
      moCanvas.width = Math.round(s * d); moCanvas.height = Math.round(s * d);
    };

    var drawPlayer = function (t) {
      var p = S.p, r = p.r, co = p.predator ? PREDATOR : UNFORMED, phase = 0.7;
      c.save(); c.translate(p.x, p.y); c.rotate(p.a);
      var gl = glow(co); c.drawImage(gl, -r * 2, -r * 2, r * 4, r * 4);
      cilia(r * 0.93, t, phase, co, 18, r * 0.11 * (p.sprint ? 0.75 : 1));
      var nodes;
      if (p.cells > 1) {
        smoothBlob(r * 0.98, t, phase, 1, 0.07); c.fillStyle = rgba(co, 0.085); c.fill();
        c.strokeStyle = rgba(co, 0.35); c.lineWidth = 1.1 / z; c.stroke();
        var off = r * 0.36 * p.split, nr = r * (0.9 - 0.26 * p.split);
        nodes = [{ x: -off, y: 0, r: nr }, { x: off, y: 0, r: nr }];
      } else nodes = [{ x: 0, y: 0, r: r * 0.9 }];
      nodes.forEach(function (q, i) { c.save(); c.translate(q.x, q.y); cellBody(q.r, t, phase + i * 0.64, co, 1, 1, 0.035, 3, 0.65); c.restore(); });
      /* a new organ fades in and grows outward from inside the membrane (the game draws jaws over the cells) */
      if (p.organ > 0) { c.save(); c.globalAlpha *= p.organ; var ls = 0.45 + 0.55 * p.organ; c.scale(ls, ls); jaws(r, t, co, 1); c.restore(); }
      if (p.evo > 0) {
        c.strokeStyle = rgba([220, 255, 216], clamp(p.evo * 0.4, 0, 0.6)); c.lineWidth = 2 / z;
        c.beginPath(); c.arc(0, 0, r * (1.1 + (0.5 - Math.sin(t * 3) * 0.5) * 0.3), 0, TAU); c.stroke();
      }
      c.restore();
      /* the game's YOU marker: four arcs and a heading arrow */
      var ring = r * 1.42, span = clamp(5 / (ring * z), 0.22, 0.52), ca = Math.cos(p.a), sa = Math.sin(p.a);
      c.save(); c.translate(p.x, p.y); c.beginPath();
      for (var i = 0; i < 4; i++) { var a = (i * TAU) / 4 + 0.48; c.moveTo(Math.cos(a) * ring, Math.sin(a) * ring); c.arc(0, 0, ring, a, a + span); }
      var base = ring + 1 / z, tip = ring + 6 / z, sd = 3 / z;
      c.moveTo(ca * base - sa * sd, sa * base + ca * sd); c.lineTo(ca * tip, sa * tip); c.lineTo(ca * base + sa * sd, sa * base - ca * sd);
      c.lineCap = "round"; c.strokeStyle = "rgba(3,15,21,.8)"; c.lineWidth = 3 / z; c.stroke();
      c.strokeStyle = "rgba(224,248,194,.82)"; c.lineWidth = 1.2 / z; c.stroke();
      if (S.t < 10) { c.fillStyle = "rgba(231,249,198,.88)"; c.font = 10 / z + 'px "Helvetica Neue",Arial,sans-serif'; c.textAlign = "center"; c.fillText("YOU", 0, ring + 15 / z); }
      c.restore();
    };

    var drawCombatGuide = function () {
      var p = S.p, h = S.hunter, q = S.prey, near = false;
      [h, q].forEach(function (o) { if (o && !o.dead && Math.hypot(o.x - p.x, o.y - p.y) < reach() + o.r + 120) near = true; });
      if (!near) return;
      var r = reach(), ang = p.aim !== null ? p.aim : p.a, half = Math.PI / 3, ready = p.cd <= 0, co = ready ? [172, 233, 206] : [157, 174, 171];
      c.save(); c.translate(p.x, p.y);
      c.beginPath(); c.arc(0, 0, r, ang - half, ang + half); c.strokeStyle = rgba(co, ready ? 0.24 : 0.12); c.lineWidth = 0.9 / z; c.stroke();
      c.beginPath();
      [-1, 1].forEach(function (s) { var a = ang + s * half; c.moveTo(Math.cos(a) * (r - 5 / z), Math.sin(a) * (r - 5 / z)); c.lineTo(Math.cos(a) * (r + 2 / z), Math.sin(a) * (r + 2 / z)); });
      c.stroke();
      c.rotate(ang); c.beginPath(); c.moveTo(r - 5 / z, -3 / z); c.lineTo(r, 0); c.lineTo(r - 5 / z, 3 / z); c.stroke();
      c.restore();
    };

    var drawHpBar = function (o, co) {
      if (o.hp >= o.maxHp || o.hp <= 0) return;
      var w = Math.max(18 / z, o.r * 1.2), hh = 2 / z, y = o.y - o.r - 7 / z;
      c.fillStyle = "rgba(1,9,13,.82)"; c.fillRect(o.x - w * 0.5 - 1 / z, y - 1 / z, w + 2 / z, hh + 2 / z);
      c.fillStyle = rgba(co, 0.88); c.fillRect(o.x - w * 0.5, y, w * clamp(o.hp / o.maxHp, 0, 1), hh);
    };

    var drawPrey = function (q, t) {
      if (!q || q.dead) return;
      var r = q.r, co = mix(PREY, [196, 225, 196], 0.06);
      c.save(); c.translate(q.x, q.y); c.rotate(q.a);
      tails(r, t, co, 2, 0.3);
      c.save(); c.scale(1, 0.86); cellBody(r, t, q.ph, co, 0.6, 1.08, 0.035, 3, 0); c.restore();
      if (q.flash > 0) { smoothBlob(r, t, q.ph, 1, 0.04); c.fillStyle = "rgba(255,240,215," + clamp(q.flash, 0, 0.65) + ")"; c.fill(); }
      c.restore();
      var p = S.p;
      if (Math.hypot(q.x - p.x, q.y - p.y) < 230) {
        c.strokeStyle = "rgba(174,234,178,.52)"; c.lineWidth = 1 / z;
        for (var i = 0; i < 4; i++) { c.beginPath(); c.arc(q.x, q.y, r + 7, (i * TAU) / 4 + 0.18, (i * TAU) / 4 + 0.8); c.stroke(); }
      }
      drawHpBar(q, co);
    };

    var drawHunter = function (h, t) {
      if (!h) return;
      var r = h.r, v = 0.4, v2 = 0.5, rec = h.mode === "recover";
      var base = mix(HUNTER, [196, 225, 196], v2 * 0.13), co = rec ? mix(base, [170, 211, 199], 0.28) : base;
      var progress = h.mode === "windup" ? 1 - clamp(h.windup / 0.9, 0, 1) : 0;
      var gap = h.mode === "windup" ? 0.3 + progress * 0.25 : h.mode === "lunge" ? 0.07 : rec ? 0.42 : undefined;
      c.save(); c.translate(h.x, h.y); c.rotate(h.a);
      c.drawImage(glow(base), -r * 1.6, -r * 1.6, r * 3.2, r * 3.2);
      tails(r * 0.8, t, co, 1, 0.6);
      c.save(); c.scale(1.03 + v * 0.15, 0.76 + v2 * 0.2); cellBody(r, t, h.ph, co, 1, 1, 0.07, 2, 0); c.restore();
      jaws(r * 0.9, t, co, 1, gap);
      c.strokeStyle = rgba(co, 0.55); c.lineWidth = 1 / z;
      [-1, 1].forEach(function (s) { for (var i = 0; i < 3; i++) { var x = -r * 0.55 + i * r * 0.4; c.beginPath(); c.moveTo(x, s * r * 0.76); c.lineTo(x - r * 0.12, s * r * (1.12 - i * 0.05)); c.stroke(); } });
      if (h.flash > 0) { smoothBlob(r, t, h.ph, 1, 0.04); c.fillStyle = "rgba(255,240,215," + clamp(h.flash, 0, 0.65) + ")"; c.fill(); }
      if (h.mode === "lunge") {
        c.strokeStyle = rgba(co, 0.35); c.lineWidth = 1.3 / z;
        [-1, 1].forEach(function (s) { c.beginPath(); c.moveTo(-r * 0.8, s * r * 0.5); c.quadraticCurveTo(-r * 1.6, s * r * 0.6, -r * 2.3, s * r * 0.9); c.stroke(); });
      }
      c.restore();
      /* danger chevrons: two, because it is bigger than you */
      var p = S.p;
      if (Math.hypot(h.x - p.x, h.y - p.y) < 430) {
        c.save(); c.translate(h.x, h.y - r - 13 / z); c.scale(1 / z, 1 / z); c.strokeStyle = rgba(co, 0.86); c.lineWidth = 1.2;
        for (var j = 0; j < 2; j++) { c.beginPath(); c.moveTo(-4, 4 - j * 5); c.lineTo(0, -j * 5); c.lineTo(4, 4 - j * 5); c.stroke(); }
        c.restore();
      }
      drawHpBar(h, co);
    };

    var drawEffects = function () {
      S.effects.forEach(function (e) {
        var alpha = clamp(e.life / e.maxLife, 0, 1), r = Math.max(1, e.maxR * (1 - Math.pow(alpha, 2.2)));
        c.save(); c.translate(e.x, e.y); c.strokeStyle = e.colour; c.globalAlpha = alpha;
        if (e.kind === "pulse") {
          r = Math.max(1, e.maxR * (1 - Math.pow(alpha, 3)));
          var a = e.angle, half = e.half, inner = Math.max(0.1, r * 0.76);
          c.beginPath(); c.arc(0, 0, r, a - half, a + half); c.arc(0, 0, inner, a + half, a - half, true); c.closePath();
          c.fillStyle = e.colour; c.globalAlpha = alpha * 0.08; c.fill();
          c.globalAlpha = alpha; c.beginPath(); c.arc(0, 0, r, a - half, a + half); c.lineWidth = 1.5 / z; c.stroke();
          c.globalAlpha = alpha * 0.2; c.lineWidth = 5 / z; c.stroke();
          c.globalAlpha = alpha * 0.6; c.beginPath();
          [-1, 1].forEach(function (s) { var an = a + s * half; c.moveTo(Math.cos(an) * inner, Math.sin(an) * inner); c.lineTo(Math.cos(an) * r, Math.sin(an) * r); });
          c.lineWidth = 0.8 / z; c.stroke();
        } else if (e.kind === "division") {
          for (var j = 0; j < 3; j++) { c.beginPath(); c.arc(0, 0, r * (1 - j * 0.16), 0, TAU); c.lineWidth = (1.3 - j * 0.3) / z; c.stroke(); }
        } else {
          c.beginPath(); c.arc(0, 0, r, 0, TAU); c.lineWidth = 1.2 / z; c.stroke();
        }
        c.restore();
      });
      S.parts.forEach(function (pt) {
        c.globalAlpha = clamp(pt.life / pt.maxLife, 0, 1); c.fillStyle = pt.colour;
        ellipse(pt.x, pt.y, pt.r, pt.r * 0.7, pt.vx * 0.02); c.fill();
      });
      c.globalAlpha = 1;
    };

    var drawBackground = function (t) {
      var w = size * dpr;
      c.setTransform(1, 0, 0, 1, 0, 0);
      var g = c.createLinearGradient(0, 0, w * 0.7, w);
      g.addColorStop(0, rgba(PAL.light, 1)); g.addColorStop(0.5, rgba(PAL.deep, 1)); g.addColorStop(1, rgba(mix(PAL.deep, PAL.light, 0.24), 1));
      c.fillStyle = g; c.fillRect(0, 0, w, w);
      c.setTransform(z, 0, 0, z, w / 2 - S.cam.x * z, w / 2 - S.cam.y * z);
      /* pools of light and drifting motes, fixed to the world so swimming reads as movement */
      var tile = 260, half = VIEW / 2 + tile;
      var gx0 = Math.floor((S.cam.x - half) / tile), gy0 = Math.floor((S.cam.y - half) / tile);
      for (var ix = 0; ix < 5; ix++) for (var iy = 0; iy < 5; iy++) {
        var gx = gx0 + ix, gy = gy0 + iy, key = gx * 7.31 + gy * 3.17;
        var x = (gx + 0.2 + rnd(key + 4.1) * 0.6) * tile, y = (gy + 0.2 + rnd(key + 1.7) * 0.6) * tile, rr = tile * (0.45 + rnd(key + 2.9) * 0.3);
        var cl = c.createRadialGradient(x, y, 0, x, y, rr);
        cl.addColorStop(0, rgba(PAL.fluid, 0.07)); cl.addColorStop(0.5, rgba(PAL.fluid, 0.022)); cl.addColorStop(1, rgba(PAL.fluid, 0));
        c.fillStyle = cl; c.fillRect(x - rr, y - rr, rr * 2, rr * 2);
        for (var m = 0; m < 5; m++) {
          var mx = (gx + rnd(key + m * 1.3)) * tile + Math.sin(t * 0.3 + m + key) * 6, my = (gy + rnd(key + m * 2.1 + 0.5)) * tile + Math.cos(t * 0.25 + m) * 5;
          c.fillStyle = m % 2 ? "rgba(214,237,162,.22)" : "rgba(181,220,194,.14)";
          ellipse(mx, my, 1.1 + rnd(key + m) * 1.2, 1.1 + rnd(key + m) * 1.2); c.fill();
        }
      }
    };

    var draw = function () {
      var t = S.t;
      z = (size * dpr) / VIEW;
      drawBackground(t);
      c.globalAlpha = 1;
      S.foods.forEach(function (f) {
        var bob = Math.sin(t * 1.4 + f.ph) * 2;
        c.save(); c.translate(f.x, f.y + bob); c.rotate(f.rot + t * 0.2); c.drawImage(algae, -16, -16, 32, 32); c.restore();
      });
      drawPrey(S.prey, t);
      drawHunter(S.hunter, t);
      drawCombatGuide();
      drawPlayer(t);
      drawEffects();
      var veil = Math.max(S.fade, S.fadeIn);
      if (veil > 0) {
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.fillStyle = "rgba(5,24,29," + veil + ")";
        c.fillRect(0, 0, size * dpr, size * dpr);
      }
    };

    reset();
    resize();
    window.addEventListener("resize", function () { resize(); draw(); });

    if (reducedMotion) {
      /* a still frame: the hunter has lunged and missed, and the cell strikes back */
      for (var guard = 0; guard < 2400; guard++) {
        step(1 / 60);
        if (S.hunter && S.hunter.mode === "recover" && S.effects.some(function (e) { return e.kind === "pulse" && e.life < 0.2; })) break;
      }
      S.fadeIn = 0;
      draw();
    } else if ("IntersectionObserver" in window) {
      var raf = null, last = 0, acc = 0;
      var frame = function (now) {
        acc += Math.min(0.1, (now - last) / 1000 || 0);
        last = now;
        while (acc >= 1 / 60) { step(1 / 60); acc -= 1 / 60; }
        draw();
        raf = requestAnimationFrame(frame);
      };
      draw();
      new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
          else if (!entry.isIntersecting && raf) { cancelAnimationFrame(raf); raf = null; }
        });
      }).observe(moDrop);
    } else {
      S.fadeIn = 0;
      draw();
    }
  }
  })();

  /* ------------------------------------------------------------------
     14. Cast in Stone cave — the golem exploring and fighting on its own.
         A strip of falling-sand cave three screens long, in the game's
         look as of v1.08 (the Rose Hollows' strata with a pale crust on
         open faces, faceted slate, a back wall with far pillars, lichen and
         roots, a Lodestone, lanterns and crystal, and the game's lighting:
         dark but for what the golem, lamps, crystal and flames throw),
         loose earth, water and steam, with the game's
         Brute golem (sprite rows from castinstone/data.js) and three of
         its creatures (crawler, glowmoth, shard slinger). Nothing is on
         a timer: the golem decides what to do from what is in front of
         it. It walks; jumps a step; bores a thick wall with a Stone spear
         and digs through the rest by walking, as in the game; flies over
         water on an Earth spray; and when a creature is near it types
         the recipe that creature is weak to and fights: Fireball for a
         crawler, Bolt for a moth, the special spell Geyser for a slinger.
         The creatures fight back (a lunge after a wind-up, a swoop, a
         thrown shard) and the golem can be hurt. At the end of the strip
         it fades and a new cave begins. The sockets and the plate under
         the cave show what it is typing. If the game's look, these
         spells or these creatures change, update this. Reduced motion
         draws one still frame from the first fight; offscreen it pauses.
     ------------------------------------------------------------------ */
  (function () {
  var csCanvas = document.getElementById("cs-cave");
  var csSlab = document.getElementById("cs-slab");
  if (csCanvas && csSlab && csCanvas.getContext) {
    var W = 192, H = 120, WW = 576, ctx = csCanvas.getContext("2d");
    var img = ctx.createImageData(W, H), buf = new Uint32Array(img.data.buffer);
    var pk = function (r, g, b) { return (255 << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255); };
    var hash = function (x, y) { var n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); };
    var EMPTY = 0, DIRT = 1, ROCK = 2, EARTH = 3, WATER = 4, STEAM = 5;
    var EL = { fire: "#ff7a2f", water: "#3fa9ff", earth: "#c89a4a", lightning: "#fff27a" };
    var ELRGB = { fire: [255, 122, 47], water: [63, 169, 255], earth: [200, 154, 74], lightning: [255, 242, 122] };
    var STONE = { h: [214, 206, 192], m: [150, 143, 138], d: [96, 90, 94], s: [52, 44, 54], k: [20, 16, 24], g: [122, 172, 150], e: [255, 236, 196] };
    var GOLEM = ["...kkkkk.kkk.kkkkk...", "..khhgghkhhhkhhhghk..", ".khhhmmshhmmshhhmmhk.", ".khmmmmshLmRshmmmmdk.", ".ksmmddssmddsmmmddsk.", "khsssssssssssssssshhk", "khhhhhshhhhhhshhhhmdk", "khmmmmshhhmcmshmmmmdk", "kdmmddshmmcmmssmmdddk",
      ".ksssshmmmmcmmsssssk.", ".khhhsmmmmcmmdshhhhk.", "khhmmssmmmddddshhmmhk", "khmmmsssssdsssshmmmdk", "kdmddshhhsshhhsmmdddk", ".kdddshmmdkdmmsddddk.", "..kkkkmmdk.kmddkkkk..", ".....kdddk.kdddk....."];
    /* the game's sprites as they are now (render.js: CRAWLER and its two leg rows, and the v0.81 glowmoth and shard slinger) */
    var CRAWL = ["....kkkkkk.....", "..kkhhhhhhkk...", ".khhmmsmmsmhkk.", "khmmmsmmmsmmhek", "kmmmmsmmmsmmmek", "kddddsdddsddddk", ".kdddddddddddk."];
    var ART = {
      crawler: [CRAWL.concat([".d.d..d.d..d.d."]), CRAWL.concat(["..d.d..d.d..d.d"])],
      moth: [[".kk.......kk.", "kwwk.k.k.kwwk", "kwvwk.k.kwvwk", "kwwvwkbkwvwwk", ".kwwwkbekwwk.", "..kwvkbbkvwk.", "...kk.kk.kk.."],
             [".............", "....k...k....", ".....kbk.....", ".kkkkbekkkkk.", "kwvwwkbkwwvwk", "kwwvwkbkwvwwk", ".kkkk.k.kkkk."]],
      slinger: [["........kk.", "...kkk.kppk", "..khhmk.kpk", "..kmhek.kk.", "..kkmkkkmk.", ".kmhmmmmk..", ".kmmmmmdk..", ".kmmmmmdk..", "..kmmmdk...", "..kdkkdk...", "..kdk.kdk..", ".kkk..kkk.."]]
    };
    var COL = {
      crawler: { k: [14, 10, 20], h: [154, 144, 174], m: [108, 100, 128], d: [72, 64, 88], s: [50, 42, 62], e: [255, 70, 160] },
      moth: { w: [222, 196, 244], v: [170, 140, 200], k: [40, 30, 50], b: [124, 104, 146], e: [255, 70, 160] },
      slinger: { k: [26, 20, 18], m: [150, 120, 96], h: [196, 166, 132], d: [100, 78, 66], p: [168, 160, 150], e: [255, 70, 160] }
    };
    /* the Rose Hollows' colours (data.js biomes[0]) and the game's slate */
    var STRATA = [[124, 76, 92], [142, 92, 96], [104, 64, 90], [160, 114, 104], [92, 58, 84], [132, 84, 100]], CRUST = [200, 150, 118], BGC = [30, 22, 46];
    var BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    var em = new Uint8Array(W * H);   /* per pixel: 1 gives its own light (flames, eyes, lamps), 2 is deep in the ground */
    var decor = [], motes = [];
    /* what each creature is weak to: the recipe the golem types for it, the spell's name, and how it is cast */
    var ANSWER = {
      crawler: { q: ["fire", "fire"], name: "Fireball", kind: "Shot", cast: "fireball", dmg: 34 },
      moth: { q: ["lightning", "lightning"], name: "Bolt", kind: "Shot", cast: "bolt", dmg: 27 },
      slinger: { q: ["water", "fire", "water"], name: "Geyser", kind: "Special spell", cast: "geyser", dmg: 60, gold: true }
    };
    var HP = { crawler: 100, moth: 78, slinger: 150 };
    var DIG = [[7, 5, 5, 5, 7], [2, 6, 2, 2, 7], [7, 1, 7, 4, 7], [7, 1, 7, 1, 7], [5, 5, 7, 1, 1], [7, 4, 7, 1, 7], [7, 4, 7, 5, 7], [7, 1, 1, 1, 1], [7, 5, 7, 5, 7], [7, 5, 7, 1, 7]];
    var cells, life, S, run = 0;
    var sockets = document.getElementById("cs-sockets").children;
    var elSpell = document.getElementById("cs-spell"), elKind = document.getElementById("cs-kind");
    var shown = "";
    var at = function (x, y) { x = Math.round(x); y = Math.round(y); return x < 0 || x >= WW || y < 0 || y >= H ? ROCK : cells[y * WW + x]; };
    var solid = function (x, y) { var c = at(x, y); return c === DIRT || c === ROCK || c === EARTH; };
    var floorAt = function (x, y) { y = Math.round(y); while (y < H - 2 && !solid(x, y + 1)) y++; return y; };

    var build = function () {
      cells = new Uint8Array(WW * H); life = new Uint8Array(WW * H);
      var x, y, k = run * 1.7, fl, ce, c;
      for (x = 0; x < WW; x++) {
        fl = 88 + 6 * Math.sin(x / 37 + k) + 4 * Math.sin(x / 13 + 2 * k); ce = 30 + 9 * Math.sin(x / 29 + 1.3 * k) + 5 * Math.sin(x / 11 + k) + (hash(x >> 2, run) < 0.12 ? 7 : 0);   /* a wandering roof with stalactites */
        if (x > 392) fl -= 6;                                  /* a step up */
        for (y = 0; y < H; y++) {
          c = y < ce || y > fl ? DIRT : EMPTY;
          if (c === DIRT && (y < 8 + hash(x >> 3, 1) * 8 || y > 110 - hash(x >> 3, 2) * 6)) c = ROCK;
          if (x >= 150 && x < 174 && y >= ce && y <= fl) c = DIRT;        /* a thick wall: bored, then dug */
          if (x >= 452 && x < 460 && y >= ce && y <= fl) c = DIRT;        /* a thin one: dug */
          if (x >= 262 && x < 310 && y > fl && y <= fl + 15) c = y > fl + 1 ? WATER : EMPTY;   /* a pool */
          cells[y * WW + x] = c;
        }
      }
    };
    var explode = function (cx, cy, r) {
      for (var y = Math.floor(cy - r); y <= cy + r; y++) for (var x = Math.floor(cx - r); x <= cx + r; x++) {
        if (x < 1 || y < 1 || x >= WW - 1 || y >= H - 1 || (x - cx) * (x - cx) + (y - cy) * (y - cy) > r * r) continue;
        var m = cells[y * WW + x];
        if (m === DIRT || m === EARTH) cells[y * WW + x] = EMPTY;
      }
    };
    var foe = function (kind, x) { var y = kind === "moth" ? floorAt(x, 50) - 30 : floorAt(x, 50); return { kind: kind, x: x, y: y, hy: y, vx: 0, vy: 0, hp: HP[kind], st: "idle", t: 0, face: -1, hurt: 0, dead: false, cd: 1 }; };
    var reset = function () {
      run++; build();
      /* what stands in the cave, as in the game: a Lodestone where the golem wakes, lanterns on posts, crystal in the roof */
      decor = [{ kind: "stone", x: 46, y: floorAt(46, 50) }];
      [78, 204, 338, 430, 520].forEach(function (lx) { if (!solid(lx, 50)) decor.push({ kind: "lamp", x: lx, y: floorAt(lx, 50) }); });
      [58, 128, 232, 300, 380, 474, 556].forEach(function (cx, n) { var cy = 50; while (cy > 3 && !solid(cx, cy)) cy--; decor.push({ kind: "crystal", x: cx + (n % 2 ? 2 : -1), y: cy - 2 - (n % 3) }); });
      motes = []; for (var mk = 0; mk < 26; mk++) motes.push({ x: Math.random() * W, y: 20 + Math.random() * 70, p: Math.random() * 6.28 });
      S = { t: 0, queue: [], want: null, typeT: 0, spell: "", kind: "", gold: false, parts: [], shots: [], nums: [], bolt: null, flash: 0, shake: 0, recoil: 0, fade: 0, fadeIn: 1, cam: 0, stuck: 0, lastX: 0,
        golem: { x: 20, y: floorAt(20, 50), vx: 0, vy: 0, hp: 100, ground: true, hurt: 0, cd: 0, fly: false, bored: {} },
        foes: [foe("crawler", 104), foe("moth", 210), foe("crawler", 236), foe("slinger", 352), foe("crawler", 424), foe("moth", 492), foe("slinger", 548)] };
    };
    var puff = function (x, y, n, kind, sp) { for (var k = 0; k < n; k++) S.parts.push({ x: x + (Math.random() - 0.5) * 6, y: y + (Math.random() - 0.5) * 6, vx: (Math.random() - 0.5) * sp, vy: (Math.random() - 0.8) * sp, kind: kind, life: kind === "fire" ? 0.3 + Math.random() * 0.3 : 3 }); };
    var hitFoe = function (f, dmg) {
      if (f.dead) return;
      f.hp -= dmg; f.hurt = 0.2; S.nums.push({ x: f.x, y: f.y - 12, v: dmg, t: 0 });
      if (f.hp <= 0) { f.dead = true; puff(f.x, f.y - 3, 22, EARTH, 80); }
    };
    var hitGolem = function (dmg, dir) { var g = S.golem; if (g.hurt > 0) return; g.hp -= dmg; g.hurt = 0.5; g.vx = dir * 50; g.vy = -70; g.ground = false; S.shake = 0.2; S.nums.push({ x: g.x, y: g.y - 20, v: dmg, t: 0, red: true }); };
    /* type a recipe one element at a time; true once it is all there */
    var type = function (ans, dt) {
      if (S.want !== ans) { S.want = ans; S.queue = []; S.typeT = 0.12; S.spell = ""; S.gold = false; }
      if (S.queue.length < ans.q.length) { S.typeT -= dt; if (S.typeT <= 0) { S.queue.push(ans.q[S.queue.length]); S.typeT = 0.24; if (S.queue.length === ans.q.length) { S.spell = ans.name; S.kind = ans.kind; S.gold = !!ans.gold; } else { S.spell = "…"; S.kind = ""; } } return false; }
      return true;
    };
    var cast = function (ans, f) {
      var g = S.golem, sx = g.x + 8, sy = g.y - 10, T, d;
      S.recoil = 0.16; g.cd = 0.75;
      if (ans.cast === "fireball") { T = Math.max(0.3, Math.abs(f.x - sx) / 150); S.shots.push({ kind: "fireball", x: sx, y: sy, vx: (f.x - sx) / T, vy: (f.y - 3 - sy) / T - 30 * T, g: 60, dmg: ans.dmg }); }
      else if (ans.cast === "bolt") { S.bolt = { x0: sx, y0: sy, x1: f.x, y1: f.y - 3, t: 0.14 }; S.flash = 0.08; hitFoe(f, ans.dmg); }
      else if (ans.cast === "spear") { S.shots.push({ kind: "spear", x: sx, y: g.y - 8, vx: 250, vy: 0, g: 0, bore: 30, dmg: 34 }); }
      else if (ans.cast === "geyser") { S.flash = 0.22; S.shake = 0.3; f.vy = -150; hitFoe(f, ans.dmg); for (var k = 0; k < 70; k++) S.parts.push({ x: f.x + (Math.random() - 0.5) * 9, y: f.y - 1, vx: (Math.random() - 0.5) * 36, vy: -70 - Math.random() * 120, kind: Math.random() < 0.75 ? WATER : STEAM, life: 3 }); g.cd = 1.2; }
    };
    var SPEAR = { q: ["earth", "lightning"], name: "Stone spear", kind: "Shot", cast: "spear" }, SPRAY = { q: ["earth", "earth"], name: "Earth spray", kind: "Lift" };

    /* the golem: what is in front of it decides what it does */
    var think = function (dt) {
      var g = S.golem, i, f, near = null, nd = 1e9;
      g.cd = Math.max(0, g.cd - dt); g.hurt = Math.max(0, g.hurt - dt);
      for (i = 0; i < S.foes.length; i++) { f = S.foes[i]; var d = Math.abs(f.x - g.x); if (!f.dead && d < nd && f.x > g.x - 30) { nd = d; near = f; } }
      var move = 1, jump = false;
      if (near && nd < 78 && !solid(g.x + 9, g.y - 8)) {
        /* a creature: stop, type what it is weak to, and cast; jump a crawler's lunge */
        move = nd < 26 ? -0.6 : 0;
        if (type(ANSWER[near.kind], dt) && g.cd <= 0) cast(ANSWER[near.kind], near);
        if (near.kind === "crawler" && near.st === "windup" && near.t > 0.28 && nd < 24 && g.ground) jump = true;
      } else if (g.fly) {
        /* over the water on a spray of earth */
        type(SPRAY, dt);
        var below = floorAt(g.x + 4, g.y), wet = at(g.x + 6, below) === WATER || at(g.x + 6, g.y + 3) === WATER || at(g.x + 10, floorAt(g.x + 10, g.y)) === WATER;
        g.vy += ((g.flyY - g.y) * 6 - g.vy) * Math.min(1, 6 * dt);
        if (Math.random() < 0.8) S.parts.push({ x: g.x + (Math.random() - 0.5) * 5, y: g.y + 1, vx: (Math.random() - 0.5) * 26, vy: 90 + Math.random() * 40, kind: EARTH, life: 3 });
        if (!wet && below - g.y < 14 && S.t - g.flyAt > 0.6) g.fly = false;
      } else {
        var wallX = Math.round(g.x + 7), wall = solid(wallX, g.y - 8) || solid(wallX, g.y - 13), low = solid(wallX, g.y - 2) && !solid(wallX, g.y - 7);
        var ahead = floorAt(g.x + 12, g.y - 6), water = at(g.x + 12, ahead) === WATER || at(g.x + 12, g.y + 2) === WATER;
        if (water && g.ground) { g.fly = true; g.flyY = g.y - 12; g.flyAt = S.t; g.ground = false; }
        else if (low && g.ground) jump = true;
        else if (wall) {
          var thick = 0; while (thick < 40 && solid(wallX + thick, g.y - 8)) thick++;
          var key = Math.round(wallX / 30);
          if (thick > 12 && !g.bored[key]) { move = 0; if (type(SPEAR, dt) && g.cd <= 0) { cast(SPEAR, null); g.bored[key] = true; } }
          else if (at(wallX, g.y - 8) !== ROCK) {
            /* dig by walking into it: a column at a time, with crumbs */
            g.digT = (g.digT || 0) + dt;
            if (g.digT > 0.07) { g.digT = 0; for (var yy = Math.round(g.y) - 17; yy <= g.y; yy++) { var ci = yy * WW + wallX; if (cells[ci] === DIRT || cells[ci] === EARTH) { cells[ci] = EMPTY; if (Math.random() < 0.12) S.parts.push({ x: wallX, y: yy, vx: -20 - Math.random() * 40, vy: -20 - Math.random() * 40, kind: EARTH, life: 2 }); } } }
          } else jump = g.ground;
        }
        if (!near || nd > 90) { if (S.want && S.want !== SPEAR && S.want !== SPRAY && S.t - (g.calmAt || 0) > 1.2) { S.want = null; S.queue = []; S.spell = ""; S.kind = ""; S.gold = false; } } else g.calmAt = S.t;
      }
      /* movement and the ground */
      var speed = 30, inW = at(g.x, g.y - 6) === WATER;
      g.vx += (move * speed - g.vx) * Math.min(1, (g.ground ? 10 : 3) * dt);
      if (jump && g.ground) { g.vy = -105; g.ground = false; }
      if (!g.fly) g.vy += (inW ? 90 : 320) * dt;
      if (inW) { g.vx *= 1 - 2 * dt; g.vy *= 1 - 3 * dt; }
      var nx = g.x + g.vx * dt, dir = g.vx > 0 ? 1 : -1, blocked = solid(nx + dir * 6, g.y - 8) || solid(nx + dir * 6, g.y - 14) || solid(nx + dir * 6, g.y - 3);
      if (blocked && g.ground && !solid(nx + dir * 6, g.y - 6) && !solid(nx + dir * 6, g.y - 18)) { g.y -= 2; blocked = false; }   /* up a small step */
      if (!blocked) g.x = Math.max(8, nx); else g.vx = 0;
      var ny = g.y + g.vy * dt;
      if (g.vy > 0 && (solid(g.x, ny + 1) || solid(g.x - 4, ny + 1) || solid(g.x + 4, ny + 1))) { g.y = floorAt(g.x, Math.max(2, g.y - 4)); if (solid(g.x - 4, g.y + 1) === false && solid(g.x + 4, g.y + 1) === false && !solid(g.x, g.y + 1)) g.y = ny; g.vy = 0; g.ground = true; }
      else { if (g.vy < 0 && solid(g.x, ny - 17)) g.vy = 0; else g.y = ny; g.ground = false; }
      /* never stuck for long: blast a way on */
      if (Math.abs(g.x - S.lastX) > 3) { S.lastX = g.x; S.stuck = 0; } else if (!(near && nd < 78)) { S.stuck += dt; if (S.stuck > 4) { S.stuck = 0; explode(g.x + 12, g.y - 9, 11); S.flash = 0.15; puff(g.x + 12, g.y - 9, 18, "fire", 110); } }
    };
    /* the creatures: each warns, then attacks */
    var beasts = function (dt) {
      var g = S.golem, i, f, dx, d;
      for (i = 0; i < S.foes.length; i++) {
        f = S.foes[i]; f.hurt = Math.max(0, f.hurt - dt);
        if (f.dead) continue;
        f.t += dt; f.cd -= dt; dx = g.x - f.x; d = Math.abs(dx); f.face = dx < 0 ? -1 : 1;
        var touch = Math.abs(dx) < 9 && Math.abs((g.y - 8) - (f.y - 3)) < 11;
        if (f.kind === "crawler") {
          if (f.st === "idle") { f.vx = 0; if (d < 70) { f.st = "chase"; f.t = 0; } }
          else if (f.st === "chase") { f.vx = f.face * 20; if (d < 18 && f.cd <= 0) { f.st = "windup"; f.t = 0; f.vx = 0; } }
          else if (f.st === "windup") { f.vx = 0; if (f.t > 0.5) { f.st = "lunge"; f.t = 0; f.vx = f.face * 115; f.vy = -40; f.struck = false; } }
          else if (f.st === "lunge") { if (touch && !f.struck) { f.struck = true; hitGolem(14, f.face); } if (f.t > 0.3) { f.st = "chase"; f.t = 0; f.cd = 1.1; } }
          f.vy += 320 * dt; f.x += f.vx * dt; if (solid(f.x + f.face * 6, f.y - 3)) f.x -= f.vx * dt;
          var fy = f.y + f.vy * dt; if (f.vy > 0 && solid(f.x, fy + 1)) { f.y = floorAt(f.x, Math.max(2, f.y - 6)); f.vy = 0; } else f.y = fy;
        } else if (f.kind === "moth") {
          if (f.st === "idle") { f.y = f.hy + Math.sin(S.t * 2 + i) * 3; if (d < 82) { f.st = "hover"; f.t = 0; } }
          else if (f.st === "hover") { f.x += ((g.x - f.face * 30) - f.x) * Math.min(1, 1.6 * dt); f.y += ((g.y - 34) - f.y) * Math.min(1, 1.6 * dt); if (f.t > 1.2 && f.cd <= 0) { f.st = "windup"; f.t = 0; } }
          else if (f.st === "windup") { if (f.t > 0.5) { f.st = "swoop"; f.t = 0; var L = Math.hypot(dx, g.y - 8 - f.y) || 1; f.vx = dx / L * 120; f.vy = (g.y - 8 - f.y) / L * 120; f.struck = false; } }
          else if (f.st === "swoop") { f.x += f.vx * dt; f.y += f.vy * dt; if (touch && !f.struck) { f.struck = true; hitGolem(10, f.face); } if (f.t > 0.42 || solid(f.x, f.y + 1)) { f.st = "hover"; f.t = 0; f.cd = 1.4; } }
        } else {
          f.y = floorAt(f.x, Math.max(2, f.y - 6) ); if (f.vy) { f.vy += 400 * dt; f.hy = (f.hy || 0); }
          if (f.st === "idle") { if (d < 96) { f.st = "ready"; f.t = 0; } }
          else if (f.st === "ready") { if (f.cd <= 0 && d < 110) { f.st = "windup"; f.t = 0; } }
          else if (f.st === "windup") { if (f.t > 0.6) { f.st = "ready"; f.t = 0; f.cd = 2.1; var T = Math.max(0.5, d / 120); S.shots.push({ kind: "shard", x: f.x + f.face * 4, y: f.y - 11, vx: dx / T, vy: (g.y - 8 - (f.y - 11)) / T - 100 * T, g: 200, dmg: 12 }); } }
        }
      }
    };
    var step = function (dt) {
      S.t += dt; S.fadeIn = Math.max(0, S.fadeIn - dt * 1.6);
      S.flash = Math.max(0, S.flash - dt); S.shake = Math.max(0, S.shake - dt); S.recoil = Math.max(0, S.recoil - dt);
      if (S.bolt) { S.bolt.t -= dt; if (S.bolt.t <= 0) S.bolt = null; }
      think(dt); beasts(dt);
      var i, k, x, y, f, p, g = S.golem;
      /* shots: the golem's and the slinger's */
      for (i = S.shots.length - 1; i >= 0; i--) {
        p = S.shots[i]; var gone = false;
        for (k = 0; k < 4 && !gone; k++) {
          p.vy += p.g * dt / 4; p.x += p.vx * dt / 4; p.y += p.vy * dt / 4;
          var m = at(p.x, p.y), hit = null;
          if (p.kind !== "shard") for (var j = 0; j < S.foes.length; j++) { f = S.foes[j]; if (!f.dead && Math.abs(f.x - p.x) < 6 && p.y > f.y - 8 && p.y < f.y + 2) hit = f; }
          if (p.kind === "fireball" && (hit || m === DIRT || m === ROCK || m === EARTH)) {
            explode(p.x, p.y, 8); S.flash = 0.18; S.shake = 0.22; puff(p.x, p.y, 22, "fire", 110); puff(p.x, p.y, 8, EARTH, 80);
            for (j = 0; j < S.foes.length; j++) { f = S.foes[j]; if (!f.dead && Math.hypot(f.x - p.x, f.y - 3 - p.y) < 14) hitFoe(f, p.dmg); }
            gone = true;
          } else if (p.kind === "spear") {
            if (m === DIRT || m === EARTH) { explode(p.x, p.y, 3.2); p.bore -= 250 * dt / 4; if (Math.random() < 0.2) S.parts.push({ x: p.x, y: p.y, vx: (Math.random() - 0.5) * 40, vy: -20, kind: EARTH, life: 2 }); }
            if (hit) { hitFoe(hit, p.dmg); gone = true; } else if (m === ROCK || p.bore <= 0 || p.x > g.x + 150) gone = true;
          } else if (p.kind === "shard") {
            if (Math.abs(p.x - g.x) < 7 && p.y > g.y - 17 && p.y < g.y) { hitGolem(p.dmg, p.vx > 0 ? 1 : -1); gone = true; }
            else if (m === DIRT || m === ROCK || m === EARTH) { puff(p.x, p.y, 4, EARTH, 50); gone = true; }
          }
          if (p.y > H || p.x < 0 || p.x > WW) gone = true;
        }
        if (gone) S.shots.splice(i, 1);
      }
      for (i = S.nums.length - 1; i >= 0; i--) { S.nums[i].t += dt; if (S.nums[i].t > 0.8) S.nums.splice(i, 1); }
      /* particles: fire fades; earth, water and steam turn back into cells where they land */
      for (i = S.parts.length - 1; i >= 0; i--) {
        var q = S.parts[i];
        q.life -= dt; q.vy += (q.kind === STEAM ? -30 : 240) * dt; q.x += q.vx * dt; q.y += q.vy * dt;
        x = Math.round(q.x); y = Math.round(q.y);
        var out = q.life <= 0 || x < 1 || y < 1 || x >= WW - 1 || y >= H - 1;
        if (!out && q.kind !== "fire" && cells[y * WW + x] !== EMPTY && !(q.kind === EARTH && cells[y * WW + x] === WATER)) {
          var py = y - 1; while (py > 1 && cells[py * WW + x] !== EMPTY) py--;
          if (y - py < 6) { cells[py * WW + x] = q.kind; life[py * WW + x] = 90; }
          out = true;
        }
        if (out) S.parts.splice(i, 1);
      }
      /* the sand, near the screen: loose earth falls and piles (and sinks in water), water falls and spreads, steam rises and fades */
      S.cam = Math.max(0, Math.min(WW - W, Math.round(g.x - 64)));
      var x0 = Math.max(1, S.cam - 24), x1 = Math.min(WW - 1, S.cam + W + 24);
      for (y = H - 2; y > 0; y--) for (var xx = x0; xx < x1; xx++) {
        x = (y & 1) ? xx : x1 - 1 - (xx - x0); i = y * WW + x;
        var c = cells[i];
        if (c === EARTH || c === WATER) {
          var dir = Math.random() < 0.5 ? -1 : 1;
          if (cells[i + WW] === EMPTY || (c === EARTH && cells[i + WW] === WATER)) { cells[i] = cells[i + WW]; cells[i + WW] = c; }
          else if (cells[i + WW + dir] === EMPTY && cells[i + dir] === EMPTY) { cells[i] = EMPTY; cells[i + WW + dir] = c; }
          else if (c === WATER && cells[i + dir] === EMPTY) { cells[i] = EMPTY; cells[i + dir] = c; }
        } else if (c === STEAM) {
          if (life[i] > 0) life[i]--;
          if (life[i] === 0) cells[i] = EMPTY;
          else if (cells[i - WW] === EMPTY && Math.random() < 0.5) { cells[i] = EMPTY; cells[i - WW] = STEAM; life[i - WW] = life[i]; }
        }
      }
      /* the end of the cave, or the end of the golem: fade, and begin another */
      if (g.x > WW - 22 || g.hp <= 0) { S.fade = Math.min(1, S.fade + dt * 1.4); if (S.fade >= 1) reset(); }
    };
    var plot = function (px, py, r, g, b, e) { px = Math.round(px) - S.cam; py = Math.round(py); if (px >= 0 && py >= 0 && px < W && py < H) { buf[py * W + px] = pk(r, g, b); em[py * W + px] = e || EMON ? 1 : 0; } };
    var EMON = 0;   /* while set, everything plotted gives its own light (shots, the bolt) */
    var sprite = function (rows, cx, feet, flip, colour) {
      var w = rows[0].length, h = rows.length, ox = Math.round(cx) - (w >> 1), oy = Math.round(feet) - h;
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var ch = rows[y][flip ? w - 1 - x : x];
        if (ch === ".") continue;
        var c = colour(ch, y, h);
        plot(ox + x + (c.dx || 0), oy + y + (c.dy || 0), c[0], c[1], c[2], c.em);
      }
    };
    var draw = function () {
      var x, y, i, c, wx, cam = S.cam, o, k, col, far = cam >> 1;
      var isOpen = function (q) { return q === EMPTY || q === STEAM || q === WATER; };
      /* the cave, as the game draws it: strata of dusky rose and plum blended with an ordered dot pattern, a pale crust on
         every open face (brightest on top), faceted slate, a back wall with far pillars that move at half speed, lichen on
         the floors and roots under the roofs. Lit afterwards (see the lights below). */
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
        wx = x + cam; o = y * WW + wx; c = cells[o]; i = y * W + x; em[i] = 0;
        var up = y > 0 ? cells[o - WW] : ROCK, dn = y < H - 1 ? cells[o + WW] : ROCK, lf = wx > 0 ? cells[o - 1] : ROCK, rt = wx < WW - 1 ? cells[o + 1] : ROCK;
        if (c === EMPTY || c === STEAM) {
          var pil = Math.sin((x + far) / 19) * Math.sin((x + far) / 7 + 1.3) + Math.sin(y / 23 + (x + far) / 31), dk = pil > 0.55 ? 9 : pil > 0.3 && BAY[(y & 3) * 4 + (x & 3)] < 6 ? 9 : 0;
          col = [BGC[0] - dk, BGC[1] - dk * 0.8, BGC[2] - dk * 1.2];
          if (dn === DIRT && hash(wx, y + 68) < 0.42) col = [96 + hash(wx, 3) * 40, 150 + hash(wx, 4) * 30, 128];            /* lichen */
          else if (up === DIRT && hash(wx, 71) < 0.22) col = [70, 56, 52];                                                    /* a root */
          if (c === STEAM) col = [(col[0] + 204 * 2) / 3, (col[1] + 206 * 2) / 3, (col[2] + 230 * 2) / 3];
          buf[i] = pk(col[0], col[1], col[2]);
        } else if (c === DIRT) {
          var d = isOpen(up) || isOpen(dn) || isOpen(lf) || isOpen(rt) ? 1 : (y > 1 && isOpen(cells[o - 2 * WW])) || (y < H - 2 && isOpen(cells[o + 2 * WW])) || isOpen(cells[o - 2]) || isOpen(cells[o + 2]) || isOpen(cells[o - WW - 1]) || isOpen(cells[o - WW + 1]) || isOpen(cells[o + WW - 1]) || isOpen(cells[o + WW + 1]) ? 2 : 3;
          var bf = (y + Math.sin(wx / 17) * 3 + Math.sin(wx / 5.3) * 1.2) / 7, bi = Math.floor(bf), st = STRATA[((bf - bi) * 16 > BAY[(y & 3) * 4 + (wx & 3)] + 8 ? bi + 1 : bi) % 6];
          if (d === 1) col = isOpen(up) ? [CRUST[0] * 1.2 + 14, CRUST[1] * 1.18 + 12, CRUST[2] * 1.12 + 12] : CRUST;
          else if (d === 2) col = [(CRUST[0] + st[0]) / 2, (CRUST[1] + st[1]) / 2, (CRUST[2] + st[2]) / 2];
          else { col = hash(wx, y) < 0.06 ? [st[0] * 0.7, st[1] * 0.7, st[2] * 0.75] : st; em[i] = 2; }
          buf[i] = pk(Math.min(255, col[0]), Math.min(255, col[1]), Math.min(255, col[2]));
        } else if (c === ROCK) {
          var fa = hash((wx + (y >> 2)) >> 3, y >> 3), edge = isOpen(up) || isOpen(dn) || isOpen(lf) || isOpen(rt);
          col = hash(wx, y) < 0.07 ? [22, 24, 40] : [34 + 32 * fa, 40 + 36 * fa, 64 + 46 * fa];
          if (edge) col = [col[0] + 26, col[1] + 28, col[2] + 30]; else em[i] = 2;
          buf[i] = pk(col[0], col[1], col[2]);
        } else if (c === EARTH) { var ee = hash(wx, y) * 18; buf[i] = pk(172 + ee, 128 + ee, 118 + ee); }
        else {   /* water: a bright line along its top, the back wall showing faintly through */
          var top = up !== WATER, wv = hash(wx, y + Math.floor(S.t * 8)) < 0.08 ? 30 : 0;
          buf[i] = top ? pk(130, 180, 255) : pk(40 + wv, 84 + wv, 186);
        }
      }
      /* what stands in the cave: drawn over open back wall only, as the game's decor is */
      for (k = 0; k < decor.length; k++) {
        var dc = decor[k], dy2;
        if (dc.x < cam - 12 || dc.x > cam + W + 12) continue;
        if (dc.kind === "lamp") { for (dy2 = 1; dy2 <= 11; dy2++) plot(dc.x, dc.y - dy2, 84, 60, 48); plot(dc.x + 1, dc.y - 11, 84, 60, 48); plot(dc.x + 2, dc.y - 11, 84, 60, 48); for (dy2 = 0; dy2 < 3; dy2++) { plot(dc.x + 2, dc.y - 10 + dy2, 255, 214, 130, 1); plot(dc.x + 3, dc.y - 10 + dy2, 255, 190, 96, 1); } }
        else if (dc.kind === "stone") { for (dy2 = 1; dy2 <= 12; dy2++) for (var sx2 = -2; sx2 <= 2; sx2++) { if (dy2 === 12 && Math.abs(sx2) === 2) continue; plot(dc.x + sx2, dc.y - dy2, sx2 === -2 ? 150 : 112, sx2 === -2 ? 144 : 106, sx2 === -2 ? 176 : 140); } [[0, 9], [0, 8], [-1, 7], [1, 7], [0, 6], [0, 5], [0, 4]].forEach(function (q) { plot(dc.x + q[0], dc.y - q[1], 206, 176, 255, 1); }); for (sx2 = -4; sx2 <= 4; sx2++) plot(dc.x + sx2, dc.y, 96, 90, 122); }
        else { [[0, 0], [1, 0], [-1, 0], [0, -1], [0, 1], [1, 1], [2, 1], [-1, -1]].forEach(function (q, n) { plot(dc.x + q[0], dc.y + q[1], n % 3 ? 96 : 170, n % 3 ? 226 : 255, n % 3 ? 214 : 240, 1); }); }
      }
      /* dust in the air */
      if (!reducedMotion) for (k = 0; k < motes.length; k++) { var mo = motes[k]; mo.p += 0.02; mo.x += Math.sin(mo.p) * 0.05 + 0.02; mo.y += Math.cos(mo.p * 0.7) * 0.03; if (mo.x > W) mo.x -= W; var mi = Math.round(mo.y) * W + Math.round(mo.x); if (mi >= 0 && mi < buf.length && cells[Math.round(mo.y) * WW + Math.round(mo.x) + cam] === EMPTY && em[mi] === 0) buf[mi] = pk(150, 138, 176); }
      /* the creatures: white when hit, eyes bright while they warn */
      for (i = 0; i < S.foes.length; i++) {
        var f = S.foes[i];
        if (f.dead || f.x < cam - 12 || f.x > cam + W + 12) continue;
        (function (f) { var C = COL[f.kind], warn = f.st === "windup" && Math.sin(f.t * 40) > 0, fr = ART[f.kind], rows = fr[fr.length > 1 && (f.kind === "moth" || Math.abs(f.vx) > 4) ? Math.floor(S.t * (f.kind === "moth" ? 8 : 10)) & 1 : 0];
          sprite(rows, f.x, f.y + (f.kind === "crawler" && f.st === "windup" ? -1 : 0), f.face > 0 ? f.kind !== "slinger" : f.kind === "slinger", function (ch) { var q = (f.hurt > 0 ? [255, 246, 236] : ch === "e" && warn ? [255, 255, 255] : (ch === "w" || ch === "p") && warn ? [255, 240, 255] : C[ch]).slice(); q.em = ch === "e" || f.hurt > 0; return q; }); })(f);
      }
      /* the golem: it breathes, leans back from a cast, flashes when hurt; its two lights show the recipe */
      var g = S.golem, breathe = !reducedMotion && Math.sin(S.t * 2.4) > 0.5, e0 = ELRGB[S.queue[0]], e1 = ELRGB[S.queue[1] || S.queue[0]];
      sprite(GOLEM, g.x, g.y, false, function (ch, y, h) {
        var col = g.hurt > 0.35 ? [255, 246, 236] : ch === "L" ? (e0 || [58, 30, 34]) : ch === "R" ? (e1 || [58, 30, 34]) : ch === "c" ? (e0 ? [(e0[0] + e1[0]) >> 1, (e0[1] + e1[1]) >> 1, (e0[2] + e1[2]) >> 1] : STONE.s) : STONE[ch];
        col = col.slice(); col.em = g.hurt > 0.35 || ((ch === "L" || ch === "R" || ch === "c") && !!e0) || ch === "e";
        if (y < h - 3) { col.dy = breathe ? -1 : 0; if (S.recoil > 0 && y < h * 0.45) col.dx = -1; }
        return col;
      });
      /* shots, the bolt, particles, damage numbers */
      EMON = 1;
      for (i = 0; i < S.shots.length; i++) {
        var p = S.shots[i], k;
        if (p.kind === "fireball") { for (k = 1; k <= 5; k++) plot(p.x - p.vx * k * 0.006, p.y - p.vy * k * 0.006, 255, 150 - k * 16, 44); plot(p.x, p.y, 255, 245, 200); plot(p.x + 1, p.y, 255, 170, 70); plot(p.x, p.y + 1, 255, 170, 70); plot(p.x - 1, p.y, 255, 170, 70); plot(p.x, p.y - 1, 255, 170, 70); }
        else if (p.kind === "spear") { for (k = 0; k < 7; k++) plot(p.x - k, p.y, k < 2 ? 255 : 150, k < 2 ? 252 : 156, k < 2 ? 230 : 170); }
        else { plot(p.x, p.y, 200, 190, 180); plot(p.x + 1, p.y, 150, 143, 138); plot(p.x, p.y + 1, 150, 143, 138); }
      }
      if (S.bolt) { var B = S.bolt, n = 14, lx = B.x0, ly = B.y0; for (k = 1; k <= n; k++) { var tx = B.x0 + (B.x1 - B.x0) * k / n + (k < n ? (Math.random() - 0.5) * 5 : 0), ty = B.y0 + (B.y1 - B.y0) * k / n + (k < n ? (Math.random() - 0.5) * 5 : 0); for (var s2 = 0; s2 <= 4; s2++) plot(lx + (tx - lx) * s2 / 4, ly + (ty - ly) * s2 / 4, 255, 246, 190); lx = tx; ly = ty; } }
      EMON = 0;
      for (i = 0; i < S.parts.length; i++) { var q = S.parts[i]; if (q.kind === "fire") plot(q.x, q.y, 255, 150 + hash(i, 1) * 80, 50, 1); else if (q.kind === EARTH) plot(q.x, q.y, 184, 140, 128); else if (q.kind === WATER) plot(q.x, q.y, 90, 150, 240); else plot(q.x, q.y, 214, 216, 236); }
      /* the light, as in the game: the cave is dark but for what the golem, lanterns, crystal, the Lodestone and flames throw.
         Each light fades with distance; the inside of the ground stays darker than its lit faces; flames and eyes keep their own colour. */
      var LT = [[g.x, g.y - 8, 88, 1, 255, 236, 210]];
      for (k = 0; k < decor.length; k++) { var dl = decor[k]; if (dl.x < cam - 50 || dl.x > cam + W + 50) continue; if (dl.kind === "lamp") LT.push([dl.x + 2, dl.y - 9, 40, 0.85, 255, 196, 110]); else if (dl.kind === "stone") LT.push([dl.x, dl.y - 7, 26, 0.55, 190, 160, 255]); else LT.push([dl.x, dl.y, 17, 0.5, 110, 235, 222]); }
      for (k = 0; k < S.shots.length; k++) if (S.shots[k].kind === "fireball") LT.push([S.shots[k].x, S.shots[k].y, 30, 1, 255, 150, 60]);
      if (S.bolt) LT.push([S.bolt.x1, S.bolt.y1, 44, 1.1, 255, 246, 170]);
      for (k = 0; k < LT.length; k++) { LT[k][0] -= cam; LT[k][7] = LT[k][2] * LT[k][2]; }
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
        i = y * W + x; if (em[i] === 1) continue;
        var lr = 0.3, lg = 0.27, lb = 0.4;
        for (k = 0; k < LT.length; k++) { var q2 = LT[k], ddx = x - q2[0], ddy = y - q2[1], dd = ddx * ddx + ddy * ddy; if (dd < q2[7]) { var ff = 1 - Math.sqrt(dd) / q2[2]; ff = ff * ff * q2[3]; lr += ff * q2[4] / 255; lg += ff * q2[5] / 255; lb += ff * q2[6] / 255; } }
        if (em[i] === 2) { lr *= 0.62; lg *= 0.62; lb *= 0.66; }
        var u0 = buf[i], cr = (u0 & 255) * lr, cg = ((u0 >> 8) & 255) * lg, cb = ((u0 >> 16) & 255) * lb;
        buf[i] = pk(cr > 255 ? 255 : cr, cg > 255 ? 255 : cg, cb > 255 ? 255 : cb);
      }
      for (i = 0; i < S.nums.length; i++) { var nm = S.nums[i], str = String(nm.v), nx0 = nm.x - str.length * 2, ny0 = nm.y - nm.t * 12; for (k = 0; k < str.length; k++) { var gl = DIG[+str[k]]; for (var rr = 0; rr < 5; rr++) for (var cc = 0; cc < 3; cc++) if (gl[rr] >> (2 - cc) & 1) { if (nm.red) plot(nx0 + k * 4 + cc, ny0 + rr, 255, 110, 100); else plot(nx0 + k * 4 + cc, ny0 + rr, 140, 255, 150); } } }
      /* the golem's health, top left, as in the game's orb colour */
      for (x = 0; x < 34; x++) for (y = 0; y < 3; y++) buf[(4 + y) * W + 5 + x] = x === 0 || x === 33 ? pk(20, 16, 24) : x < 1 + 32 * Math.max(0, g.hp) / 100 ? pk(232, 90, 78) : pk(52, 46, 58);
      /* a flash and a fade, mixed into the picture */
      var veil = Math.max(S.fade, S.fadeIn), fl = S.flash > 0 ? Math.min(0.35, S.flash * 1.6) : 0;
      if (veil > 0 || fl > 0) for (i = 0; i < buf.length; i++) {
        var u = buf[i], r2 = u & 255, g2 = (u >> 8) & 255, b2 = (u >> 16) & 255;
        if (fl > 0) { r2 += (255 - r2) * fl; g2 += (230 - g2) * fl; b2 += (200 - b2) * fl; }
        if (veil > 0) { r2 += (13 - r2) * veil; g2 += (10 - g2) * veil; b2 += (20 - b2) * veil; }
        buf[i] = pk(r2, g2, b2);
      }
      ctx.putImageData(img, S.shake > 0 && !reducedMotion ? Math.round((Math.random() - 0.5) * 3) : 0, S.shake > 0 && !reducedMotion ? Math.round((Math.random() - 0.5) * 3) : 0);
      /* the sockets and the plate, only when they change */
      var sig = S.queue.join("+") + "|" + S.spell + "|" + S.gold;
      if (sig !== shown) {
        shown = sig;
        for (i = 0; i < sockets.length; i++) { var el = S.queue[i]; sockets[i].className = el ? "on" : ""; sockets[i].style.setProperty("--c", el ? EL[el] : "transparent"); }
        elSpell.textContent = S.spell || "Exploring"; elKind.textContent = S.kind || "the cave";
        csSlab.classList.toggle("cs-gold", !!S.gold);
      }
    };

    reset();
    if (reducedMotion) {
      /* a still frame: the first fight, a Fireball in the air */
      for (var guard = 0; guard < 1200 && !(S.shots.length && S.shots[0].kind === "fireball" && S.shots[0].x > S.golem.x + 24); guard++) step(1 / 60);
      S.fadeIn = 0; S.flash = 0; S.shake = 0;
      draw();
    } else if ("IntersectionObserver" in window) {
      var raf = null, last = 0, acc = 0;
      var frame = function (now) {
        acc += Math.min(0.1, (now - last) / 1000 || 0);
        last = now;
        while (acc >= 1 / 60) { step(1 / 60); acc -= 1 / 60; }
        draw();
        raf = requestAnimationFrame(frame);
      };
      draw();
      new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
          else if (!entry.isIntersecting && raf) { cancelAnimationFrame(raf); raf = null; }
        });
      }).observe(csSlab);
    } else {
      S.fadeIn = 0;
      draw();
    }
  }
  })();
})();
