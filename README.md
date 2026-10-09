# Performance Check-In

Slack check-ins between a manager and a colleague. The manager chooses the topics, saves a private draft, sends it once, and the colleague replies in Slack. People write and send every check-in. The app does not score or analyze what they write.

## The problem

Annual reviews arrive late and rest on memory. Managers need an easy way to give feedback in the moment, and colleagues need a way to answer, without adding HR overhead to daily work.

## How a check-in moves

1. **Choose.** Pick an assigned colleague and the discussion areas needed.
2. **Save a draft.** Add answers over time. A saved draft is private and can be edited.
3. **Send once.** Review all chosen areas, then send them together. Private notes stay private.
4. **Read and reply.** The recipient gets a Slack message and can respond to each area.

## Where AI fits

- **Now:** AI helped build the pilot. People write and send every check-in, and the app does not analyze their words.
- **Limits:** No AI ratings. No employment decisions. No employee data goes to a model in this pilot.
- **Later:** AI could suggest questions, draft summaries, and propose follow-up actions for people to review and edit. That needs IT and privacy approval and human review first.

AI is an enabler here, not the point. The work was redesigned around the outcome (a timely, two-way conversation) before any AI was considered.

## How it runs

Slack, Cloudflare, and Supabase. Cloudflare keeps it online. Supabase stores records and limits who can read them.

## Results

A pilot with a DHW Consulting client reached 50% of the workforce, and 40% of users reported feedback they could act on. Based on that, I added manager-selected discussion topics and manager-only notes.

## Status

Running as a pilot: one approved pair in one workspace. Two-way cloud delivery has been tested.

Not built yet: live AI, bulk roster upload, and HRIS sync.

Before any wider rollout, IT should own access, onboarding, security, privacy, retention, backups, audit needs, and support.

## Code

Code is not published yet. This page describes the product and how it is governed.

Built by [Melissa Weiss](https://github.com/missophs).
