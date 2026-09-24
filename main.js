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
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view");
            revealer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
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
      floats.forEach(function (el) {
        var rect = el.getBoundingClientRect();
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
     5. GhostDelta timing tile — replica of the app's watchOS WatchCard
        behaviour: the stage clock ticks continuously, the delta stays
        an em-dash until the first mini-sector crossing and then only
        updates at crossings; minis colour on the hue ramp (purple only
        when both references are beaten); sector pills show live grey
        elapsed until their sector completes; on completion the card's
        accent bar crossfades yellow → purple (new PB) or grey. Time is
        accelerated (~13s per 4-minute stage) so visitors see a full run.
     ------------------------------------------------------------------ */
  var gdStage = document.getElementById("gd-watch");
  if (gdStage) {
    var timeEl = document.getElementById("gd-time");
    var deltaEl = document.getElementById("gd-delta");
    var gdCard = document.getElementById("gd-card");
    var gdPills = gdCard.querySelectorAll(".gd-pill");
    var gdMinis = gdCard.querySelectorAll(".gd-mini-group span");

    var ACCENT = "#FFD600";
    var PURPLE = "#A855F7";
    var PURPLE_TEXT = "#C084FC";
    var GREEN = "#36D96C";
    var MID = "#7AD936";
    var AMBER = "#D9BE36";
    var GREY_TEXT = "#8A8A82";
    var IDLE = "#3A3A38";
    var EMPTY_BG = "rgba(255, 255, 255, 0.04)";
    var PB_SECTORS = [82.5, 85.1, 84.9];

    var rgba = function (hex, a) {
      return (
        "rgba(" +
        parseInt(hex.slice(1, 3), 16) + ", " +
        parseInt(hex.slice(3, 5), 16) + ", " +
        parseInt(hex.slice(5, 7), 16) + ", " + a + ")"
      );
    };

    var stylePill = function (pill, tier, text) {
      pill.textContent = text;
      pill.style.color = tier === PURPLE ? PURPLE_TEXT : tier;
      pill.style.background = rgba(tier, tier === PURPLE ? 0.15 : 0.12);
      pill.style.borderColor = rgba(tier, tier === PURPLE ? 0.22 : 0.2);
    };

    var resetPill = function (pill, text) {
      pill.textContent = text;
      pill.style.color = "";
      pill.style.background = "";
      pill.style.borderColor = "";
    };

    var fmtClock = function (s) {
      var m = Math.floor(s / 60);
      var ss = Math.floor(s % 60);
      return (m < 10 ? "0" : "") + m + ":" + (ss < 10 ? "0" : "") + ss;
    };

    var fmtSector = function (s) {
      if (s < 60) return s.toFixed(1);
      var m = Math.floor(s / 60);
      var rest = s - m * 60;
      return m + ":" + (rest < 10 ? "0" : "") + rest.toFixed(1);
    };

    var showDelta = function (delta, crossed, finalPB) {
      if (!crossed) {
        deltaEl.textContent = "—";
        deltaEl.style.color = IDLE;
        return;
      }
      deltaEl.textContent = (delta <= 0 ? "" : "+") + delta.toFixed(1);
      deltaEl.style.color = finalPB ? PURPLE : delta <= 0 ? GREEN : GREY_TEXT;
    };

    if (reducedMotion || !("IntersectionObserver" in window)) {
      /* static completed snapshot */
      timeEl.textContent = "04:11";
      stylePill(gdPills[0], PURPLE, "1:21.9");
      stylePill(gdPills[1], GREEN, "1:24.8");
      stylePill(gdPills[2], GREEN, "1:24.3");
      Array.prototype.forEach.call(gdMinis, function (m, i) {
        m.style.background = i % 4 === 1 ? PURPLE : i % 3 === 2 ? MID : GREEN;
      });
      showDelta(-1.4, true, true);
      gdCard.style.setProperty("--gd-accent", PURPLE);
      gdCard.style.setProperty("--gd-accent-glow", rgba(PURPLE, 0.4));
    } else {
      var MINI_TICKS = 14; /* 100ms ticks per mini-sector */
      var miniIdx, tickInMini, delta, crossed, totalSim, secSim, secDur, secDelta, hold;
      var gdTimer = null;

      var gdReset = function () {
        miniIdx = 0;
        tickInMini = 0;
        delta = 0;
        secDelta = 0;
        crossed = false;
        totalSim = 0;
        secSim = 0;
        secDur = PB_SECTORS[0] + (Math.random() - 0.45) * 5;
        hold = 0;
        timeEl.textContent = "00:00";
        resetPill(gdPills[0], "--");
        resetPill(gdPills[1], "--");
        resetPill(gdPills[2], "--");
        Array.prototype.forEach.call(gdMinis, function (m) {
          m.style.background = EMPTY_BG;
        });
        gdMinis[0].style.background = ACCENT; /* currently-running mini */
        gdCard.style.setProperty("--gd-accent", ACCENT);
        gdCard.style.setProperty("--gd-accent-glow", rgba(ACCENT, 0.4));
        showDelta(0, false, false);
      };

      var gdTick = function () {
        if (hold > 0) {
          if (--hold === 0) gdReset();
          return;
        }
        var step = secDur / (3 * MINI_TICKS);
        secSim += step;
        totalSim += step;
        timeEl.textContent = fmtClock(totalSim);

        var sector = Math.floor(miniIdx / 3);
        gdPills[sector].textContent = fmtSector(secSim);

        if (++tickInMini < MINI_TICKS) return;
        tickInMini = 0;

        /* ---- mini-sector crossing ---- */
        var roll = Math.random();
        var tier = roll < 0.25 ? PURPLE : roll < 0.62 ? GREEN : roll < 0.85 ? MID : AMBER;
        var miniDelta =
          tier === PURPLE ? -(0.2 + Math.random() * 0.5)
          : tier === GREEN ? -(Math.random() * 0.2)
          : tier === MID ? Math.random() * 0.3
          : 0.3 + Math.random() * 0.5;
        gdMinis[miniIdx].style.background = tier;
        delta += miniDelta;
        secDelta += miniDelta;
        crossed = true;
        showDelta(delta, true, false);
        miniIdx++;

        if (miniIdx % 3 === 0) {
          /* sector complete: pill takes its time + tier colour */
          var secTier = secDelta < -0.35 ? PURPLE : secDelta <= 0 ? GREEN : secDelta < 0.5 ? MID : AMBER;
          stylePill(gdPills[sector], secTier, fmtSector(secSim));
          secSim = 0;
          secDelta = 0;
          if (miniIdx < 9) secDur = PB_SECTORS[miniIdx / 3] + (Math.random() - 0.45) * 5;
        }

        if (miniIdx === 9) {
          /* stage complete: accent crossfades yellow → purple (PB) or grey */
          var isPB = delta <= 0;
          gdCard.style.setProperty("--gd-accent", isPB ? PURPLE : GREY_TEXT);
          gdCard.style.setProperty("--gd-accent-glow", isPB ? rgba(PURPLE, 0.4) : "transparent");
          showDelta(delta, true, isPB);
          hold = 32; /* ~3.2s, then a fresh run */
        } else {
          gdMinis[miniIdx].style.background = ACCENT;
        }
      };

      gdReset();
      var gdIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && !gdTimer) {
            gdTimer = setInterval(gdTick, 100);
          } else if (!entry.isIntersecting && gdTimer) {
            clearInterval(gdTimer);
            gdTimer = null;
          }
        });
      });
      gdIO.observe(gdStage);
    }
  }

  /* ------------------------------------------------------------------
     6. Barry pose cycle in the BananaBomb chapter
     ------------------------------------------------------------------ */
  var stage = document.getElementById("barry-stage");
  if (stage) {
    var poses = stage.querySelectorAll(".barry-pose");
    if (poses.length > 1 && !reducedMotion && "IntersectionObserver" in window) {
      var current = 0;
      var barryTimer = null;
      var nextPose = function () {
        poses[current].classList.remove("active");
        current = (current + 1) % poses.length;
        poses[current].classList.add("active");
      };
      var barryWatch = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && !barryTimer) {
            barryTimer = setInterval(nextPose, 2400);
          } else if (!entry.isIntersecting && barryTimer) {
            clearInterval(barryTimer);
            barryTimer = null;
          }
        });
      });
      barryWatch.observe(stage);
    }
  }
})();
