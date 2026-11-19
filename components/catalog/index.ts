// The catalog's pieces: the list a catalog page is for, the building elevation, the
// "Where it stands" ledger on /playbooks, the filter controls (the pill tracks the list and
// /rules draw) and the list's filter box, with the data helper that feeds them. The
// components are pure, but ListSearch, a client component; getCatalog() reads the content
// folder (server only).
export { CatalogList, type ListGroup } from "./list";
export { ListSearch } from "./list-search";
export { BuildingElevation } from "./building-elevation";
export { Ledger } from "./ledger";
export {
  CatalogFilter,
  FilterCount,
  Segmented,
  SegmentedStyles,
  segmentRules,
  type FilterOption,
  type SegmentOption,
} from "./filter";
export { PerStructure } from "./row-parts";
export { titleKey, titleMatches, titleWords } from "./title-words";
export { URGENCIES, catalogFrom, getCatalog, kindCount, moreOutlined, pick, writtenByKind, type Urgency } from "./data";
