# Performance Check-In app

This directory contains the Slack app, Cloudflare Worker entry point, Supabase database changes, and automated tests for the Performance Check-In pilot.

## What the pilot does

An approved manager and employee prepare a check-in in Slack. Either person can save a private draft, review selected areas, send the check-in, and respond to each area. The recipient gets a Slack message when an entry is submitted. Manager-only notes are separate and cannot be sent.

The app also offers a preset library of discussion questions. Optional AI Assist can generate up to three questions, draft a summary, or propose follow-up actions from one selected saved entry. Generation requires explicit consent to send that entry's shared fields to OpenAI. The person edits and approves the result before it becomes a private draft; a separate review and send step is required to share it. Private notes and private review drafts are excluded. AI output can be wrong, so people must verify it. The app does not generate performance ratings or make employment decisions.

## What runs where

- Slack provides the interface and delivery notifications.
- The Cloudflare Worker in `src/worker.js` receives signed Slack requests. `src/index.js` is the earlier local Socket Mode entry point.
- Supabase stores drafts, submissions, responses, relationship records, and audit events. The SQL files in `supabase/` are ordered migrations; the Edge Function in `supabase/functions/` verifies Slack identities.
- The optional AI provider credential is a server-side secret. Never put Slack, Supabase service, or AI credentials in GitHub.

The current pilot is limited to one approved manager–employee pair in one Slack workspace. Bulk roster upload, HRIS synchronization, automatic data deletion, and broader provisioning are not implemented. IT and privacy owners should approve provider use, onboarding and offboarding, access, retention, backups, logging, cost controls, and support before wider use.

## Build and verify

Requires Node.js 22 or later. From this directory:

```sh
npm ci --ignore-scripts
npm test
npm run worker:build
```

The 86 automated tests passed in the local pilot snapshot. Live testing generated, edited, approved, and submitted synthetic entries for all three AI modes. Recipient-side AI follow-up, adverse cases, and production-scale rate and spend controls need further verification. See the project owner for deployment configuration and operational records; they are intentionally excluded from this public repository.

## Configuration

`.env.example` lists variable names for local development and contains no credentials. Cloudflare uses protected secrets for the Slack bot token, signing secret, Supabase publishable key, and optional AI key. The Worker configuration contains no provider key. Set `PCI_AI_ENABLED` to `false` to turn off generation. Obtain organization approval before enabling AI and review provider retention terms and spending controls.
