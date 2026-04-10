export {
  aggregateNews,
  fetchGoogleNewsRSS,
  fetchGNewsAPI,
  fetchRSSFeed,
  getPharmaRSSFeeds,
  type RawNewsItem,
} from "./aggregator";

export {
  summarizeNewsItems,
  type ProcessedNewsItem,
} from "./summarizer";

export {
  matchEntitiesToCompanies,
  topicToQueries,
} from "./entity-matcher";

export {
  checkAlerts,
  sendAlertNotifications,
  type AlertMatch,
} from "./alerts";
