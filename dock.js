/* JZA Applications — liquid glass dock
   Self-contained: derives the site root from its own <script> src so it
   works from any folder depth. Markup is injected; styles live in site.css. */
(function () {
  "use strict";

  var self =
    document.getElementById("jza-dock-script") ||
    (function () {
      var scripts = document.getElementsByTagName("script");
      for (var i = 0; i < scripts.length; i++) {
        if (/dock\.js(\?|$)/.test(scripts[i].src)) return scripts[i];
      }
      return null;
    })();
  if (!self) return;

  var root = self.src.replace(/dock\.js(\?.*)?$/, "");

  var items = [
    { path: "", label: "JZA Home", slug: "home" },
    { path: "powerglass/", label: "PowerGlass", slug: "powerglass" },
    { path: "pointfoundry/", label: "PointFoundry", slug: "pointfoundry" },
    { path: "ghostdelta/", label: "GhostDelta", slug: "ghostdelta" },
    { path: "bananabomb/", label: "BananaBomb", slug: "bananabomb" },
    { path: "bikespec/", label: "BikeSpec", slug: "bikespec" },
  ];

  var dock = document.createElement("nav");
  dock.className = "jza-dock";
  dock.setAttribute("aria-label", "JZA apps");

  var here = location.pathname.replace(/index\.html$/, "");

  items.forEach(function (item) {
    var a = document.createElement("a");
    a.href = root + item.path;
    a.setAttribute("data-label", item.label);
    a.setAttribute("aria-label", item.label);

    if (item.slug === "home") {
      var glyph = document.createElement("span");
      glyph.className = "jza-dock-glyph";
      glyph.textContent = "JZA";
      a.appendChild(glyph);
    } else {
      var img = document.createElement("img");
      img.src = root + "assets/icon-" + item.slug + ".png";
      img.alt = "";
      img.width = 52;
      img.height = 52;
      img.loading = "lazy";
      a.appendChild(img);
    }

    var target = a.href.replace(/index\.html$/, "");
    if (target === location.origin + here || target === here) {
      a.className = "active";
      a.setAttribute("aria-current", "page");
    }

    /* clicking the icon for the page you're already on scrolls back to
       the top instead of reloading — same feel as the macOS dock */
    a.addEventListener("click", function (e) {
      if (a.classList.contains("active")) {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
      }
    });

    dock.appendChild(a);
  });

  /* macOS-style magnification — fine pointers only, and never under
     prefers-reduced-motion. Touch users get plain, honest tap targets. */
  var finePointer = matchMedia("(pointer: fine)").matches;
  var reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (finePointer && !reducedMotion) {
    /* Distances are measured against untransformed layout positions
       (offsetLeft), never getBoundingClientRect of the scaled icons —
       measuring the thing you're transforming creates a jitter feedback
       loop. The CSS transition is also suspended while tracking (the
       .magnify class) so icons follow the pointer directly. */
    var links = [];
    var centers = [];
    var dockLeft = 0;
    var magnifyTimer = null;

    var measure = function () {
      links = Array.prototype.slice.call(dock.querySelectorAll("a"));
      /* cache the dock's left edge here — reading it per pointermove
         forces a layout every event */
      dockLeft = dock.getBoundingClientRect().left;
      centers = links.map(function (a) {
        return a.offsetLeft + a.offsetWidth / 2;
      });
    };

    var applyMagnify = function (clientX) {
      if (!links.length) measure();
      var x = clientX - dockLeft;
      for (var i = 0; i < links.length; i++) {
        var distance = Math.abs(x - centers[i]);
        var falloff = Math.max(0, 1 - distance / 130);
        var scale = 1 + 0.45 * falloff * falloff;
        var lift = -10 * falloff * falloff;
        /* custom properties only — the stylesheet owns the transform, so
           the :active press rule can still compose with magnification */
        links[i].style.setProperty("--dock-scale", scale.toFixed(3));
        links[i].style.setProperty("--dock-lift", lift.toFixed(1) + "px");
      }
    };

    var resetMagnify = function () {
      clearTimeout(magnifyTimer);
      magnifyTimer = null;
      dock.classList.remove("magnify");
      for (var i = 0; i < links.length; i++) {
        links[i].style.removeProperty("--dock-lift");
        links[i].style.removeProperty("--dock-scale");
      }
    };

    dock.addEventListener("pointerenter", function (e) {
      measure();
      applyMagnify(e.clientX);
      /* let the entry ease finish, then track directly */
      clearTimeout(magnifyTimer);
      magnifyTimer = setTimeout(function () {
        dock.classList.add("magnify");
      }, 200);
    });
    /* coalesce to one magnify pass per frame — high-report-rate mice
       deliver several pointermoves per frame and all but the last are
       wasted work */
    var magnifyX = 0;
    var magnifyRaf = null;
    dock.addEventListener("pointermove", function (e) {
      magnifyX = e.clientX;
      if (!magnifyRaf) {
        magnifyRaf = requestAnimationFrame(function () {
          magnifyRaf = null;
          applyMagnify(magnifyX);
        });
      }
    });
    dock.addEventListener("pointerleave", resetMagnify);
    window.addEventListener("resize", measure);
  }

  /* --- shrinking-title pill: appears once the page header scrolls away --- */
  function buildPill() {
    var slug = document.body.getAttribute("data-app");
    var pill = document.createElement("a");
    pill.className = "jza-toppill";
    pill.href = "#";
    pill.setAttribute("aria-label", "Back to top");

    if (slug) {
      var icon = document.createElement("img");
      icon.src = root + "assets/icon-" + slug + ".png";
      icon.alt = "";
      pill.appendChild(icon);
    } else {
      var glyph = document.createElement("span");
      glyph.className = "jza-pill-glyph";
      glyph.textContent = "JZA";
      pill.appendChild(glyph);
    }

    var label = "JZA Applications";
    for (var i = 0; i < items.length; i++) {
      if (items[i].slug === slug) label = items[i].label;
    }
    pill.appendChild(document.createTextNode(label));

    pill.addEventListener("click", function (e) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
    });

    /* On the home page wait until the hero is gone; on subpages just
       past the masthead. */
    var threshold = slug ? 220 : window.innerHeight * 0.72;
    var onScroll = function () {
      pill.classList.toggle("show", window.scrollY > threshold);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return pill;
  }

  /* --- subpage scroll reveals. Deliberately JS-only: CSS scroll-driven
     view() animations leave last-viewport content stuck mid-fade (it can
     never scroll far enough to finish its entry range), so every browser
     takes this IntersectionObserver path instead. --- */
  function setupSubpageReveals() {
    if (
      !document.body.getAttribute("data-app") ||
      reducedMotion ||
      !("IntersectionObserver" in window)
    ) {
      return;
    }
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    var children = document.querySelectorAll("main > *");
    /* read all positions first, then write classes — interleaving the
       two forces a layout recalculation per element */
    var tops = Array.prototype.map.call(children, function (el) {
      return el.getBoundingClientRect().top;
    });
    Array.prototype.forEach.call(children, function (el, i) {
      /* only elements below the fold — nothing visible ever blinks out */
      if (tops[i] > window.innerHeight) {
        el.classList.add("reveal");
        io.observe(el);
      }
    });
  }

  function mount() {
    document.body.appendChild(dock);
    document.body.appendChild(buildPill());
    setupSubpageReveals();
  }

  if (document.body) {
    mount();
  } else {
    document.addEventListener("DOMContentLoaded", mount);
  }
})();
