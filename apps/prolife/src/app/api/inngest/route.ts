import { serve } from "inngest/next";
import { inngest } from "@agency/queue";
import { scrapePipeline } from "@/inngest/functions/scrape-pipeline";
import { enrichCompany } from "@/inngest/functions/enrich-company";
import { scoreCompany } from "@/inngest/functions/score-company";
import { sendOutreach } from "@/inngest/functions/send-outreach";
import { followUp } from "@/inngest/functions/follow-up";
import { handleReply } from "@/inngest/functions/handle-reply";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    scrapePipeline,
    enrichCompany,
    scoreCompany,
    sendOutreach,
    followUp,
    handleReply,
  ],
});
