// The record page's pieces. Server components unless noted; CopyFileButton, CopyTextButton,
// OpenAll, OpenTarget, PrintButton and StepTracker are client components. stepSoftwareFor
// (./software), which reads the rankings files, is left out of this barrel on purpose: import
// it from its file, on the server. PageStyles must be on any page that draws StepIndex,
// StepTracker, StepList (components/step-list.tsx), StepKey, PlanDrawing, SourceList,
// SoftwareLine or a RefLink, and FoldStyles once on any page that draws a RuleCard
// (components/rule-card.tsx).
export { PageStyles } from "./page-styles";
export { PlaybookHead } from "./playbook-head";
export { RecordActions } from "./file-actions";
export { SectionHead } from "./section-head";
export { StepKey } from "./step-key";
export { INDEX_ID, StepIndex, type PageSection } from "./step-index";
export { StepTracker } from "./step-tracker";
export { PlanDrawing } from "./plan-drawing";
export { KeyFacts } from "./key-facts";
export { BeforeAfterChain, type ChainRecord } from "./chain";
export { SourceList } from "./source-list";
export { SoftwareLine, type MarketTop, type RankedVendor } from "./software-line";
export { OutlineRecord } from "./outline-record";
export { RuleUsers, RuleUseNote } from "./rule-users";
export { FoldStyles } from "./fold";
export { CopyFileButton, CopyTextButton } from "./copy-file";
export { OpenAll, OpenTarget, PrintButton } from "./open-all";
