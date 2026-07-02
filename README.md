cat > README.md <<'EOF'
# MAMMBA Verify

MAMMBA Verify is a lead verification and review dashboard for scoring, reviewing, and managing business leads.

## Core Features

- Lead verification API
- Client scoring thresholds
- Lead review actions
- Dashboard layout
- Lead status badges
- Score waterfall breakdown
- Client threshold editor

## Project Structure

- `/app/api/leads/verify` — lead verification endpoint
- `/app/api/leads/[id]/review` — lead review endpoint
- `/app/api/clients/[id]/thresholds` — client threshold settings
- `/app/dashboard` — dashboard pages
- `/components/dashboard` — dashboard UI components
- `/lib/verification.ts` — lead scoring logic
- `/lib/dashboard-data.ts` — dashboard data helpers
- `/sql/001_schema.sql` — database schema

## Setup

```bash
npm install
npm run dev