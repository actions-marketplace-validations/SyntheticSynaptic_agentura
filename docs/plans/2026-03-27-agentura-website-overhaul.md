# Agentura Website Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild the `apps/web` landing page around clearer positioning, stronger demos, and a live browser playground while preserving the existing Agentura design tokens.

**Architecture:** The homepage becomes a lightweight shell that composes focused landing components. Client-only behavior is isolated to the PR widget, story rotator, architecture animation, count-up stats, custom cursor, and playground. A new `/api/playground` route handles live-or-mock evaluation logic on the server.

**Tech Stack:** Next.js 14 App Router, React 18, Tailwind/global CSS tokens, `zod`, native `fetch`.

---

### Task 1: Split landing page structure

**Files:**
- Create: `apps/web/src/components/landing/*.tsx`
- Modify: `apps/web/src/app/page.tsx`

**Steps:**
1. Replace the monolithic homepage component with a composed page shell.
2. Move section-specific markup into focused landing components.
3. Keep only page-level orchestration in `page.tsx`.

### Task 2: Refresh hero, nav, and stats

**Files:**
- Create: `apps/web/src/components/landing/HeroSection.tsx`
- Create: `apps/web/src/components/landing/StatsBar.tsx`
- Modify: `apps/web/src/app/globals.css`

**Steps:**
1. Update headline, subhead, body, CTA structure, and why-now banner.
2. Replace fabricated stats with honest claims.
3. Add staggered hero-word animation and scroll-triggered count-up behavior.

### Task 3: Improve PR widget and story mode

**Files:**
- Create: `apps/web/src/components/landing/PrGateWidget.tsx`
- Create: `apps/web/src/components/landing/StoryModeSection.tsx`

**Steps:**
1. Extend the PR widget with the new safety row, better replay affordance, and fail glow.
2. Add the Safety Drift scenario.
3. Implement hover-paused 6-second auto-rotation and tab progress indicators.

### Task 4: Add architecture section

**Files:**
- Create: `apps/web/src/components/landing/ArchitectureSection.tsx`

**Steps:**
1. Build an HTML/CSS diagram with a scroll-triggered animated flow dot.
2. Keep the layout compact on desktop and horizontally scrollable on smaller screens.

### Task 5: Add playground

**Files:**
- Create: `apps/web/src/components/landing/PlaygroundSection.tsx`
- Create: `apps/web/src/app/api/playground/route.ts`
- Modify: `apps/web/.env.example`

**Steps:**
1. Build the two-panel client UI with cooldown, loading states, error handling, and result actions.
2. Add a server route that validates input and performs live Anthropic calls when configured.
3. Return deterministic mock results when the key is not configured.
4. Gate the section with `NEXT_PUBLIC_SHOW_PLAYGROUND`.

### Task 6: Finish lower-page content

**Files:**
- Create: `apps/web/src/components/landing/ComparisonSection.tsx`
- Create: `apps/web/src/components/landing/OpenSourceSection.tsx`
- Create: `apps/web/src/components/landing/SocialProofStrip.tsx`
- Create: `apps/web/src/components/landing/SiteFooter.tsx`

**Steps:**
1. Expand the comparison table to 8 rows and 4 columns.
2. Refresh open-source copy and keep the terminal demo.
3. Add the market-category social-proof strip.
4. Update the footer links and copy.

### Task 7: Add shared interaction helpers

**Files:**
- Create: `apps/web/src/components/landing/CustomCursor.tsx`
- Create: `apps/web/src/components/landing/useCountUp.ts`
- Create: `apps/web/src/components/landing/useInView.ts`
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/app/globals.css`

**Steps:**
1. Add a custom cyan crosshair cursor for fine pointers.
2. Hide it over interactive controls and disable it on coarse pointers.
3. Wire the shared in-view helpers for count-up and section-triggered animations.

### Task 8: Validate and document

**Files:**
- Modify: `docs/Documentation.md`

**Steps:**
1. Run `pnpm --filter @agentura/web type-check`.
2. Run `pnpm --filter @agentura/web build`.
3. Run `pnpm run type-check`.
4. Append the required session block to `docs/Documentation.md`.
