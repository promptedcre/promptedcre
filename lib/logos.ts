// Every company icon the site draws, and where each one came from (decision D218).
//
// Each file is public/logos/<id>.png, 128 by 128, fetched from the company's own site and
// never redrawn, recolored or cropped. `from` is the address it was fetched from, `on` the
// day, `sha256` the hash of the file as served (__tests__/logos.test.ts checks it).
// `light`: dark ink on a clear ground, so it sits on a light tile. `low`: the site serves
// only a small icon. `maker`: a maker's mark stands in for the product.
//
// An id is a vendor's id in rankings/markets/*/vendors.json or a host's id in lib/hosts.ts.
// A vendor with no entry is drawn as a letter tile of ours; a government source as one
// neutral glyph of ours (a seal is never used). Generated 2026-11-17 from the icon kit's
// manifest; edit by hand only to add a fetched icon with all of its fields.

export type LogoEntry = {
  from: string;
  on: string;
  sha256: string;
  light: boolean;
  low: boolean;
  maker?: string;
};

export const LOGOS: Readonly<Record<string, LogoEntry>> = {
  "agora": { from: "https://agorareal.com/android-icon-192x192.png", on: "2026-11-15", sha256: "84696e29377862c8af20902bc476582f1e2afae73e8326d66c27d8bb41b05003", light: false, low: false },
  "appfolio-investment-manager": { from: "https://www.appfolio.com/_nuxt/icons/icon_512x512.4826b9.png", on: "2026-11-15", sha256: "6574cc3c0b826519b451e5f56654ef4b9a202c800748d4505ff921027d65dca2", light: false, low: false, maker: "the maker's mark (AppFolio)" },
  "archer": { from: "https://www.archer.re/hubfs/_theme_v2/assets/images/favicon-2.png", on: "2026-11-15", sha256: "9fa14c85beca40dceab65e5cae5ad9e37e085afe3ac59e4c263f2157aec6ba76", light: false, low: false },
  "argus-enterprise": { from: "https://www.altusgroup.com/favicon/Altus/apple-touch-icon.png", on: "2026-11-15", sha256: "da4f3628861b5e51fe507bc8ff58a1d1385c3f7bc5dfd49921dc0d9815aaa40b", light: false, low: false, maker: "the maker's mark (Altus Group)" },
  "attom": { from: "https://www.attomdata.com/wp-content/uploads/2021/05/cropped-favicon-1-192x192.png", on: "2026-11-15", sha256: "a97a6fadaa5132e005df9cd86925b83f274154f7eaa9551efad3c0c7d7f3ce65", light: false, low: false },
  "avestor": { from: "https://cdn.prod.website-files.com/69e1bfe97c77ce16186bc44e/6ae18f1b000a94b400641adb_logo.png", on: "2026-11-15", sha256: "cd99fb348f4d23e1f798102959a0c706ad808d52806138016f24c3596e7d1f83", light: false, low: false },
  "cactus": { from: "https://www.trycactus.com/icon.svg?icon.e92a1ba9.svg", on: "2026-11-15", sha256: "84e00460d29fc7f58943e1be9ef9c15845894fd95d03446d1052f7e4918250a9", light: false, low: false },
  "cash-flow-portal": { from: "https://www.cashflowportal.com/logo512.png", on: "2026-11-15", sha256: "0380f2a721c7aa5d82c7d0e2ff49a1df0927b109ca69af9bd586e6f616d8e6a2", light: false, low: false },
  "chatgpt": { from: "https://chatgpt.com/cdn/assets/favicon.6a33781f61.svg", on: "2026-11-15", sha256: "d4221b07945317c9d9e1c4a558d9357f58128450696cf1ef8a75fa3a64e770e3", light: true, low: false },
  "cherre": { from: "https://cherre.com/web-assets/img/favicon.png", on: "2026-11-15", sha256: "f29ef577f2e74619c56a0ebd3fad9145431f418306e88108686444f5a93062ee", light: true, low: true },
  "claude": { from: "https://claude.ai/apple-touch-icon.png", on: "2026-11-15", sha256: "a7514a1287a40ed8dc34d99e067cdc287bb4bbb5e644b891cfa6121ab979bb32", light: false, low: false },
  "claude-code": { from: "https://claude.com/icon.svg", on: "2026-11-15", sha256: "c0b7fca3f8b6b08f7208fc913ae0b1cde53f4c693f1f1de14012cba472f33fb1", light: false, low: false, maker: "the Claude mark; Claude Code has no icon of its own" },
  "clik-ai": { from: "https://clik.ai/favicon.ico", on: "2026-11-15", sha256: "1cb5ecff518302f0ef4651cd73786b77cb5a49609da448e5a0193afa1230630f", light: false, low: false },
  "codex": { from: "https://chatgpt.com/cdn/assets/favicon-c80e01a96037.svg", on: "2026-11-15", sha256: "d4221b07945317c9d9e1c4a558d9357f58128450696cf1ef8a75fa3a64e770e3", light: true, low: false, maker: "the maker's mark (OpenAI), the same as ChatGPT's" },
  "compstak": { from: "https://compstak.com/wp-content/themes/compstak/favicon.ico", on: "2026-11-15", sha256: "691e7cba3aa89591ccbd5cca80a810812c756ed3f1458ce7e681b309fb44ef85", light: true, low: false },
  "covercy": { from: "https://www.covercy.com/icon.png?icon.15nok-izdmc_3.png", on: "2026-11-15", sha256: "5281e5eb08dca09d2c1ba291e354b7d956aee62677aa40cae2e6f1d95dc4365d", light: false, low: false },
  "crexi": { from: "https://www.crexi.com/apple-touch-icon.png", on: "2026-11-15", sha256: "dc10ab2615b5cf2c948b5f0523f1b523db1af985d557499f1501e794d8bf47cd", light: false, low: false },
  "csc": { from: "https://www.cscglobal.com/service/templates/rebrand_reskin/favicon.ico", on: "2026-11-15", sha256: "65a10677a5ddc2f6323d9515bb169494d6037def30cd300c50258d030df93953", light: false, low: true },
  "dealpath": { from: "https://www.dealpath.com/wp-content/uploads/2025/01/cropped-favicon-192x192.png", on: "2026-11-15", sha256: "09b714e0c57f386396b24c14c30ea8ee7e01470ea3f5ea76aae1b5463b8cef20", light: false, low: false },
  "docusign": { from: "https://www.docusign.com/assets/images/android-chrome-192x192.png", on: "2026-11-15", sha256: "cd276b627ec30c6dced1ed64ed933e9379695d26153e367970c9a72f7f863bc8", light: false, low: false },
  "dropbox-sign": { from: "https://app.sign.dropbox.com/apple-touch-icon.png", on: "2026-11-15", sha256: "2c85fcafbdc92062e20b6fbce764874bde923af29a2f5a6301dd498c920adcda", light: false, low: false },
  "grok": { from: "https://grok.com/images/android-chrome-512x512.png", on: "2026-11-17", sha256: "c0306c84907a15f846c6394620e552b8a111b932b583617c0734f398df6e177f", light: false, low: false },
  "icapital-identity": { from: "https://app.parallelmarkets.com/favicon.svg", on: "2026-11-15", sha256: "17ca66f4eb0b07ce4c58be9eca49d3145cb30cc487d1ada6efd179e4ba6c503f", light: false, low: false, maker: "the product's former name's mark (Parallel Markets)" },
  "intellcre": { from: "https://intellcre.com/wp-content/uploads/2025/11/intell-fav-383x382.png", on: "2026-11-15", sha256: "3bdc571cca45ed41e0c66a938ddc753a290d5aaa1b0fe3c9c8128e00822339a1", light: false, low: false },
  "investnext": { from: "https://www.investnext.com/wp-content/uploads/2026/09/cropped-InvestNext-Site-Icon-512x512-1.png", on: "2026-11-15", sha256: "762d9e48274d9e95518a6163b33fdf6a853a955c6cb749bf4bb25350f7494648", light: false, low: false },
  "janover-connect": { from: "https://connect.janover.co/favicon.ico", on: "2026-11-15", sha256: "68d83f78e37670252f637cf67f6bdd9a3c0dcf17c9615eb3d18623a392029f82", light: true, low: false },
  "juniper-square": { from: "https://www.junipersquare.com/favicon.ico", on: "2026-11-15", sha256: "7b8275d1aede5056c7dc9d1b7a459481e6bc7cb64c2189f013205edfd0da3f6c", light: false, low: false },
  "keyway": { from: "https://cdn.prod.website-files.com/6733ce888871e13497cb4c8b/6807cff9c43c5712c229f4b4_webclip.png", on: "2026-11-15", sha256: "bfb51d0475bccc77d1963f062f52c047b21dc173622b7236f1375772cc9f1bb7", light: false, low: false },
  "legalzoom": { from: "https://legalzoomcdn.net/growth/favicon.ico", on: "2026-11-15", sha256: "6880117eae71b7f217eb273e45873f9031438241f6cf82dd563d859a07dbb775", light: false, low: false },
  "mercury": { from: "https://mercury.com/icon.svg?icon.2sq_8nnp61c03.svg", on: "2026-11-15", sha256: "9c72e15d555fd1fe34c98621615ac53a5e54dcb05fbb997169bab13d76d7bc00", light: true, low: false },
  "microsoft-excel": { from: "https://www.microsoft.com/favicon.ico", on: "2026-11-15", sha256: "9c10a02357e544f4b9ea9acf12d8936dfcfbe82aaf48958770960244ad12a28a", light: false, low: false, maker: "Microsoft's mark; the Excel page never loaded" },
  "muse": { from: "https://muse.ai/favicon.ico", on: "2026-11-17", sha256: "6992294e53e228f2af170d372680a40bff462a9b94b88c786b63d90f1319db00", light: false, low: false },
  "placer-ai": { from: "https://analytics.placer.ai/favicon/favicon-196x196.png?v=2", on: "2026-11-15", sha256: "285525100f3357662e228278d76b94eb6edb4193df7140431975fc9870fd26fd", light: false, low: false },
  "propertyreach": { from: "https://www.propertyreach.com/wp-content/uploads/2026/06/cropped-icon-192x192.png", on: "2026-11-15", sha256: "d632effaca2e12a8b7fe20a1940ddb7f6d62be471e1b2a6ea7260867f03b3a91", light: true, low: false },
  "quickbooks-online": { from: "https://quickbooks.intuit.com/cas/dam/IMAGE/A3A7IuZgd/apple-touch-icon-114x114.png", on: "2026-11-15", sha256: "64ef12af2140141367a0c4ebb46dc7624c37a426f4030df4816ae47499684aad", light: false, low: false },
  "realpage-ims": { from: "https://s.realpage.com/favicon.svg", on: "2026-11-15", sha256: "99b7d79059213552c7a5af71bb0f05643689c9c5897fe3e6f77fc87a4a53c0ba", light: false, low: false, maker: "the maker's mark (RealPage)" },
  "regrid": { from: "https://regrid.com/hubfs/REGRID_1024x1024_app_icon-11.png", on: "2026-11-15", sha256: "f2ed20fedf450a0352d5fc03dc176be9016a8b44ef134eec9ed72c29ea30351e", light: false, low: false },
  "relay": { from: "https://relayfi.com/favicon.ico?favicon.0op2460fdf10a.ico", on: "2026-11-15", sha256: "06db1db8205ddf7d7cd583a9be728e56817e21e6cc29b25e2862cf08d7377591", light: false, low: false },
  "reonomy": { from: "https://www.reonomy.com/favicon/reonomy/apple-touch-icon.png", on: "2026-11-15", sha256: "9aee2870197732b6ecb447dbf3c05a6ddc00686c1653abc0e30168a8996dab28", light: false, low: false },
  "rockport-val": { from: "https://www.therockportgroup.com/hubfs/Rockport-webclip-01.png", on: "2026-11-15", sha256: "dd80cd882e79760d1f4c095c38329b4f994809d55d009cc51753942e98cd0a71", light: false, low: false, maker: "the maker's mark (The Rockport Group)" },
  "sponsorcloud": { from: "https://cdn.prod.website-files.com/66ab81c82f92a04dbf9f3090/68c3c0de5b51d1693ad20811_faviconsc_256.png", on: "2026-11-15", sha256: "8022758c3c74465cb81ea51e611c9f75aace25271b8100234a81b6812ce67a01", light: false, low: false },
  "trepp": { from: "https://www.trepp.com/hubfs/favicon-1.png", on: "2026-11-15", sha256: "bfafc9abd7e5430e21220603397c80263a7d167a955e111f805bf0c527cd033c", light: false, low: true },
  "verifyinvestor": { from: "https://www.verifyinvestor.com/favicon.ico", on: "2026-11-15", sha256: "fb0735f55edf7d917162f9e71e76c9e4cb02600cdd00b713696a73b6bc233e17", light: false, low: true },
  "yardi-matrix": { from: "https://www.yardimatrix.com/wp-content/themes/cmw-yardi-matrix-theme/assets/images/favicon.ico?ver=0.2.10", on: "2026-11-15", sha256: "0f9c8f7b361bfe8b94a7a67a04c74e0eecc06c3b4c5844e5042b8ce503cffd0b", light: false, low: true },
  // Declared as the icon by zenbusiness.com's own page, served from the company's account on its image host (D225).
  "zenbusiness": { from: "https://res.cloudinary.com/zenbusiness/q_auto,w_192/v1/shared-assets/s2/logo/zb-mark-full-color.png", on: "2026-11-17", sha256: "98fb8ba0201383721310faa1180aa07bf109796f96f83706030e75977a878b05", light: false, low: false },
};

/** The served path of an id's icon, or null when there is none. */
export function logoSrc(id: string): string | null {
  return Object.hasOwn(LOGOS, id) ? `/logos/${id}.png` : null;
}

/** Two letters for a tile of ours: the first letters of two words, else the first two. */
export function logoLetters(name: string): string {
  const words = name.replace(/\(.*?\)/g, " ").split(/[^A-Za-z0-9]+/).filter(Boolean);
  const first = words[0] ?? "?";
  if (words.length >= 2) return `${first[0]}${words[1]?.[0] ?? ""}`.toUpperCase();
  return `${first[0]?.toUpperCase() ?? "?"}${first[1]?.toLowerCase() ?? ""}`;
}
