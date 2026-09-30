# MeetWise AI

AI-powered group meetup planner.

Frontend: frontend/
Backend: backend/

Core flow: group goal -> member constraints -> live place research -> routing -> weather -> plan -> voting -> re-planning.

The MVP intentionally uses temporary in-memory state instead of a database. Accounts and meetups disappear when the backend restarts or their temporary lifetime ends.
