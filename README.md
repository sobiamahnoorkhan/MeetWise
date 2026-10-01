# MeetWise AI

AI-powered group meetup planner built around one core problem: **multiple people with different locations and constraints need one fair place to meet**.

## Real planning flow

1. Members provide a location/area.
2. The backend calculates a shared search area.
3. Real venues are researched from OpenStreetMap/Nominatim.
4. OSRM calculates road travel time from every member to every candidate.
5. Candidates are ranked by fairness first: minimize the longest confirmed journey, then total travel time, then verified constraints.
6. Open-Meteo can check forecast conditions for the selected meetup time.
7. The group can vote on researched options.
8. If a member changes a constraint, the plan can be recalculated.

## No Google API key required

The live planning engine uses:
- OpenStreetMap / Nominatim for place research and geocoding
- OSRM for driving routes
- Open-Meteo for weather
- Leaflet for the interactive map
- Supabase/Postgres for persistence
- Gemini only for optional AI constraint analysis

The app does **not** fabricate venue availability, reservations, occupancy, prices, ratings, or opening status. If the public source does not provide a value, the UI labels it as unverified.

## Current limitations

- Public OSM listings vary in completeness.
- Opening-hours text is shown when a venue listing provides it, but temporary closures are not guaranteed to be detected.
- Live reservation/seating/occupancy is not available from these sources.
- Current OSRM routing confirms driving routes; separate walking, bike and public-transit route profiles are not claimed.
- Browser notifications depend on the page remaining active; they are not equivalent to guaranteed push notifications.

## Deployment

Frontend: root `index.html`, `app.js`, `styles.css`.

Backend: `backend/`.

Required backend environment variables include `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SESSION_SECRET`. Gemini features additionally require `GEMINI_API_KEY`.
