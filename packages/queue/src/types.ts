// ── Typed events for ProLife ──

export type ProlifeEvents = {
  // Scraping pipeline
  "prolife/scrape.started": {
    data: {
      tenantId: string;
      jobId: string;
      sourceType: "exhibition" | "linkedin" | "google" | "website";
      sourceUrl: string;
      sourceName?: string;
    };
  };
  "prolife/scrape.company-found": {
    data: {
      tenantId: string;
      jobId: string;
      companyName: string;
      country: string;
      website?: string;
      sourceUrl: string;
    };
  };

  // Enrichment pipeline
  "prolife/enrich.started": {
    data: {
      tenantId: string;
      companyId: string;
    };
  };

  // Scoring
  "prolife/score.calculate": {
    data: {
      tenantId: string;
      companyId: string;
    };
  };

  // Outreach
  "prolife/outreach.send": {
    data: {
      tenantId: string;
      companyId: string;
      contactId: string;
      type: "initial" | "follow_up_1" | "follow_up_2" | "follow_up_3";
    };
  };
  "prolife/outreach.follow-up": {
    data: {
      tenantId: string;
      companyId: string;
    };
  };

  // Reply handling
  "prolife/reply.received": {
    data: {
      tenantId: string;
      companyId: string;
      emailId: string;
      replyBody: string;
    };
  };

  // Handoff to sales
  "prolife/sales.handoff": {
    data: {
      tenantId: string;
      companyId: string;
      salesDirectorId: string;
    };
  };
};
