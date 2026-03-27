# Agentura Website Overhaul Design

**Date:** 2026-03-27
**Status:** Approved for implementation

## Goal

Refresh the `apps/web` landing page so it explains Agentura faster, feels more credible, and gives visitors a live hands-on proof point through a browser-based playground.

## Design Direction

Keep the existing dark, terminal-forward identity and token system, but make the page feel more like a precision instrument than a launch placeholder. The visual direction stays technical and high-signal: sharper copy, clearer section hierarchy, stronger amber/cyan guidance, and motion that reinforces flow and decision points instead of decorating them.

## Structural Decisions

1. Keep the page at `/`, but break the monolithic landing page into focused components under `apps/web/src/components/landing/`.
2. Preserve the current token palette and fonts.
3. Keep interactive behavior client-side only where needed:
   - PR gate widget
   - stats count-up
   - story auto-rotation
   - architecture diagram flow animation
   - custom cursor
   - playground
4. Keep the rest of the page mostly static/server-renderable to protect performance.

## Content Decisions

1. Tighten the hero to the direct category statement: "CI/CD FOR AI AGENTS".
2. Replace trust-eroding fabricated stats with honest claims.
3. Add the "Why now" strip to position Agentura in the independent open-source eval lane.
4. Expand story mode with a fourth enterprise/safety scenario.
5. Insert a new architecture section between story mode and demos.
6. Add a live playground that demonstrates baseline-vs-branch evaluation behavior.
7. Expand the comparison table to include BrainTrust / LangSmith.
8. Add a social-proof market strip above the footer.

## Playground Decision

The playground will call a new Next.js server route at `/api/playground`. When `ANTHROPIC_API_KEY` is configured, it will run live Anthropic requests. When it is not configured, it will return deterministic mock results shaped like real eval output so the UX still works locally and in partially configured environments.

This preserves the user-facing promise without exposing secrets and avoids a broken empty section when the API key is unavailable.

## Risk Notes

1. The landing page currently lives in a single client component, so the refactor must avoid regressions in layout and styling.
2. The playground should not degrade Lighthouse, so it will be lazy-loaded and independently client-hydrated.
3. The custom cursor must disable itself on coarse pointers and yield to default cursors on interactive elements.
