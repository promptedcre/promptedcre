import type { PropertyType, Review, Structure } from "./schemas/common";
import type { Phase, StepMode } from "./schemas/playbook";

export const STRUCTURE_LABEL: Record<Structure, string> = {
  syndication: "Syndication",
  fund: "Fund",
  jv: "JV",
};

export const PROPERTY_LABEL: Record<PropertyType, string> = {
  industrial: "Industrial",
  multifamily: "Multifamily",
  office: "Office",
  retail: "Retail",
};

export const PHASE_LABEL: Record<Phase, string> = {
  "stand-up": "Form",
  raise: "Raise",
  acquire: "Acquire",
  operate: "Operate",
  report: "Report",
  exit: "Exit",
};

// A review level said as what it is. Where a page shows "AI-drafted" for a record, it
// pairs it with the date the record's sources were checked (lastVerified).
export const REVIEW_LABEL: Record<Review, string> = {
  "ai-drafted": "AI-drafted",
  "practitioner-reviewed": "Practitioner-reviewed",
  "attorney-reviewed": "Attorney-reviewed",
};

export const MODE_LABEL: Record<StepMode, string> = {
  agent: "agent",
  "agent-browser": "agent · browser",
  "human-online": "human · online",
  "human-offline": "human · offline",
};

export const URGENCY_LABEL = {
  hours: "act within hours",
  days: "act within days",
  weeks: "act within weeks",
} as const;

export const JURISDICTION_LABEL = {
  "us-federal": "Federal",
  "us-tx": "Texas",
  "us-de": "Delaware",
} as const;
