import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import {
  ChatMessage,
  Member,
  MemberPreferences,
  Meetup,
  Vote
} from "./types.js";
import {
  createMeetup,
  deleteExpiredMeetups,
  generateInviteCode,
  getMeetup,
  getMeetupByCode,
  getTtlMinutes
} from "./store.js";

const app = express();

app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(",").map((value) => value.trim()) ?? true
}));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "meetwise-backend", time: new Date().toISOString() });
});

app.post("/api/meetups", (req, res) => {
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  const organizerName = typeof req.body?.organizerName === "string"
    ? req.body.organizerName.trim()
    : "";

  if (!title || !organizerName) {
    return res.status(400).json({ error: "title and organizerName are required" });
  }

  const now = new Date();
  const organizerId = randomUUID();
  const member: Member = {
    id: organizerId,
    name: organizerName,
    joinedAt: now.toISOString(),
    preferences: {}
  };

  const meetup: Meetup = {
    id: randomUUID(),
    inviteCode: generateInviteCode(),
    title,
    organizerId,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + getTtlMinutes() * 60_000).toISOString(),
    members: [member],
    chat: [],
    votes: []
  };

  return res.status(201).json(meetup);
});

app.get("/api/meetups/:id", (req, res) => {
  const meetup = getMeetup(req.params.id);
  if (!meetup) return res.status(404).json({ error: "Meetup not found or expired" });
  return res.json(meetup);
});

app.get("/api/meetups/code/:code", (req, res) => {
  const meetup = getMeetupByCode(req.params.code);
  if (!meetup) return res.status(404).json({ error: "Invalid or expired invite code" });
  return res.json(meetup);
});

app.post("/api/meetups/:id/join", (req, res) => {
  const meetup = getMeetup(req.params.id);
  if (!meetup) return res.status(404).json({ error: "Meetup not found or expired" });

  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const code = typeof req.body?.inviteCode === "string" ? req.body.inviteCode.trim().toUpperCase() : "";

  if (!name || code !== meetup.inviteCode) {
    return res.status(400).json({ error: "Valid name and invite code are required" });
  }

  const member: Member = {
    id: randomUUID(),
    name,
    joinedAt: new Date().toISOString(),
    preferences: {}
  };

  meetup.members.push(member);
  return res.status(201).json(member);
});

app.patch("/api/meetups/:id/members/:memberId/preferences", (req, res) => {
  const meetup = getMeetup(req.params.id);
  if (!meetup) return res.status(404).json({ error: "Meetup not found or expired" });

  const member = meetup.members.find((item) => item.id === req.params.memberId);
  if (!member) return res.status(404).json({ error: "Member not found" });

  const preferences = req.body as MemberPreferences;
  member.preferences = { ...member.preferences, ...preferences };
  return res.json(member);
});

app.post("/api/meetups/:id/chat", (req, res) => {
  const meetup = getMeetup(req.params.id);
  if (!meetup) return res.status(404).json({ error: "Meetup not found or expired" });

  const memberId = typeof req.body?.memberId === "string" ? req.body.memberId : "";
  const messageText = typeof req.body?.text === "string" ? req.body.text.trim() : "";

  if (!memberId || !messageText) {
    return res.status(400).json({ error: "memberId and text are required" });
  }

  if (!meetup.members.some((member) => member.id === memberId)) {
    return res.status(403).json({ error: "Member does not belong to this meetup" });
  }

  const message: ChatMessage = {
    id: randomUUID(),
    memberId,
    text: messageText,
    createdAt: new Date().toISOString()
  };

  meetup.chat.push(message);
  return res.status(201).json(message);
});

app.post("/api/meetups/:id/votes", (req, res) => {
  const meetup = getMeetup(req.params.id);
  if (!meetup) return res.status(404).json({ error: "Meetup not found or expired" });

  const memberId = typeof req.body?.memberId === "string" ? req.body.memberId : "";
  const optionId = typeof req.body?.optionId === "string" ? req.body.optionId : "";

  if (!memberId || !optionId) {
    return res.status(400).json({ error: "memberId and optionId are required" });
  }

  if (!meetup.members.some((member) => member.id === memberId)) {
    return res.status(403).json({ error: "Member does not belong to this meetup" });
  }

  const vote: Vote = { memberId, optionId, createdAt: new Date().toISOString() };
  meetup.votes = meetup.votes.filter((item) => item.memberId !== memberId);
  meetup.votes.push(vote);

  return res.status(201).json({ votes: meetup.votes });
});

app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const port = Number(process.env.PORT ?? 4000);

setInterval(deleteExpiredMeetups, 60_000).unref();

app.listen(port, () => {
  console.log(`MeetWise backend listening on http://localhost:${port}`);
});
