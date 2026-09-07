// Shared floating navigation for all JZA Applications pages.
//
// Include once per page, just before </body>:
//   <script src="nav.js"    id="jza-nav-script"></script>   (root pages)
//   <script src="../nav.js" id="jza-nav-script"></script>   (app sub-pages)
//
// Everything — the link list, styling and behaviour — lives here, so the
// menu is maintained in exactly one place. The site root is derived from
// this script's own URL, so links resolve correctly regardless of how deep
// the current page sits or whether the site is served from a sub-path.

(function () {
    "use strict";

    // ── Work out the site root from this script's own resolved URL ──
    var self =
        document.getElementById("jza-nav-script") ||
        (function () {
            var scripts = document.getElementsByTagName("script");
            for (var i = 0; i < scripts.length; i++) {
                if (/nav\.js(\?|$)/.test(scripts[i].src)) return scripts[i];
            }
            return null;
        })();
    var root = self ? self.src.replace(/nav\.js(\?.*)?$/, "") : "";

    // ── The menu: Home, then every app (order mirrors the home page) ──
    // Each label is rendered in its own home-screen wordmark style.
    var apps = [
        { path: "bananabomb/",   html: '<span class="jza-app-bb">Banana<span class="b">Bomb</span></span> 🍌💣' },
        { path: "bikespec/",     html: '<span class="jza-app-bs">Bike<span class="s">Spec</span></span>' },
        { path: "ghostdelta/",   html: '<span class="jza-app-gd">GHOST<span class="d">DELTA</span></span>' },
        { path: "powerglass/",   html: '<span class="jza-app-pg">PowerGlass</span>' },
        { path: "pointfoundry/", html: '<span class="jza-app-pf">POINTFOUNDRY</span>' }
    ];

    // ── Styles — neutral translucent panel that reads on any page ──
    var css =
        ".jza-nav{position:fixed;top:12px;left:12px;z-index:1000;" +
        "font:14px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;}" +
        ".jza-nav summary{list-style:none;cursor:pointer;display:inline-flex;align-items:center;gap:8px;" +
        "padding:8px 13px;border-radius:11px;background:rgba(20,20,22,0.72);color:#fff;" +
        "border:1px solid rgba(255,255,255,0.16);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);" +
        "-webkit-user-select:none;user-select:none;box-shadow:0 4px 16px rgba(0,0,0,0.28);}" +
        ".jza-nav summary::-webkit-details-marker{display:none;}" +
        ".jza-nav summary:hover{background:rgba(34,34,38,0.86);}" +
        ".jza-nav-icon{font-size:15px;line-height:1;}" +
        ".jza-nav-label{font-weight:600;letter-spacing:0.04em;}" +
        ".jza-nav[open]{width:216px;}" +
        ".jza-nav[open] summary{display:flex;width:100%;box-sizing:border-box;border-radius:11px 11px 0 0;}" +
        ".jza-nav-panel{display:flex;flex-direction:column;width:216px;box-sizing:border-box;" +
        "background:rgba(18,18,20,0.94);border:1px solid rgba(255,255,255,0.16);border-top:none;" +
        "border-radius:0 0 11px 11px;overflow:hidden;-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);" +
        "box-shadow:0 12px 28px rgba(0,0,0,0.36);}" +
        ".jza-nav-panel a{padding:11px 16px;color:#e9e9ec;text-decoration:none;font-size:15px;" +
        "border-top:1px solid rgba(255,255,255,0.07);}" +
        ".jza-nav-panel a:first-child{border-top:none;}" +
        ".jza-nav-panel a:hover{background:rgba(255,255,255,0.09);}" +
        ".jza-nav-home{font-weight:600;letter-spacing:0.02em;}" +
        ".jza-nav-home .m{color:#FFD60A;}" +
        // Per-app wordmarks, mirroring the home page tiles
        ".jza-app-pf{font-family:ui-monospace,'SF Mono',SFMono-Regular,Menlo,monospace;font-weight:700;" +
        "letter-spacing:0.16em;display:inline-block;" +
        "background:linear-gradient(90deg,#FF401A,#FF8C1A,#FFD966,#4DD9B3,#008CFF);" +
        "-webkit-background-clip:text;background-clip:text;color:transparent;}" +
        ".jza-app-gd{font-family:ui-monospace,'SF Mono',SFMono-Regular,Menlo,monospace;font-weight:700;" +
        "letter-spacing:0.18em;color:#F0EFE9;}" +
        ".jza-app-gd .d{color:#FFD600;}" +
        ".jza-app-pg{font-family:ui-rounded,'SF Pro Rounded',-apple-system,BlinkMacSystemFont,sans-serif;" +
        "font-weight:700;display:inline-block;" +
        "background:linear-gradient(90deg,#FFBF00 0%,#FFBF00 12%,#FFCC00 40%,#34C759 62%,#32ADE6 88%,#32ADE6 100%);" +
        "-webkit-background-clip:text;background-clip:text;color:transparent;}" +
        ".jza-app-bb{font-weight:800;color:#fff;}" +
        ".jza-app-bb .b{color:#FFD60A;}" +
        ".jza-app-bs{font-weight:800;color:#fff;}" +
        ".jza-app-bs .s{color:#FF8A3D;}";
    var style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);

    // ── Build the menu (a native <details> — collapse/expand, no state) ──
    var details = document.createElement("details");
    details.className = "jza-nav";
    details.setAttribute("aria-label", "Site navigation");

    var summary = document.createElement("summary");
    summary.innerHTML =
        '<span class="jza-nav-icon" aria-hidden="true">&#9776;</span>' +
        '<span class="jza-nav-label">Menu</span>';
    details.appendChild(summary);

    var panel = document.createElement("div");
    panel.className = "jza-nav-panel";

    var home = document.createElement("a");
    home.className = "jza-nav-home";
    home.href = root;
    home.innerHTML = '<span class="m" aria-hidden="true">&#8962;</span> Home';
    panel.appendChild(home);

    apps.forEach(function (a) {
        var link = document.createElement("a");
        link.href = root + a.path;
        link.innerHTML = a.html;
        panel.appendChild(link);
    });

    details.appendChild(panel);

    function mount() {
        document.body.appendChild(details);
    }
    if (document.body) mount();
    else document.addEventListener("DOMContentLoaded", mount);

    // ── Collapse on outside click or Escape ──
    document.addEventListener("click", function (e) {
        if (details.open && !details.contains(e.target)) details.open = false;
    });
    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && details.open) details.open = false;
    });
})();
