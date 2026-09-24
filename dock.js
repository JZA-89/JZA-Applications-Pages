/* JZA Applications — liquid glass dock (replaces nav.js)
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
    { path: "bananabomb/", label: "BananaBomb", slug: "bananabomb" },
    { path: "ghostdelta/", label: "GhostDelta", slug: "ghostdelta" },
    { path: "pointfoundry/", label: "PointFoundry", slug: "pointfoundry" },
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

    var measure = function () {
      links = Array.prototype.slice.call(dock.querySelectorAll("a"));
      centers = links.map(function (a) {
        return a.offsetLeft + a.offsetWidth / 2;
      });
    };

    var applyMagnify = function (clientX) {
      if (!links.length) measure();
      var x = clientX - dock.getBoundingClientRect().left;
      for (var i = 0; i < links.length; i++) {
        var distance = Math.abs(x - centers[i]);
        var falloff = Math.max(0, 1 - distance / 130);
        var scale = 1 + 0.45 * falloff * falloff;
        var lift = -10 * falloff * falloff;
        links[i].style.setProperty("--dock-scale", scale.toFixed(3));
        links[i].style.transform =
          "translateY(" + lift.toFixed(1) + "px) scale(" + scale.toFixed(3) + ")";
      }
    };

    var resetMagnify = function () {
      dock.classList.remove("magnify");
      for (var i = 0; i < links.length; i++) {
        links[i].style.transform = "";
        links[i].style.removeProperty("--dock-scale");
      }
    };

    dock.addEventListener("pointerenter", function (e) {
      measure();
      applyMagnify(e.clientX);
      /* let the entry ease finish, then track directly */
      setTimeout(function () {
        dock.classList.add("magnify");
      }, 200);
    });
    dock.addEventListener("pointermove", function (e) {
      applyMagnify(e.clientX);
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

  /* --- subpage scroll reveals: JS fallback for browsers without CSS
     scroll-driven animations (site.css handles the rest) --- */
  function setupSubpageReveals() {
    var supportsScrollTimeline =
      window.CSS && CSS.supports && CSS.supports("animation-timeline: view()");
    if (
      !document.body.getAttribute("data-app") ||
      supportsScrollTimeline ||
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
    Array.prototype.forEach.call(children, function (el) {
      /* only elements below the fold — nothing visible ever blinks out */
      if (el.getBoundingClientRect().top > window.innerHeight) {
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
