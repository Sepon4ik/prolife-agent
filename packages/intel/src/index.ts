export {
  aggregateNews,
  fetchGoogleNewsRSS,
  fetchGNewsAPI,
  fetchRSSFeed,
  getPharmaRSSFeeds,
  type RawNewsItem,
  type FeedHealth,
  type AggregateResult,
} from "./aggregator";

export {
  summarizeNewsItems,
  type ProcessedNewsItem,
} from "./summarizer";

export {
  matchEntitiesToCompanies,
  topicToQueries,
  normalizeCompanyName,
} from "./entity-matcher";

export {
  checkAlerts,
  sendAlertNotifications,
  type AlertMatch,
} from "./alerts";

export {
  extractArticleContent,
  extractImageOnly,
  findStockImage,
  isDefaultImage,
  translateToRussian,
  extractAndTranslateBatch,
  type ExtractedContent,
  type TranslationResult,
} from "./content-extractor";

// New data sources
export {
  fetchAllFDA,
  fetchFDAApprovals,
  fetchFDARecalls,
  fetchFDAShortages,
  fetchClinicalTrials,
  fetchPharmaDistributionTrials,
  fetchEMAMedicines,
  getEMARSSFeeds,
  fetchPharmaTradeFlows,
  fetchAllTargetMarketTrade,
  TARGET_MARKETS,
  PHARMA_HS_CODES,
} from "./sources";
