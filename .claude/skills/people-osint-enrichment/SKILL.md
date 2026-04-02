# People OSINT & B2B Enrichment -- Technical Reference

> Legitimate B2B sales intelligence: finding decision makers at companies for partnership proposals.
> All methods use publicly available data. GDPR-compliant under legitimate interest (Art. 6(1)(f)).

---

## 1. COMMERCIAL PEOPLE SEARCH APIs

### 1.1 Apollo.io

**Best for:** All-in-one prospecting + enrichment. 275M+ contacts.

**Endpoint:** `POST https://api.apollo.io/api/v1/people/match`

**Request fields:**
```json
{
  "first_name": "string",
  "last_name": "string",
  "name": "string",
  "email": "string",
  "hashed_email": "string (MD5 or SHA-256)",
  "organization_name": "string",
  "domain": "string",
  "id": "string (Apollo ID)",
  "linkedin_url": "string",
  "reveal_personal_emails": false,
  "reveal_phone_number": false,
  "webhook_url": "string (required if reveal_phone_number=true)"
}
```

**Response data fields:**
- **Identity:** id, first_name, last_name, name, headline, title
- **Contact:** email, email_status, phone (via webhook)
- **Photo:** photo_url, logo_url
- **Social:** linkedin_url, twitter_url, github_url, facebook_url
- **Location:** city, state, country
- **Employment:** employment_history[] (org name, title, dates, is_current)
- **Organization:** full org object (industry, funding, tech stack, employee count)
- **Scoring:** is_likely_to_engage, intent_strength, seniority, departments

**Search endpoint (free, no credits):** `POST https://api.apollo.io/api/v1/mixed_people/search`

**Pricing (2026):**
| Plan | Monthly | Credits/mo | API Access |
|------|---------|------------|------------|
| Free | $0 | 100 | No |
| Basic | $59/user | 900 | Limited |
| Professional | $99/user | 1,200 | Full |
| Organization | $149/user | 2,400 | Full |

- Email reveal = 1 credit
- Phone reveal = 8 credits (total 9 for full contact)
- Additional credits = $0.20 each
- Credits do NOT roll over

**Code example (Node.js):**
```typescript
const enrichPerson = async (email: string) => {
  const res = await fetch('https://api.apollo.io/api/v1/people/match', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': process.env.APOLLO_API_KEY!,
    },
    body: JSON.stringify({ email }),
  });
  const data = await res.json();
  return data.person; // contains all fields above
};
```

---

### 1.2 People Data Labs (PDL)

**Best for:** Largest raw dataset (3B+ profiles). Developer-friendly API. Best data coverage.

**Endpoint:** `GET https://api.peopledatalabs.com/v5/person/enrich`

**Request parameters:**
| Parameter | Type | Notes |
|-----------|------|-------|
| `email` | string | Primary lookup key |
| `phone` | string | E.164 format |
| `profile` | URL | LinkedIn/social URL |
| `name` | string | Full name |
| `first_name` + `last_name` | string | Requires company/school/location too |
| `company` | string | Current/past employer |
| `school` | string | Education |
| `location` | string | City, State, Country |
| `lid` | string | LinkedIn numeric ID |
| `min_likelihood` | int 1-10 | Confidence threshold |
| `api_key` | string | Required |

**Response schema (key fields):**
```json
{
  "status": 200,
  "likelihood": 10,
  "data": {
    "id": "pdl_id",
    "full_name": "string",
    "first_name": "string",
    "last_name": "string",
    "gender": "string",
    "birth_year": "number",
    "linkedin_url": "string",
    "linkedin_id": "string",
    "facebook_url": "string",
    "twitter_url": "string",
    "github_url": "string",
    "work_email": "string",
    "personal_emails": ["string"],
    "mobile_phone": "string",
    "industry": "string",
    "job_title": "string",
    "job_title_role": "string",
    "job_title_levels": ["string"],
    "job_company_name": "string",
    "job_company_website": "string",
    "job_company_size": "string",
    "job_company_industry": "string",
    "job_company_linkedin_url": "string",
    "job_company_location_name": "string",
    "job_start_date": "string",
    "experience": [{ "company": {}, "title": {}, "start_date": "", "end_date": "" }],
    "education": [{ "school": {}, "degrees": [], "majors": [] }],
    "skills": ["string"],
    "interests": ["string"],
    "location_name": "string",
    "location_country": "string",
    "location_continent": "string",
    "phone_numbers": ["string"],
    "emails": [{ "address": "", "type": "professional|personal" }],
    "profiles": [{ "network": "", "url": "", "username": "" }]
  }
}
```

**Pricing (2026):**
| Plan | Monthly | Person Credits | Per Credit |
|------|---------|---------------|------------|
| Free | $0 | 100/mo | $0 |
| Pro | $98/mo ($940/yr) | 350/mo | ~$0.28 |
| Enterprise | Custom | Custom | Negotiable |

- 1 credit per successful match (404 = free)
- Rate limit: 100 req/min (free), 1,000 req/min (paid)
- SDKs: Python, Node.js, Ruby, Go, Rust

**Code example:**
```typescript
const pdlEnrich = async (email: string) => {
  const params = new URLSearchParams({
    api_key: process.env.PDL_API_KEY!,
    email,
    min_likelihood: '6',
  });
  const res = await fetch(
    `https://api.peopledatalabs.com/v5/person/enrich?${params}`
  );
  if (res.status === 404) return null; // no match, no charge
  return (await res.json()).data;
};
```

---

### 1.3 Lusha

**Best for:** Quick SDR lookups. Good phone number coverage. CRM integrations.

**Endpoint:** `POST https://api.lusha.com/person`

**Request:** Lookup by email, LinkedIn URL, full name + company, or domain.

**Response fields:** full_name, first_name, last_name, email_addresses[], phone_numbers[] (direct dials + mobile), company_name, title, location, linkedin_url, company object (industry, size, revenue, domain).

**Pricing (2026):**
| Plan | Monthly/user | Credits/yr | Notes |
|------|-------------|------------|-------|
| Free | $0 | 40/mo | Email only |
| Pro | $22.45 | 3,000/yr | Email + phone |
| Premium | $52.45 | 7,200/yr | + API access |

- 1 credit = email reveal
- 5 credits = phone number reveal

**Additional APIs:** Company API, Prospecting API (search by filters), Signals API (job changes, promotions, company growth).

---

### 1.4 RocketReach

**Best for:** Verified email + phone. 700M+ profiles. Bulk enrichment.

**Endpoint:** `GET https://api.rocketreach.co/api/v2/person/lookup`

**Lookup by:** email, LinkedIn URL, name + company.

**Response fields:** name, title, current_employer, city, region, country, emails[] (with type + confidence), phones[] (with type), linkedin_url, twitter_url, facebook_url, profile_pic, employment_history[], education[].

**Pricing (2026):**
| Plan | Annual | Lookups/yr | API Access |
|------|--------|------------|------------|
| Essentials | $396/yr ($33/mo) | 1,200 | No |
| Pro | $996/yr ($83/mo) | 3,600 | No |
| Ultimate | $2,484/yr ($207/mo) | 10,000 | Yes |
| Enterprise | From $6,000/yr | Custom | Yes |

---

### 1.5 FullContact

**Best for:** Identity resolution. Privacy-compliant enrichment. Social profile aggregation.

**Endpoint:** `POST https://api.fullcontact.com/v3/person.enrich`

**Request:** JSON body with `email`, `phone`, `profile` (social URL), or `maids` (mobile ad IDs).

**Response fields:** fullName, ageRange, gender, location (city, region, country), title, organization, bio, avatar (URL), website, socialProfiles[] (twitter, linkedin, facebook, etc.), emails[], phones[], education[], employment[].

**Pricing (2026):**
- Starts at $99/mo with 1,000 free matches
- Custom pricing beyond that
- Known for privacy-first approach (PrivacySafe)

---

### 1.6 Pipl (now enterprise-only)

**Best for:** Deep web person search. Fraud investigation. Maximum data depth.

**Endpoint:** `GET https://api.pipl.com/search/`

**Lookup by:** email, phone, username, full name, street address -- any combination.

**Response:** Full name, age/DOB, addresses[], phone_numbers[], email_addresses[], jobs[], educations[], social_profiles[], images[], usernames[], relationships[] (relatives/associates), tags[], sources[].

**Pricing (2026):**
- Enterprise only: $3,000 - $130,000/yr (avg ~$58K/yr)
- API: ~$0.10/query, $1,000/mo default spending limit
- No free tier. No self-serve signup.

---

### 1.7 Quick Comparison Table

| Provider | Database | Email | Phone | Photo | Social | Bio/Title | Price/lookup |
|----------|----------|-------|-------|-------|--------|-----------|-------------|
| Apollo | 275M | Yes | Yes | Yes | Yes | Yes | ~$0.20 |
| PDL | 3B+ | Yes | Yes | No | Yes | Yes | ~$0.28 |
| Lusha | 100M+ | Yes | Yes (good) | No | Limited | Yes | ~$0.10-0.50 |
| RocketReach | 700M | Yes | Yes | Yes | Yes | Yes | ~$0.25 |
| FullContact | 200M+ | Yes | Yes | Yes | Yes (best) | Yes | ~$0.10 |
| Pipl | 3B identities | Yes | Yes | Yes | Yes | Yes | ~$0.10 |

---

## 2. FREE / OPEN SOURCE OSINT TOOLS

### 2.1 Username Search

**Sherlock** -- https://github.com/sherlock-project/sherlock
```bash
pip install sherlock-project
sherlock username123
```
- Checks 400+ sites for username existence
- Fast, simple, CLI output
- Limited to username-only search

**Maigret** -- https://github.com/soxoj/maigret (fork of Sherlock)
```bash
pip install maigret
maigret username123 --timeout 10
```
- Checks 3,000+ sites (7x more than Sherlock)
- **Parses profile pages** to extract: full name, location, profile image, links to other accounts
- Auto-discovers linked usernames and runs recursive searches
- Generates HTML, PDF, JSON, XMind reports
- **Recommended over Sherlock for B2B use**

### 2.2 Email Investigation

**Holehe** -- https://github.com/megadose/holehe
```bash
pip install holehe
holehe target@email.com
```
- Checks if email is registered on 120+ sites (Twitter, Instagram, Spotify, etc.)
- Uses password reset functions -- does NOT alert the target
- Returns: site name, exists (bool), additional info (profile link sometimes)

**GHunt** -- https://github.com/mxrch/GHunt
```bash
pip install ghunt
ghunt email target@gmail.com
```
- Investigates Google accounts: name, profile photo, Google Maps reviews, Google Calendar events, YouTube channel, last profile edit date
- Works only with @gmail.com addresses

### 2.3 Reconnaissance Frameworks

**theHarvester** -- https://github.com/laramies/theHarvester
```bash
pip install theHarvester
theHarvester -d targetcompany.com -b all
```
- Gathers emails, subdomains, IPs, employee names from public sources
- Sources: Google, Bing, LinkedIn, Hunter, Shodan, DNSDumpster, etc.
- Best for: mapping all people associated with a company domain

**SpiderFoot** -- https://github.com/smicallef/spiderfoot
```bash
pip install spiderfoot
spiderfoot -s target@email.com -m sfp_email
```
- 200+ modules querying 100+ data sources
- Web GUI + CLI
- Auto-correlates findings (email -> domain -> company -> employees)
- Best for: automated broad reconnaissance

**Recon-ng** -- https://github.com/lanmaster53/recon-ng
```bash
pip install recon-ng
recon-ng
> marketplace install all
> modules load recon/contacts-contacts/mailtester
```
- Modular framework (like Metasploit for OSINT)
- Persistent workspace + database
- Good for: repeatable, scriptable recon workflows

**Maltego** -- https://www.maltego.com
- Visual graph-based OSINT analysis
- "Transforms" pull data from 100+ sources and visualize relationships
- Entities: Person, Email, Phone, Domain, Company, Social Profile
- Community edition: Free
- Professional: $6,600 (includes 20K credits/mo for commercial data)

### 2.4 Social Media Analysis

**Social Analyzer** -- https://github.com/qeeqbox/social-analyzer
- Checks 1,000+ social networks for profiles
- Extracts metadata, profile images, names
- API mode available for integration

---

## 3. SOCIAL MEDIA DATA ACCESS

### 3.1 LinkedIn

**Official API:** Restricted to certified partners (Marketing, Sales Navigator, Talent APIs). No general-purpose people lookup API.

**Legal alternatives for B2B:**
- **Evaboot** (Chrome extension for Sales Navigator): $9/mo + Sales Nav ($99/mo). Exports leads with emails.
- **Netrows API:** LinkedIn profile enrichment at EUR 0.005/request. 48+ endpoints.
- **Bright Data:** LinkedIn scraping API with legal compliance infrastructure.

**Legal status:** hiQ Labs v. LinkedIn (2022) -- scraping publicly visible data does not violate CFAA. BUT violating LinkedIn TOS can lead to account bans and civil action. LinkedIn sued Proxycurl in Jan 2026 (shut down Jul 2026).

**Best practice:** Use enrichment APIs (Apollo, PDL, RocketReach) that aggregate LinkedIn data legally, rather than scraping directly.

### 3.2 Twitter / X API v2

**Endpoint:** `GET https://api.twitter.com/2/users/by/username/:username`

**Default fields:** id, name, username

**Extended fields** (via `user.fields` param): created_at, description, entities, location, pinned_tweet_id, profile_image_url, protected, public_metrics (followers, following, tweet_count), url, verified, verified_type, withheld

**Pricing (2026):**
| Tier | Monthly | Tweets/mo | User lookups |
|------|---------|-----------|-------------|
| Free | $0 | 1,500 write | Very limited |
| Basic | $100 | 50K read | Yes |
| Pro | $5,000 | 1M read | Yes |
| Enterprise | Custom | 50M+ | Unlimited |

**Code example:**
```typescript
const getTwitterProfile = async (username: string) => {
  const res = await fetch(
    `https://api.twitter.com/2/users/by/username/${username}?user.fields=description,location,profile_image_url,public_metrics,url`,
    { headers: { Authorization: `Bearer ${process.env.TWITTER_BEARER_TOKEN}` } }
  );
  return (await res.json()).data;
};
```

### 3.3 Facebook Graph API

**Endpoint:** `GET https://graph.facebook.com/v22.0/{page_id}?fields=name,about,website,phone,emails,location`

**Access:** Requires app review + permissions: pages_read_engagement, Page Public Content Access.

**Business page fields:** name, about, description, website, phone, emails, location, fan_count, category, hours, single_line_address, link.

**Limitation:** No personal profile data access. Business pages only.

### 3.4 Instagram Graph API

**Endpoint:** `GET https://graph.facebook.com/v22.0/{ig_user_id}?fields=biography,name,profile_picture_url,website,followers_count,media_count`

**Business Discovery** (lookup other business accounts):
```
GET /{my_ig_user_id}?fields=business_discovery.username(targetuser){name,biography,website,profile_picture_url,followers_count}
```

**Access:** Business/Creator accounts only. Requires Facebook Login OAuth. 200 req/hr.

---

## 4. PHOTO FINDING METHODS

### 4.1 Gravatar API (free, by email)

**How it works:** Hash the email with SHA256, request avatar.

**Avatar URL:** `https://www.gravatar.com/avatar/{sha256_hash}?s=400&d=404`

**Profile endpoint:** `GET https://api.gravatar.com/v3/profiles/{sha256_hash}`

**Rate limits:** 100 req/hr (unauth), 1,000 req/hr (auth with Bearer token).

**Code example:**
```typescript
import { createHash } from 'crypto';

const getGravatarUrl = (email: string, size = 400): string => {
  const hash = createHash('sha256')
    .update(email.trim().toLowerCase())
    .digest('hex');
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=404`;
};

const getGravatarProfile = async (email: string) => {
  const hash = createHash('sha256')
    .update(email.trim().toLowerCase())
    .digest('hex');
  const res = await fetch(`https://api.gravatar.com/v3/profiles/${hash}`);
  if (!res.ok) return null;
  return res.json(); // { avatar_url, display_name, ... }
};
```

**d= parameter options:** 404 (return 404 if no image), mp (mystery person silhouette), identicon (generated geometric pattern), robohash (robot face).

### 4.2 Photo Cascade (best to worst reliability)

1. **Gravatar** -- free, instant, by email hash
2. **Apollo/FullContact** -- photo_url field in enrichment response
3. **LinkedIn** (via enrichment APIs) -- highest quality professional headshot
4. **Twitter/X API** -- profile_image_url field (append `_400x400` for full size)
5. **Google Image Search** -- `"FirstName LastName" "Company" headshot OR photo site:linkedin.com`
6. **Company website** -- `/about`, `/team`, `/leadership` pages
7. **Conference sites** -- speaker photo pages
8. **Press releases** -- often include headshots of quoted executives

### 4.3 Google Search Tricks for Photos

```
"John Smith" "Acme Corp" (headshot OR photo OR portrait) -stock
site:linkedin.com/in "John Smith" "Acme Corp"
site:crunchbase.com "John Smith"
"John Smith" site:twitter.com OR site:x.com
```

---

## 5. GOOGLE DORKING FOR B2B PROSPECTING

### Find people at a company:
```
site:linkedin.com/in "VP of Sales" "target company"
site:linkedin.com/in intitle:"CTO" "target company"
"@targetcompany.com" email
site:targetcompany.com/team OR site:targetcompany.com/about
```

### Find contact info:
```
"John Smith" "@targetcompany.com"
"John Smith" "target company" email OR phone OR contact
filetype:pdf site:targetcompany.com "directory" OR "team" OR "staff"
```

### Find executives:
```
"target company" (CEO OR "Chief Executive" OR founder) site:crunchbase.com
"target company" (CTO OR "VP Engineering") site:linkedin.com
```

---

## 6. ENRICHMENT WATERFALL -- BEST PRACTICE

### 6.1 What Is It?

Query multiple data providers in sequence. Stop as soon as verified data is found. Each provider fills gaps the previous one missed.

**Single-source match rate:** 40-60%
**Waterfall match rate:** 85-95%
**Cost reduction:** 40-60% (stops early, no wasted calls)

### 6.2 Recommended Cascade Order

**For EMAIL enrichment:**
1. Apollo.io (cheapest, good coverage) -- ~60% match
2. People Data Labs (largest dataset) -- catches +15-20%
3. RocketReach (verified emails) -- catches +5-10%
4. Lusha (good for European contacts) -- catches +3-5%
5. Hunter.io (email pattern + verification) -- validate all found emails

**For PHONE enrichment:**
1. Lusha (best direct dial coverage)
2. Apollo.io (phone via webhook)
3. RocketReach (phone numbers with type)
4. Cognism (strong in EMEA)

**For PHOTO enrichment:**
1. Gravatar (free, check first always)
2. FullContact (social profile photos)
3. Apollo (photo_url field)
4. Twitter API (profile_image_url)
5. Google Image search as fallback

### 6.3 Implementation Pattern

```typescript
interface EnrichmentResult {
  email?: string;
  phone?: string;
  photo_url?: string;
  title?: string;
  company?: string;
  linkedin_url?: string;
  source: string;
}

type EnrichmentProvider = {
  name: string;
  enrich: (input: PersonInput) => Promise<Partial<EnrichmentResult> | null>;
  costPerLookup: number;
};

const runWaterfall = async (
  input: PersonInput,
  providers: EnrichmentProvider[],
  requiredFields: (keyof EnrichmentResult)[]
): Promise<EnrichmentResult> => {
  const result: Partial<EnrichmentResult> = {};
  const sources: string[] = [];

  for (const provider of providers) {
    // Check if we already have all required fields
    const missingFields = requiredFields.filter((f) => !result[f]);
    if (missingFields.length === 0) break;

    try {
      const data = await provider.enrich(input);
      if (!data) continue;

      // Only fill in missing fields (don't overwrite)
      for (const field of missingFields) {
        if (data[field]) {
          result[field] = data[field];
          sources.push(`${field}:${provider.name}`);
        }
      }
    } catch (err) {
      console.warn(`Provider ${provider.name} failed:`, err);
      continue; // fall through to next provider
    }
  }

  return { ...result, source: sources.join(', ') } as EnrichmentResult;
};

// Usage:
const providers: EnrichmentProvider[] = [
  { name: 'apollo', enrich: apolloEnrich, costPerLookup: 0.20 },
  { name: 'pdl', enrich: pdlEnrich, costPerLookup: 0.28 },
  { name: 'rocketreach', enrich: rocketReachEnrich, costPerLookup: 0.25 },
  { name: 'lusha', enrich: lushaEnrich, costPerLookup: 0.10 },
];

const person = await runWaterfall(
  { email: 'john@company.com' },
  providers,
  ['email', 'phone', 'title', 'linkedin_url']
);
```

### 6.4 Cost Estimates

| Volume/mo | Single-source | Waterfall (3 providers) | Savings |
|-----------|--------------|------------------------|---------|
| 500 | $140 | $100 | 29% |
| 1,000 | $280 | $175 | 37% |
| 5,000 | $1,400 | $750 | 46% |
| 10,000 | $2,800 | $1,300 | 54% |

Average cost per enriched contact (waterfall): $0.12-0.35 for email, $0.58-1.15 for phone.

### 6.5 Field-Level Waterfall

Best practice: run SEPARATE cascades per field type rather than one generic waterfall.

```typescript
// Email waterfall
const email = await runFieldWaterfall(input, emailProviders, 'email');
// Phone waterfall (different provider order)
const phone = await runFieldWaterfall(input, phoneProviders, 'phone');
// Photo waterfall
const photo = await runFieldWaterfall(input, photoProviders, 'photo_url');
```

---

## 7. LEGAL & ETHICAL BOUNDARIES

### 7.1 GDPR Compliance for B2B

**Legal basis:** Legitimate Interest (Article 6(1)(f)) -- NOT consent.

**Three conditions for cold outreach:**
1. Message is relevant to their professional activity
2. You are transparent about your data source
3. You offer easy opt-out

**What qualifies as "publicly available":**
- LinkedIn public profiles
- Company website team/about pages
- Conference speaker pages
- Press releases / news articles
- Business registries
- Published articles / blog posts with author bios

**Data retention:** Max 3 years from collection or last contact (DPA recommendation).

**Documentation required:**
- How you acquired each contact's data
- Your legal basis (legitimate interest)
- Purpose of outreach and relevance
- How you honor opt-out requests

### 7.2 What to AVOID

- Scraping private/gated LinkedIn data (behind login walls)
- Creating fake accounts to access data
- Collecting personal (non-business) data without consent
- Ignoring opt-out / unsubscribe requests
- Collecting data on individuals (not B2B professionals)
- Storing data indefinitely without purpose
- Reselling scraped personal data
- Bypassing technical access restrictions (CAPTCHAs, rate limits)

### 7.3 Safe Practices

- Use legitimate enrichment APIs (Apollo, PDL, Lusha) -- they handle compliance
- Always include unsubscribe mechanism in outreach
- Delete data for anyone who opts out within 30 days
- Document your legitimate interest assessment
- Only collect data necessary for your stated purpose
- Re-enrich periodically (data decays ~30%/year)
- Never mix B2B prospecting data with consumer marketing data

---

## 8. COMPLETE ENRICHMENT RECIPE

Given a target company domain, here is the full sequence to find and enrich decision makers:

```
1. INPUT: company domain (e.g., "targetcompany.com")

2. FIND PEOPLE:
   Apollo Search API (free, no credits) -> list of employees with titles
   OR: Google dorking: site:linkedin.com/in "target company" "VP" OR "Director" OR "Head"
   OR: theHarvester -d targetcompany.com -b all -> emails + names

3. ENRICH EACH PERSON (waterfall):
   a) Apollo enrichment -> email, title, LinkedIn, photo
   b) PDL enrichment -> fill gaps (phone, social profiles, education)
   c) Lusha -> phone number (best coverage)
   d) Gravatar -> free photo check
   e) Twitter API -> social presence + photo

4. VERIFY:
   - Email: use Hunter.io or ZeroBounce to verify deliverability
   - Phone: use Lusha verification or manual check
   - Data freshness: check job title is current (LinkedIn profile date)

5. SCORE & PRIORITIZE:
   - Match against ICP (company size, industry, role)
   - Apollo intent signals if available
   - Recent job change = higher response rate

6. OUTPUT: enriched contact record ready for outreach
```

---

## Sources

- [Apollo API Docs](https://docs.apollo.io/)
- [People Data Labs API Docs](https://docs.peopledatalabs.com/)
- [Lusha API Docs](https://docs.lusha.com/)
- [RocketReach API](https://docs.rocketreach.co/)
- [FullContact Developer Portal](https://www.fullcontact.com/developer-portal/)
- [Gravatar REST API](https://docs.gravatar.com/rest-api/)
- [X/Twitter API Docs](https://docs.x.com/)
- [Sherlock](https://github.com/sherlock-project/sherlock)
- [Maigret](https://github.com/soxoj/maigret)
- [Holehe](https://github.com/megadose/holehe)
- [GHunt](https://github.com/mxrch/GHunt)
- [SpiderFoot](https://github.com/smicallef/spiderfoot)
- [theHarvester](https://github.com/laramies/theHarvester)
- [Recon-ng](https://github.com/lanmaster53/recon-ng)
- [Maltego](https://www.maltego.com/)
