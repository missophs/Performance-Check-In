# Performance Check-In

Performance Check-In is a human-led Slack app for private, two-way conversations between an approved manager and employee. It is a **limited pilot**, not an enterprise rollout.

## How it works

1. Choose an assigned colleague and the discussion areas you need.
2. Save answers in a private draft. The app offers suggested questions from a preset library.
3. Review the selected areas and send them together. Private manager notes stay private.
4. The recipient gets a Slack message, reads the submitted check-in, and responds by area.

## Optional AI Assist

With explicit consent, AI Assist can draft discussion questions, a summary, or proposed follow-up actions from one selected saved entry. A person edits and approves the draft before it is saved privately, then reviews and sends it separately. Private notes are excluded. Shared fields are sent to OpenAI only after consent. The app does not create performance ratings or make employment decisions. AI can make mistakes, so human fact-checking is required.

The three AI modes generated, were edited, approved, and submitted in a synthetic live pilot. Recipient-side AI follow-up and broader operational checks remain.

## Hosting and governance

Slack is the interface, Cloudflare hosts the app, and Supabase stores records with access rules. Today, access is limited to one approved pair in one Slack workspace. Before expansion, IT and privacy teams should own access and assignments, onboarding and offboarding, provider approval, retention, backups, audit needs, support, and AI usage and cost controls. Bulk roster upload and HRIS synchronization are future work.

## Repository contents

- [`app/`](app/) — Slack and Cloudflare source, Supabase migrations, and automated tests.
- [`presentations/`](presentations/) — editable PowerPoint overviews of the current pilot.

The local test suite passed **86 tests** on October 9, 2026. Deployment credentials, private operational notes, user records, and dependency folders are intentionally excluded from this public repository. See [`app/README.md`](app/README.md) for technical details.
