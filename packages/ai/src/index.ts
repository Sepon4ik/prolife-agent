export { createAIClient, type AIClient } from "./client";
export { classifyCompany, type CompanyClassificationResult } from "./structured";
export { generateOutreachEmail } from "./prompts/outreach";
export { discoverContacts, type DiscoveredContact, type ContactDiscoveryResult } from "./prompts/contact-discovery";
export { generateHandoffSummary } from "./prompts/sales-handoff";
