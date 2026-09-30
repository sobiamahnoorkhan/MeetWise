# MeetWise Backend

Temporary-state backend for the MeetWise group meetup planner.

## Stack

- Node.js
- Express
- TypeScript
- In-memory meetup state

No database is required for this MVP. Meetups expire automatically after the configured TTL.

## Run locally

1. Copy `.env.example` to `.env`.
2. Install dependencies:
   `npm install`
3. Start development server:
   `npm run dev`

Default API: `http://localhost:4000`

## Core endpoints

- GET `/api/health`
- POST `/api/meetups`
- GET `/api/meetups/:id`
- GET `/api/meetups/code/:code`
- POST `/api/meetups/:id/join`
- PATCH `/api/meetups/:id/members/:memberId/preferences`
- POST `/api/meetups/:id/chat`
- POST `/api/meetups/:id/votes`

AI orchestration, place research, routing, weather, and replanning are intentionally separate next-stage services.
