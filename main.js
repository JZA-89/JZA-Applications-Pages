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
     6. BananaBomb card feed — replica of the app's review deck: three
        stacked photo cards (scale 1/.9/.8 anchored top, blur 0/2/4),
        the front card gets a PEEL or BOMB stamp fading in with the
        drag, flies off fast with no rotation (like the app), and the
        header counters tick with a 150ms tint flash.
     ------------------------------------------------------------------ */
  var bbStage = document.getElementById("bb-stage");
  if (bbStage) {
    var bbCards = Array.prototype.slice.call(bbStage.querySelectorAll(".bb-card"));
    var bbKept = document.getElementById("bb-kept");
    var bbBombed = document.getElementById("bb-bombed");
    var bbKeepPill = document.querySelector(".bb-count.bb-keep");
    var bbBombPill = document.querySelector(".bb-count.bb-bomb");
    /* peel-heavy, like a real clean-out session */
    var BB_SCRIPT = ["peel", "bomb", "peel", "peel", "bomb", "peel", "bomb", "bomb"];

    var bbQueue = bbCards.slice();
    var bbAction = 0;
    var bbKeptN = 0;
    var bbBombedN = 0;
    var bbTimer = null;

    var bbLayout = function () {
      bbQueue.forEach(function (card, i) {
        card.style.zIndex = String(10 - i);
        if (i < 3) {
          card.style.opacity = "1";
          card.style.transform = "translateY(" + -26 * i + "px) scale(" + (1 - 0.1 * i) + ")";
          card.style.filter = i ? "blur(" + 2 * i + "px)" : "none";
        } else {
          card.style.opacity = "0";
          card.style.transform = "translateY(-52px) scale(0.8)";
          card.style.filter = "blur(4px)";
        }
      });
    };

    var bbFlash = function (pill) {
      pill.classList.add("flash");
      setTimeout(function () {
        pill.classList.remove("flash");
      }, 150);
    };

    var bbCycle = function () {
      var card = bbQueue[0];
      var action = BB_SCRIPT[bbAction % BB_SCRIPT.length];
      bbAction++;
      var dir = action === "peel" ? 1 : -1;
      var stamp = card.querySelector(".bb-stamp");
      stamp.className = "bb-stamp " + action;
      stamp.firstElementChild.textContent = action === "peel" ? "PEEL" : "BOMB";

      /* drag toward the decision — stamp opacity rides the drag */
      card.style.transform = "translate(" + dir * 46 + "px, 6px)";
      stamp.classList.add("show");

      bbTimer = setTimeout(function () {
        /* commit: fast straight fly-off, no rotation — the app's move.
           The card fades during flight so the recycle back into the
           deck happens while it's already invisible (desktop viewports
           are wide enough that the travel alone never leaves them). */
        card.style.transition = "transform 0.45s cubic-bezier(0.3, 0, 0.8, 1), opacity 0.32s ease-in";
        card.style.transform = "translate(" + dir * 560 + "px, 26px)";
        card.style.opacity = "0";
        if (action === "peel") {
          bbKept.textContent = String(++bbKeptN);
          bbFlash(bbKeepPill);
        } else {
          bbBombed.textContent = String(++bbBombedN);
          bbFlash(bbBombPill);
        }

        bbTimer = setTimeout(function () {
          /* recycle to the back of the deck without a visible hop */
          stamp.classList.remove("show");
          bbQueue.push(bbQueue.shift());
          card.style.transition = "none";
          card.style.opacity = "0";
          card.style.transform = "translateY(-52px) scale(0.8)";
          card.style.filter = "blur(4px)";
          void card.offsetWidth; /* flush so the reset isn't animated */
          card.style.transition = "";
          bbLayout();
          bbTimer = setTimeout(bbCycle, 1500);
        }, 480);
      }, 900);
    };

    bbLayout();
    if (!reducedMotion && "IntersectionObserver" in window) {
      var bbIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && !bbTimer) {
            bbTimer = setTimeout(bbCycle, 900);
          } else if (!entry.isIntersecting && bbTimer) {
            clearTimeout(bbTimer);
            bbTimer = null;
          }
        });
      });
      bbIO.observe(bbStage);
    }
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
          var ry = p[1] * pfCT - rz * pfST;
          var depth = p[1] * pfST + rz * pfCT + 3.1;
          var s = w * 0.35 * (2.4 / depth);
          var size = Math.max(1.5, w * 0.0052 * (2.4 / depth));
          pfCtx.fillRect(w / 2 + rx * s - size / 2, h / 2 + h * 0.13 - ry * s - size / 2, size, size);
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
        and the Usage History heat bars sharpen as each hour of the day
        is observed — the app's "the more you use it" learning story.
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
    var PG_SEED = "#3a3a3c";
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
    var PG_TOTAL = 84; /* sim hours per loop (3.5 days) */
    var PG_SPEED = 2.5; /* sim hours per real second */
    var PG_START = 7; /* the loop starts Friday 07:00 */
    var PG_DAYS = ["Sat", "Sun", "Mon", "Tue"];

    var pgT, pgLevel, pgCharging, pgPoints, pgSum, pgCnt, pgHourAcc, pgHourDirty, pgJitter, pgHold;

    var pgReset = function () {
      pgT = 0;
      pgLevel = 82;
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

    var pgAvgDrain = function () {
      var s = 0;
      var c = 0;
      for (var i = 0; i < 24; i++) {
        s += pgSum[i];
        c += pgCnt[i];
      }
      return c ? s / c : 3.2;
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
        pgPoints.push({ t: pgT, l: pgLevel });
      }
    };

    /* ---- battery history & forecast (640×220 canvas space) ---- */
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

      /* traced history: area fill then line, both anchored to height */
      if (pgPoints.length > 1) {
        var area = g.createLinearGradient(0, T + plotH, 0, T);
        area.addColorStop(0, "rgba(255, 159, 10, 0)");
        area.addColorStop(0.25, "rgba(255, 191, 0, 0.09)");
        area.addColorStop(0.5, "rgba(255, 214, 10, 0.18)");
        area.addColorStop(0.75, "rgba(48, 209, 88, 0.26)");
        area.addColorStop(1, "rgba(100, 210, 255, 0.35)");
        var line = g.createLinearGradient(0, T + plotH, 0, T);
        line.addColorStop(0, "#ff9f0a");
        line.addColorStop(0.25, "#ffbf00");
        line.addColorStop(0.5, "#ffd60a");
        line.addColorStop(0.75, "#30d158");
        line.addColorStop(1, "#64d2ff");

        g.beginPath();
        g.moveTo(x(pgPoints[0].t), y(pgPoints[0].l));
        for (var i = 1; i < pgPoints.length; i++) g.lineTo(x(pgPoints[i].t), y(pgPoints[i].l));
        var last = pgPoints[pgPoints.length - 1];
        g.save();
        g.lineTo(x(last.t), y(0));
        g.lineTo(x(pgPoints[0].t), y(0));
        g.closePath();
        g.fillStyle = area;
        g.fill();
        g.restore();

        g.beginPath();
        g.moveTo(x(pgPoints[0].t), y(pgPoints[0].l));
        for (var k = 1; k < pgPoints.length; k++) g.lineTo(x(pgPoints[k].t), y(pgPoints[k].l));
        g.strokeStyle = line;
        g.lineWidth = 4;
        g.lineJoin = "round";
        g.stroke();

        /* dashed forecast from now down the learned average to empty */
        var avg = pgAvgDrain();
        var hitT = pgT + pgLevel / avg;
        g.beginPath();
        g.moveTo(x(last.t), y(last.l));
        g.lineTo(x(Math.min(hitT, PG_TOTAL)), y(Math.max(0, last.l - avg * (Math.min(hitT, PG_TOTAL) - pgT))));
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
        var v = pgCnt[h] ? pgSum[h] / pgCnt[h] : 0;
        vals.push(v);
        if (v > maxV) maxV = v;
      }
      var top = maxV * 1.2; /* the app's 20% headroom */

      var slot = plotW / 24;
      for (var i = 0; i < 24; i++) {
        var bx = L + i * slot + slot * 0.08;
        var bw = slot * 0.84;
        /* unobserved hours show as grey seed stubs until learned */
        var val = vals[i] || maxV * 0.18;
        var bh = (val / top) * plotH;
        g.fillStyle = vals[i] ? pgRampAt(vals[i] / maxV, 1) : PG_SEED;
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

    var pgDrawDom = function () {
      var avg = pgAvgDrain();
      var hoursLeft = pgLevel / avg;
      pgHoursEl.textContent = hoursLeft < 0.5 ? "<1h" : Math.round(hoursLeft) + "h";
      pgHoursEl.style.color = pgUrgency(hoursLeft);
      pgAvgEl.textContent = avg.toFixed(2) + "%/hr";
      pgCapEl.textContent = Math.round(100 / avg) + "h";
      /* fill fraction = hours left / hours at 100 = level / 100 */
      pgBandEl.style.clipPath = "inset(0 " + (100 - pgLevel).toFixed(1) + "% 0 0 round 999px)";
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
      var pgFrame = function (ts) {
        if (pgLast !== null) {
          var dt = Math.min(0.1, (ts - pgLast) / 1000);
          if (pgHold > 0) {
            pgHold -= dt;
            if (pgHold <= 0) pgReset();
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
})();
