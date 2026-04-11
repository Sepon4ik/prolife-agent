# Web Design 2026 — Editorial Marketing Sites for AI Agencies

## When to use

Use this skill **every time** Pavel works on a marketing/portfolio/agency website — including ORFEO site, ProLife marketing pages, future SaaS landings, client agency sites. This is the contract for "what good looks like" in 2026.

**Trigger keywords**: "сайт агенства", "лендинг", "marketing site", "ORFEO site", "редизайн сайта", "portfolio", "Astro", "agency landing".

**This skill is NOT for**: SaaS product UI (`code-quality-pavel-stack`), dashboards with high data density (`lead-ui-density`), or auth/billing flows.

---

## The core insight (read this first)

In **2026** the visual language for AI agencies has shifted decisively away from the **2022–2023 cliché** of:
- Dark backgrounds (#0a0a1a) + pink/cyan/blue gradient meshes
- Three.js torus/wave/blob hero
- Custom magnetic cursors
- Cinematic preloaders > 1.5s
- Scroll-jacked fullpage sections
- Linear/Vercel-style "AI startup" template

…toward **editorial restraint**: warm off-white or true dark monochrome, *one* serif display font + *one* sans body + *one* mono, single accent colour, motion concentrated in **3 places maximum**, and Lighthouse 95-100 as a signal of taste.

**The test**: if you remove all motion, the page should still be beautiful. If it isn't, the underlying typography/grid/colour is doing too little work and motion is hiding it. Fix the static layer first.

**Anthropic, OpenAI, Cognition, Sierra, Cohere, Studio Freight, Exo Ape, Immersive Garden** — all share this restraint code in 2026. Awwwards Agency of the Year 2025 (Immersive Garden) won with editorial serif + dual-tone + Lenis, not with WebGL spectacle.

---

## The stack — non-negotiable defaults

```
Astro 5
├── TypeScript strict (no any, no @ts-ignore)
├── Tailwind CSS v4
├── @astrojs/mdx           → case studies as .mdx files in src/content/
├── @astrojs/react         → React islands ONLY for interactive parts
├── @astrojs/sitemap
├── lenis                  → smooth scroll (one island, mounted at root)
├── gsap + ScrollTrigger   → text reveals, page transitions (one island)
├── three + @react-three/fiber → ONE showcase case study, lazy-loaded, NEVER on home hero
└── @vercel/og             → auto-generated OG images per page

Fonts: PP Editorial New (display) + Neue Montreal (body) + Geist Mono (code/labels)
       Free fallback: Fraunces (Google) + Inter Tight (Google) + JetBrains Mono

Host: Vercel or Cloudflare Pages
CMS:  start with MDX in repo. Move to Sanity ONLY when the count of cases > 15
      and a non-developer needs to edit content.
```

### Why Astro, not Next.js for this

| Criterion | Astro 5 | Next.js 15 |
|---|---|---|
| Marketing site | **★ ideal** | overkill |
| JS bundle | 0 KB by default (islands) | full React always loaded |
| Lighthouse out-of-the-box | 95-100 | requires tuning |
| Solo maintainability | **★** (MDX = "add a file") | more moving parts |
| Adding interactive bits later | React islands one-by-one | already React |
| Cost to host | $0 on Cloudflare Pages | $0 on Vercel hobby |

**Use Next.js only if** the site is part of an existing Next.js monorepo (e.g. ProLife marketing pages added to the SaaS app). Standalone agency site → always Astro.

### Why NOT vanilla HTML/JS

Pavel has been burned by this — `orfeo-site/index.html` reached **2716 lines**, no build, no types, no components, no reuse. **Never again.** A marketing site has at minimum: header, footer, hero, work grid, case study template, contact form. That is 6+ components. Without a component model, every change touches the master HTML file, and the file rots.

---

## Project structure (use this exact layout)

```
orfeo-site/
├── src/
│   ├── pages/
│   │   ├── index.astro              # home
│   │   ├── work/
│   │   │   ├── index.astro          # work index
│   │   │   └── [...slug].astro      # case template, reads from content/work
│   │   ├── about.astro
│   │   └── contact.astro
│   ├── content/
│   │   ├── config.ts                # zod schemas for collections
│   │   └── work/
│   │       ├── prolife.mdx
│   │       ├── roskos.mdx
│   │       └── ...                  # one file = one case
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.astro
│   │   │   ├── Footer.astro
│   │   │   └── BaseLayout.astro
│   │   ├── sections/
│   │   │   ├── Hero.astro
│   │   │   ├── WorkGrid.astro
│   │   │   ├── ServicesEditorial.astro
│   │   │   └── ContactCTA.astro
│   │   ├── ui/
│   │   │   ├── Link.astro           # animated underline link
│   │   │   ├── Marquee.astro
│   │   │   └── Button.astro
│   │   └── motion/                  # React islands ONLY
│   │       ├── LenisProvider.tsx    # mounted in BaseLayout, client:load
│   │       ├── RevealHeading.tsx    # SplitText reveal, client:visible
│   │       └── ThreeShowcase.tsx    # lazy, client:idle, in ONE case only
│   ├── styles/
│   │   ├── global.css               # Tailwind imports + reset
│   │   └── tokens.css               # CSS custom properties (colors, type, easings)
│   ├── lib/
│   │   ├── easings.ts               # cubic-bezier constants
│   │   └── motion.ts                # GSAP timeline factories
│   └── env.d.ts
├── public/
│   ├── fonts/                       # self-hosted .woff2
│   └── images/
├── astro.config.mjs
├── tailwind.config.ts
├── tsconfig.json                    # extends astro/tsconfigs/strict
└── package.json
```

**Rules**:
- One case study = one `.mdx` file in `src/content/work/`. Frontmatter has `title, client, year, role, cover, tags, summary`. Body is the long-form story.
- Server components are `.astro`. Interactive bits are `.tsx` and explicitly hydrated with `client:visible` / `client:idle` / `client:load`.
- **No island gets `client:load` unless it has to render before paint** (only Lenis).
- Tokens live in CSS custom properties, *not* Tailwind config. This way they cascade through Astro components without rebuilding.

---

## Visual language — three palettes to choose from

Pick **one** palette per project. Do not mix. The accent colour is single — never two accents.

### Palette A — Warm editorial (default for ORFEO)

```css
--bg:           #f6f4ef;  /* warm off-white, slightly cooler than cream */
--text:         #0a0a0a;
--text-muted:   #6b6864;
--border:       #e8e3d8;
--accent:       #d97757;  /* Anthropic terracotta — proven AI-trustworthy */
```

Use when: agency wants to read as "thoughtful, human, AI with judgment". Reference: anthropic.com.

### Palette B — Dark editorial (Immersive Garden)

```css
--bg:           #030303;
--text:         #e8e8e8;
--text-muted:   #87867f;
--border:       #1a1a1a;
--accent:       #ffffff;  /* yes, pure white as the only accent */
```

Use when: agency is showcasing visual/3D work and dark gallery feel matters. Reference: immersive-g.com, studiofreight.com (lime accent variant).

### Palette C — Mono with single bold accent (Studio Freight variant)

```css
--bg:           #ffffff;
--text:         #0a0a0a;
--text-muted:   #6b6864;
--border:       #ececec;
--accent:       #4160ff;  /* electric blue. Or #ff3b1d, or #00ff6a */
```

Use when: confidence project, fast load, single CTA flow. Reference: studiofreight.com, locomotive.ca.

**Forbidden**:
- Any gradient that is not a 2-stop with both stops within 5% lightness of each other
- Pink/cyan/blue rainbow combos
- More than ONE accent colour
- Glassmorphism (`backdrop-filter: blur` on coloured surfaces)
- Neon glow (`box-shadow` with bright colour)

---

## Typography — three pairs to choose from

Pair = display + body + mono. Pick one pair per project. Stick to it.

### Pair 1 — Editorial classic (default)

```
Display:  PP Editorial New        — Pangram Pangram (free trial license)
Body:     Neue Montreal           — Pangram (free trial)
Mono:     Geist Mono              — Vercel (open source)

Free fallback if license blocks:
Display:  Fraunces                — Google Fonts
Body:     Inter Tight             — Google Fonts
Mono:     JetBrains Mono          — Google Fonts
```

### Pair 2 — Swiss precision

```
Display:  GT America              — Grilli Type (paid)
Body:     GT America              — same family
Mono:     GT America Mono         — same family

Free fallback:
Display:  Inter Display           — Google Fonts
Body:     Inter                   — Google Fonts
Mono:     JetBrains Mono
```

### Pair 3 — Editorial bold

```
Display:  GT Alpina               — Grilli Type (paid)
Body:     Neue Montreal           — Pangram
Mono:     Diatype Mono            — ABC Dinamo (paid)

Free fallback:
Display:  Reckless                — paid alt: Crimson Pro free
Body:     Inter Tight
Mono:     JetBrains Mono
```

### Type scale (fluid)

```css
--type-h0:   clamp(4rem, 17vw, 22rem);   /* hero only */
--type-h1:   clamp(2.5rem, 8vw, 8rem);
--type-h2:   clamp(2rem, 5vw, 5rem);
--type-h3:   clamp(1.5rem, 3vw, 3rem);
--type-body: clamp(1rem, 1.1vw, 1.25rem);
--type-small:clamp(0.85rem, 0.9vw, 1rem);
--type-mono: clamp(0.75rem, 0.8vw, 0.9rem);
```

**Rules**:
- Self-host fonts in `public/fonts/`. Never load from Google CDN at runtime — it kills LCP.
- Subset to Latin + Cyrillic + numbers + punctuation. No CJK unless needed.
- `font-display: swap` always.
- Letter-spacing on H0/H1: `-0.03em` to `-0.05em` (tighter the bigger).
- Line-height on body: 1.5–1.6. On display: 0.9–1.05.

---

## Motion formula — three numbers, one easing, five points

This is the heart of "interactive but not overdone". Memorise it.

### Three durations only

```ts
// src/lib/motion.ts
export const DURATION = {
  hover:  0.25,  // 250ms — link underlines, button states
  reveal: 0.8,   // 800ms — heading reveal, image mask reveal
  scroll: 1.2,   // 1200ms — Lenis duration, page transition
} as const;
```

### One easing on everything

```ts
// src/lib/easings.ts
export const EASE = {
  // The only easing you need 90% of the time
  out:  'cubic-bezier(0.16, 1, 0.3, 1)',  // easeOutExpo
  // Optional softer alternative for hover micro-interactions
  soft: 'cubic-bezier(0.22, 1, 0.36, 1)', // easeOutQuint
} as const;
```

In GSAP this maps to `power3.out` or `power4.out`. Using one easing across the whole site is the single biggest "premium" lever — it creates a hidden coherence the visitor feels but cannot name.

### Five places where motion is allowed

1. **Heading mask reveal** on first paint (one per section, H1/H2 only)
   - SplitText word-by-word, stagger `0.06–0.1`, duration `0.8`, ease `out`
2. **Lenis smooth scroll** (one global island, duration `1.2`, default settings)
3. **Page transition** between routes (mask wipe or GSAP Flip, `0.6–0.9s`)
4. **Hover hairline underline** on links (`scaleX(0) → scaleX(1)`, duration `0.25`)
5. **One hero media slot** per page (single video or single WebGL canvas — never both, never grid of motion)

### Where motion is BANNED

Motion in any of these makes the site read as "too interactive" / cliché:

- Nav bar (does not shrink, fade, recolour, reposition on scroll)
- Body copy paragraphs (no fade-in, no slide)
- Footer
- Form inputs and labels
- Icons in UI chrome (only icons inside content cards may animate)
- Background gradients in motion ("floating blobs" — dead since 2024)
- Custom cursor (cliché 2023; Joffrey Spitzer, darkroom.engineering, 14islands all use native)
- Page loaders > 400ms (just don't have one)
- Parallax on body images (only on hero)
- Scroll-jacking / fullpage sections (Pavel has tried this, hates it)

If you find yourself adding motion to anything in the banned list, **stop and remove it**. The owner will perceive the result as "слишком интерактивно".

---

## The 12-question "too interactive?" checklist

Run through this list before declaring a site finished. Each YES is a problem.

1. Does the nav bar do anything when you scroll?
2. Is there a custom cursor?
3. Are there more than 5 reveal-on-scroll triggers per page?
4. Does any body paragraph fade in?
5. Are there moving gradients in the background?
6. Is there a preloader longer than 400ms?
7. Are there more than 3 different easing functions in the codebase?
8. Are there more than 3 different transition durations?
9. Does anything use `transform: scale()` greater than `1.05`?
10. Is the home hero a 3D object?
11. Are there parallax effects on more than 2 images?
12. Does the page hijack scroll (scroll-snap fullpage, locomotive snap)?

**0–1 YES** → restrained. **2–3 YES** → borderline. **4+** → too interactive, refactor.

---

## Reference sites — what to copy from each

| URL | Steal this |
|---|---|
| [anthropic.com](https://www.anthropic.com) | Warm cream `#faf9f0` + terracotta `#d97757`. Word-by-word reveal. AI-agency-appropriate restraint. |
| [immersive-g.com](https://immersive-g.com) | Dark editorial `#030303` / `#e8e8e8`. PSTimes serif. 12-col grid. Lenis integration. Awwwards Agency of the Year 2025. |
| [studiofreight.com](https://www.studiofreight.com) | Single bold accent on neutral. Neue Montreal + Messina Mono + GT Alpina trio. They authored Lenis. |
| [exoape.com](https://exoape.com) | 12-col grid with `2.22vw` gaps. H0 `17.36vw` desktop / `25.6vw` mobile. Lausanne in three weights only. |
| [joffreyspitzer.com](https://joffreyspitzer.com) | **The reference codebase** — Astro + GSAP + Lenis + GSAP Flip. Exactly the stack this skill prescribes. Codrops case study breaks down the code. |
| [darkroom.engineering](https://darkroom.engineering) | Lenis authors. "Invisible motion" reference. No custom cursor, no parallax, but feels alive. |

### The Codrops case study to read

**[Joffrey Spitzer Portfolio: Astro + GSAP minimalist build](https://tympanus.net/codrops/2026/02/18/joffrey-spitzer-portfolio-a-minimalist-astro-gsap-build-with-reveals-flip-transitions-and-subtle-motion/)**

This case study walks through code for the exact stack this skill prescribes. Read before starting any new agency site.

---

## Anti-pattern reference: what NOT to look like

| URL | Why anti-pattern for ORFEO |
|---|---|
| basement.studio | Maximalist 3D office scene. Beautiful, but only works at 6-figure budget + deep concept. As a solo, you cannot ship this and it will read as "trying". |
| Linear/Vercel homepage circa 2022 | Pink/cyan gradient + dark + Inter — the cliché Pavel was reproducing. Visually well-executed in its era, dead in 2026. |
| Most "AI startup" Webflow templates | Generic glass cards + neon accents + glow effects. Instant tell that the site was bought, not designed. |

---

## Pre-launch checklist

Before pushing to production, run through every item.

### Performance
- [ ] `pnpm astro build && pnpm astro preview` works locally
- [ ] Lighthouse desktop: Performance ≥ 95, A11y ≥ 95, BP ≥ 95, SEO ≥ 95
- [ ] Lighthouse mobile: Performance ≥ 90, others ≥ 95
- [ ] LCP < 2.0s, CLS < 0.05, INP < 200ms
- [ ] Largest JS island < 50 KB gzipped
- [ ] No font loaded from third-party CDN at runtime

### Accessibility
- [ ] All interactive elements keyboard reachable
- [ ] Focus states visible (not just `outline: none`)
- [ ] `prefers-reduced-motion: reduce` disables all GSAP timelines and Lenis
- [ ] Colour contrast AA on all text
- [ ] Headings in semantic order, no skipped levels
- [ ] All images have meaningful alt text or `alt=""` for decorative

### Motion sanity
- [ ] Run the 12-question checklist above. Score 0–1.
- [ ] All durations come from `DURATION` constants. No magic numbers in components.
- [ ] All easings come from `EASE` constants.
- [ ] No island uses `client:load` except `LenisProvider`.

### Content
- [ ] Every case study has cover image, summary, body, role, year
- [ ] OG image generated for every page
- [ ] Sitemap published at `/sitemap-index.xml`
- [ ] Robots.txt allows indexing of public pages

### Code quality
- [ ] `tsc --noEmit` passes (strict)
- [ ] No `any`, no `@ts-ignore`
- [ ] No commented-out code
- [ ] No file > 300 lines (split components)
- [ ] No inline styles except CSS custom properties

---

## Decision framework — which palette/font/stack for which project

| Project type | Palette | Type pair | Has 3D? |
|---|---|---|---|
| AI agency (ORFEO) | A warm editorial | Pair 1 editorial classic | One showcase case only |
| Creative studio | B dark editorial | Pair 3 editorial bold | Maybe — if signature work |
| SaaS marketing landing | C mono + bold accent | Pair 2 Swiss | No |
| Solo personal site | A or C | Pair 1 | No |
| Hardware/physical product | C with neutral accent | Pair 2 | Product render only |

---

## When to update this skill

Update this file when:
- A new motion technique proves itself across 2+ projects
- A specific palette/type combo gets shipped and validated
- A new tool replaces a recommended one (e.g. "Lenis 2 changes the API")
- An anti-pattern is rediscovered (e.g. "we tried adding nav scroll behaviour and it felt wrong again")

The skill is the cumulative memory of what worked. It exists so the next session does not re-derive the rules from scratch.

---

## Quick start command (for new agency site)

### Recommended: fork satus (validated 2026-04-08)

`darkroomengineering/satus` is the production-grade Next.js 16 starter Studio Freight uses for their own client work. It has CLAUDE.md, ARCHITECTURE.md, PATTERNS.md docs aimed at AI agents. Lenis + GSAP + Three.js + R3F + Theatre.js are pre-integrated. Always prefer it over hand-rolled Astro for agency/marketing sites unless Lighthouse 100 is a hard requirement.

```bash
cd ~/Documents/Claude/Projects
git clone https://github.com/darkroomengineering/satus.git <site-name>
cd <site-name>
rm -rf .git && git init
bun install                # requires Bun ≥ 1.3.5, Node ≥ 22
```

### Known landmines when forking satus on Mac with Next 16.2 (validated)

These bit me on the first orfeo-site-v2 setup. Fix before running `bun dev`.

1. **Turbopack PostCSS bridge can't load ESM-only plugins.** `@csstools/postcss-global-data` v4+ and `postcss-preset-env` v10+ are ESM-only. Turbopack errors with `require() of ES Module ... not supported`. **Fix**: in `lib/scripts/dev.ts` add `'--webpack'` to the `nextDevArgs` array, AND downgrade plugins:
   ```bash
   bun add -D postcss-preset-env@9.6.0 @csstools/postcss-global-data@2.1.0
   ```
   Webpack mode tolerates these versions. Remove the `--webpack` flag once Turbopack PostCSS host gains ESM support upstream.

2. **`themes.red` is hardcoded in `app/layout.tsx`** for `viewport.themeColor`. If you remove the `red` theme from `lib/styles/colors.ts`, the layout crashes with `Cannot read properties of undefined (reading 'primary')`. **Fix**: change `themes.red.primary` → `themes.<your-default-theme>.primary` in `app/layout.tsx`.

3. **`next/font/google` font subset/weight registry is stale.** Some fonts that exist on fonts.google.com are unknown to next/font, or have different available weights:
   - **Fraunces, Newsreader** — no `cyrillic` subset in next/font (only `latin`, `latin-ext`, `vietnamese`). Use **Lora**, **Cormorant Garamond**, or **Playfair Display** for Russian sites.
   - **Lora** — minimum weight is `400`, no `300`. Use `['400', '500', '600', '700']`.
   - Always check the error log for "Available subsets" / "Available weights" before guessing.

4. **`@tailwindcss/postcss` pulls in `lightningcss` which has native bindings.** Webpack mode handles this fine; Turbopack mode does not (yet). Same workaround as #1 applies.

5. **Footer crashes with `Element type is invalid`** because it imports `Logo from '@/components/ui/darkroom.svg'` via SVGR, and Next 16's SVGR webpack chain returns an object instead of a component. **Fix**: rewrite `components/layout/footer/index.tsx` to remove the SVG logo import — replace with text or your own brand. You're going to rewrite Footer anyway for your project.

6. **Theme component uses raw `<script>{...}</script>`** in `components/layout/theme/index.tsx` (line ~81) to set `data-theme` on `documentElement` before paint. React 19 / Next 16 forbid this — it errors with `Encountered a script tag while rendering React component. Scripts inside React components are never executed when rendering on the client.` **Fix**: replace with `dangerouslySetInnerHTML`:
   ```tsx
   <script
     dangerouslySetInnerHTML={{
       __html: `document.documentElement.setAttribute('data-theme', '${currentTheme}');`,
     }}
   />
   ```
   Add `// biome-ignore lint/security/noDangerouslySetInnerHtml` comment above it. This is the standard pattern for FOUC-prevention scripts in React 19+.

### Customization order (validated)

After `bun install` succeeds, do these in order:

1. `lib/styles/colors.ts` — define your themes (orfeo, orfeo-dark, etc). Keep `light` and `dark` for compat with starter sections.
2. `lib/styles/fonts.ts` — switch from their `localFont(...)` to `next/font/google` for instant setup. Self-host `localFont` later for production.
3. `lib/styles/typography.ts` — define h0, h1, h2, h3, body, small, mono type styles with mobile/desktop sizes.
4. `app/layout.tsx` — fix `themes.red.primary` reference (see landmine #2).
5. `app/page.tsx` — change `<Wrapper theme="dark">` to your default theme, remove unused starter section imports.
6. `app/(marketing)/_sections/hero/{index.tsx, hero.module.css}` — replace satus copy and styles with your hero.
7. `bun run setup:styles` — regenerates `lib/styles/css/root.css` AND `lib/styles/css/tailwind.css` from your TS configs. **Must run after every change to colors/fonts/typography.**
8. `bun dev` — boots in ~200ms, http://localhost:3000

### Astro fallback (use only if Lighthouse 100 is required)

```bash
pnpm create astro@latest <site-name> -- --template minimal --typescript strict --no-install --no-git
cd <site-name>
pnpm install
pnpm astro add tailwind mdx react sitemap vercel
pnpm add lenis gsap
```

Then copy the structure block from this skill into the project. Astro is the right choice when the site is purely content-driven, has no React product surface, and Lighthouse 100 matters more than developer ergonomics.

---

## Recommended libraries & repos (researched 2026-04-09)

### Animated UI Components (use as React islands in Astro)

| Repo | Stars | What to steal |
|---|---|---|
| **DavidHDev/react-bits** | 37k | 110+ components: aurora backgrounds, text reveal effects, gradient meshes. Copy-paste, not npm install. |
| **magicuidesign/magicui** | 20.6k | Shimmer buttons, animated gradients, blur-fade. shadcn-compatible, polished micro-interactions. |
| **aceternity/aceternity-ui** | 200+ | Spotlight, Background Beams, 3D Cards. Framer Motion based. Good for hero sections. |
| **ibelick/motion-primitives** | growing | Lower-level motion building blocks. Composable animation primitives. |

**Usage rule**: cherry-pick individual components as React islands (`client:visible`). Never install the full library — import only what you use.

### Animation engines

| Repo | Stars | Role in stack |
|---|---|---|
| **darkroomengineering/lenis** | 13.6k | Smooth scroll. Already in stack. One global island, `client:load`. |
| **greensock/gsap** | 20k | ScrollTrigger, SplitText, Flip. Already in stack. The motion engine. |
| **motiondivision/motion** | 30k+ | Framer Motion successor. Use for declarative animations in React islands where GSAP is overkill. |

### 3D / WebGL (use sparingly per motion rules)

| Repo | Stars | When to use |
|---|---|---|
| **pmndrs/react-three-fiber** | 28k+ | React renderer for Three.js. Use for ONE showcase case study, never on home hero. |
| **pmndrs/drei** | 8.5k+ | Helpers: Text3D, Float, PresentationControls. Saves time on R3F projects. |

**Reference repos to study** (don't fork, study the code):
- **brunosimon/my-room-in-3d** (3k) — Awwwards-winning 3D portfolio. GSAP + Three.js choreography reference.
- **adrianhajdin/iphone** (4k) — Apple iPhone site clone. Three.js + GSAP product page patterns.

### Cursor effects

| Repo | Stars | Verdict |
|---|---|---|
| **Cuberto/mouse-follower** | 2k+ | Agency-grade custom cursors on GSAP. **BUT** custom cursors are in the "banned" list above. Use only if a specific project requires it (NOT ORFEO). |

### Icons

| Repo | Stars | When to use |
|---|---|---|
| **tabler/tabler-icons** | 20.5k | 6000+ SVG icons. Largest free set. Use when heroicons lacks what you need. |
| **tailwindlabs/heroicons** | 23.4k | 300 SVG icons. Official Tailwind. Default choice. |
| **lipis/flag-icons** | 12k | Country flag SVGs. Use in ProLife for per-country lead visualization. |

### Tailwind component libraries (reference only)

| Repo | Stars | Role |
|---|---|---|
| **saadeghi/daisyui** | 40.7k | Tailwind components with theming. Study patterns, don't install wholesale. |
