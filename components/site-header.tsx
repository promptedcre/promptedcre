import { nav, site } from "@/lib/site";
import { SearchPalette } from "./search-palette";
import { FOOTER_GROUPS } from "./site-footer";
import { HeaderPath, MenuBehavior, NavLink } from "./site-header-island";
import { Container } from "./ui/container";
import { cx } from "./ui/cx";
import { Icon } from "./ui/icon";
import { ThemeToggle } from "./ui/theme-toggle";
import { Wordmark } from "./ui/wordmark";

const MENU_ID = "site-menu";

// The pages the five sections leave out (Search and the plans have their own controls; the
// setup steps, /connect, are one of the pages this list holds).
const MORE = FOOTER_GROUPS.flatMap((g) => g.links).filter(
  (l) => l.href !== "/" && l.href !== "/search" && l.href !== "/plans" && !nav.some((n) => n.href === l.href),
);

// The header's own rules (prefix sh-), in the components layer so a utility on the same
// element still wins. Only what utilities cannot say:
//   - the current page, said one way in the bar: the text ink and a 2 px rule in the drafting
//     blue (never the agent's green) that sits on the header's own rule, like a tab on a sheet
//     index. A section's link carries it; so do the bar's controls (.sh-ctl: Search on /search,
//     "Connect your agent" on /plans, the menu button for a page only the menu holds). A
//     control keeps its own outline: the rule is the mark, never a border's hue. A filled
//     control on its own page is drawn outlined, so the page's one filled button is the page's
//     own (Free's "Set up your agent" on /plans). --sh-btn is the control's height, which
//     places the rule on the header's rule under it;
//   - in the menu the same rule sits under the current page's words, and along the bottom
//     edge of the menu's own Connect button;
//   - a section's link is as tall as the bar, so its focus ring is drawn round its words;
//   - the menu: its button swaps the menu icon for the close icon, its panel hangs under the
//     whole header, and it opens over --dur-2 (docs/MOTION.md, M6) and closes a quarter
//     faster, where the browser can transition a <details>.
const CSS = `@layer components {
.sh-link{position:relative;display:flex;align-items:center;height:100%;color:var(--text-muted);text-decoration:none;white-space:nowrap;transition:color var(--dur-1) var(--ease-out)}
.sh-link[aria-current="page"]{color:var(--text)}
.sh-link[aria-current="page"]::after{content:"";position:absolute;inset-inline:0;bottom:-1px;height:2px;background:var(--accent-strong)}
.sh-link:focus-visible{outline:0}
.sh-link:focus-visible>span{outline:var(--focus-ring);outline-offset:.375rem}
.sh-ctl{--sh-btn:2.75rem;position:relative}
.sh-ctl[aria-current="page"]::after{content:"";position:absolute;inset-inline:-1px;bottom:calc((var(--sh-btn) - var(--header-h))/2 - 2px);height:2px;background:var(--accent-strong)}
.sh-ctl.btn--secondary[aria-current="page"],.sh-cta.btn--secondary[aria-current="page"]{border-color:var(--line-bold)}
.sh-ctl.btn--primary[aria-current="page"],.sh-cta.btn--primary[aria-current="page"]{border-color:var(--line-bold);background-color:transparent;color:var(--text)}
.sh-ctl.btn--quiet[aria-current="page"]{border-color:transparent}
.sh-cta{position:relative}
.sh-cta[aria-current="page"]::after{content:"";position:absolute;inset-inline:-1px;bottom:-1px;height:2px;background:var(--accent-strong)}
.sh-row{display:flex;min-height:2.75rem;align-items:center;justify-content:space-between;gap:1rem;color:var(--text);text-decoration:none}
.sh-row[aria-current="page"],.sh-more[aria-current="page"]{text-decoration:underline;text-decoration-color:var(--accent-strong);text-decoration-thickness:2px;text-underline-offset:.4em}
.sh-more{display:inline-flex;min-height:2.75rem;align-items:center;gap:.5rem;color:var(--text-muted);text-decoration:none;white-space:nowrap;transition:color var(--dur-1) var(--ease-out)}
.sh-more[aria-current="page"]{color:var(--text)}
@media (hover:hover){
.sh-link:hover,.sh-more:hover{color:var(--text)}
.sh-ctl.btn--secondary[aria-current="page"]:hover,.sh-cta.btn--secondary[aria-current="page"]:hover{border-color:var(--text-faint)}
.sh-ctl.btn--primary[aria-current="page"]:hover,.sh-cta.btn--primary[aria-current="page"]:hover{border-color:var(--text-faint);background-color:var(--bg-tile)}
}
.sh-theme{display:none}
html.js .sh-theme{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-top:1rem;border-top:1px solid var(--line);padding-top:1rem}

.sh-menu[open]>summary{background-color:var(--bg-panel)}
.sh-menu>summary>.sh-x,.sh-menu[open]>summary>.sh-bars{display:none}
.sh-menu[open]>summary>.sh-x{display:inline-block}
.sh-panel{position:absolute;inset-inline:0;top:100%;max-height:calc(100dvh - var(--header-h));overflow-y:auto;overscroll-behavior:contain;border-bottom:1px solid var(--line-strong);background:var(--bg)}
@supports selector(::details-content){
.sh-menu::details-content{transition:content-visibility calc(var(--dur-2)*.75) allow-discrete}
.sh-menu[open]::details-content{transition-duration:var(--dur-2)}
.sh-panel{opacity:0;translate:0 -.5rem;transition:opacity calc(var(--dur-2)*.75) var(--ease-out),translate calc(var(--dur-2)*.75) var(--ease-out)}
.sh-menu[open]>.sh-panel{opacity:1;translate:0 0;transition-duration:var(--dur-2)}
@starting-style{.sh-menu[open]>.sh-panel{opacity:0;translate:0 -.5rem}}
}
@media (min-width:768px){
html.js .sh-theme{margin-top:0;border-top:0;border-left:1px solid var(--line);padding-top:0;padding-left:1.5rem}
.sh-ctl{--sh-btn:2rem}
.sh-menu:has(.sh-more[aria-current="page"])>summary{color:var(--text)}
.sh-menu:has(.sh-more[aria-current="page"])>summary::after{content:"";position:absolute;inset-inline:-1px;bottom:calc((var(--sh-btn) - var(--header-h))/2 - 2px);height:2px;background:var(--accent-strong)}
}
}`;

// The header: the wordmark, the five sections, Search, "Connect your agent" and the menu.
// One opaque bar with one 1 px rule under it. It is a server component: only the links'
// current state and the menu's closing run in the browser (components/site-header-island.tsx),
// and the search palette loads when it is first opened (components/search-palette.tsx).
//
// "Connect your agent" opens the plans (decision 121): Free's card leads on to the setup steps
// at /connect, which the menu lists with the other pages. It is outlined while the hosted
// connector is off (site.connectorLive), so the one path that is not switched on is never the
// brightest thing on a page; when the flag is on it is filled. On /plans it shows as the
// current page; on /connect the menu's own link does, the way it does for /run.
//
// The menu is a <details>, so it opens with scripts off, and it is there at every width.
// Under 768 px it holds everything: Search, the five sections, the other pages and Connect.
// From 768 px the bar shows the sections, so the menu holds only the pages they leave out
// (a recorded run, the rules, the documents ...), which keeps every page one step from the
// header. `sectionOf` maps a record page that lives under another section's path to that
// section; the layout builds it from the catalog.
export function SiteHeader({ sectionOf }: { sectionOf?: Readonly<Record<string, string>> }) {
  const connect = cx("btn btn--sm", site.connectorLive ? "btn--primary" : "btn--secondary");
  // On the narrowest phones the bar holds the wordmark and the menu; Connect is in the menu.
  const inBar = "hidden min-[360px]:inline-flex";
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg">
      <style href="site-header" precedence="default">
        {CSS}
      </style>
      <HeaderPath sectionOf={sectionOf}>
        <Container className="flex h-(--header-h) items-center gap-4 lg:gap-8">
          <Wordmark className="min-h-11 text-base min-[400px]:text-lg md:text-base lg:text-lg" />

          <nav aria-label="Main" className="hidden h-full md:block">
            <ul className="m-0 flex h-full list-none gap-4 p-0 lg:gap-6">
              {nav.map((item) => (
                <li key={item.href} className="h-full">
                  <NavLink href={item.href} className="sh-link type-label">
                    <span>{item.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          <div className="ml-auto flex items-center gap-1 md:gap-2">
            <NavLink
              href="/search"
              exact
              data-search-open=""
              aria-keyshortcuts="Control+K Meta+K"
              aria-label="Search"
              className="sh-ctl btn btn--quiet btn--sm hidden md:inline-flex"
            >
              <Icon name="search" />
              <span className="hidden lg:inline">Search</span>
            </NavLink>
            {/* The words shorten under 1280 px; the control's name does not. */}
            <NavLink href="/plans" exact aria-label="Connect your agent" className={cx("sh-ctl", connect, inBar)}>
              <span className="xl:hidden">Connect</span>
              <span className="hidden xl:inline">Connect your agent</span>
              <Icon name="arrow-right" className="hidden xl:inline-block" />
            </NavLink>

            <details id={MENU_ID} className="sh-menu">
              <summary aria-label="Menu" className="sh-ctl btn btn--quiet btn--sm w-11 px-0 md:w-8">
                <Icon name="menu" size={20} className="sh-bars" />
                <Icon name="close" size={20} className="sh-x" />
              </summary>
              <div className="sh-panel">
                <Container className="py-6 md:py-3">
                  <nav aria-label="Menu" className="md:flex md:items-center md:justify-end md:gap-8">
                    <div className="md:hidden">
                      <NavLink href="/search" exact data-search-open="" className="sh-row type-title-s border-b border-line">
                        <span className="inline-flex items-center gap-3">
                          <Icon name="search" size={20} className="text-faint" />
                          Search
                        </span>
                      </NavLink>
                      <ul className="m-0 list-none p-0">
                        {nav.map((item) => (
                          <li key={item.href} className="border-b border-line">
                            <NavLink href={item.href} className="sh-row type-title-s">
                              {item.label}
                              <Icon name="arrow-right" className="text-faint" />
                            </NavLink>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <p className="type-label m-0 mt-6 text-faint md:mt-0">More pages</p>
                    {/* From 768 px the pages wrap onto a second row whole, rather than word by word or past the edge. */}
                    <ul className="type-body-s m-0 grid list-none grid-cols-2 gap-x-6 p-0 md:flex md:min-w-0 md:flex-1 md:flex-wrap md:justify-end md:gap-x-8 md:gap-y-0">
                      {MORE.map((l) => (
                        <li key={l.href}>
                          <NavLink href={l.href} exact className="sh-more">
                            {l.label}
                          </NavLink>
                        </li>
                      ))}
                    </ul>
                    {/* The theme switch needs scripts, so its row is only drawn once they are known to be on. */}
                    <div className="sh-theme">
                      <p className="type-label m-0 text-faint">Theme</p>
                      <ThemeToggle />
                    </div>
                    <NavLink href="/plans" exact className={cx("sh-cta", connect, "mt-6 w-full md:hidden")}>
                      Connect your agent
                      <Icon name="arrow-right" />
                    </NavLink>
                  </nav>
                </Container>
              </div>
            </details>
          </div>
        </Container>
        <MenuBehavior menuId={MENU_ID} />
      </HeaderPath>
      <SearchPalette />
    </header>
  );
}
