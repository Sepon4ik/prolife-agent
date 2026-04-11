import { serve } from "inngest/next";
import { inngest } from "@agency/queue";
import { scrapePipeline } from "@/inngest/functions/scrape-pipeline";
import { enrichCompany } from "@/inngest/functions/enrich-company";
import { scoreCompany } from "@/inngest/functions/score-company";
import { sendOutreach } from "@/inngest/functions/send-outreach";
import { followUp } from "@/inngest/functions/follow-up";
import { handleReply } from "@/inngest/functions/handle-reply";
import { salesHandoff } from "@/inngest/functions/sales-handoff";
import { newsCollect } from "@/inngest/functions/news-collect";
import { newsBackfillContent } from "@/inngest/functions/news-backfill";
import { newsEnrichCompanies } from "@/inngest/functions/news-enrich-companies";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    scrapePipeline,
    enrichCompany,
    scoreCompany,
    sendOutreach,
    followUp,
    handleReply,
    salesHandoff,
    newsCollect,
    newsBackfillContent,
    newsEnrichCompanies,
  ],
});
