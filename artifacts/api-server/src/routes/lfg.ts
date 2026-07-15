import { Router, type IRouter } from "express";
import { eq, and, or, gt, isNull, desc } from "drizzle-orm";
import {
  db,
  usersTable,
  lfgPostsTable,
  lfgResponsesTable,
  notificationsTable,
} from "@workspace/db";
import { CreateLfgPostBody, RespondToLfgPostBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { toPublicImageUrl } from "../lib/objectStorage";

const router: IRouter = Router();

function safeUser(u: typeof usersTable.$inferSelect) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarUrl: toPublicImageUrl(u.avatarUrl ?? null),
    bio: u.bio ?? null,
    status: u.status,
    currentGame: u.currentGame ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}

async function buildPost(post: typeof lfgPostsTable.$inferSelect, viewerId: number) {
  const [author] = await db.select().from(usersTable).where(eq(usersTable.id, post.authorId));

  const responseRows = await db
    .select({ user: usersTable, response: lfgResponsesTable })
    .from(lfgResponsesTable)
    .innerJoin(usersTable, eq(lfgResponsesTable.userId, usersTable.id))
    .where(eq(lfgResponsesTable.postId, post.id))
    .orderBy(desc(lfgResponsesTable.createdAt));

  return {
    id: post.id,
    author: safeUser(author),
    game: post.game,
    platform: post.platform ?? null,
    rank: post.rank ?? null,
    description: post.description,
    neededPlayers: post.neededPlayers,
    micRequired: post.micRequired,
    status: post.status,
    responseCount: responseRows.length,
    responders: responseRows.map((r) => safeUser(r.user)),
    viewerHasResponded: responseRows.some((r) => r.response.userId === viewerId),
    expiresAt: post.expiresAt ? post.expiresAt.toISOString() : null,
    createdAt: post.createdAt.toISOString(),
  };
}

// GET /lfg — list open, non-expired posts; also includes the viewer's own closed/expired posts
router.get("/lfg", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;
  const game = typeof req.query.game === "string" && req.query.game.trim() ? req.query.game.trim() : undefined;
  const platform =
    typeof req.query.platform === "string" && req.query.platform.trim() ? req.query.platform.trim() : undefined;

  const now = new Date();
  // Open posts (not expired) for everyone — plus the viewer's own closed/expired posts
  const openFilters = [
    eq(lfgPostsTable.status, "open"),
    or(isNull(lfgPostsTable.expiresAt), gt(lfgPostsTable.expiresAt, now)),
  ];
  if (game) openFilters.push(eq(lfgPostsTable.game, game));
  if (platform) openFilters.push(eq(lfgPostsTable.platform, platform));

  const [openPosts, ownClosedPosts] = await Promise.all([
    db
      .select()
      .from(lfgPostsTable)
      .where(and(...openFilters))
      .orderBy(desc(lfgPostsTable.createdAt))
      .limit(50),
    // Own closed/expired posts (regardless of game/platform filter so they always appear)
    db
      .select()
      .from(lfgPostsTable)
      .where(and(eq(lfgPostsTable.authorId, myId), eq(lfgPostsTable.status, "closed")))
      .orderBy(desc(lfgPostsTable.createdAt))
      .limit(10),
  ]);

  // Merge, deduplicate (open own posts already appear in openPosts), sort by createdAt desc
  const seen = new Set<number>();
  const merged: typeof openPosts = [];
  for (const p of [...openPosts, ...ownClosedPosts]) {
    if (!seen.has(p.id)) {
      seen.add(p.id);
      merged.push(p);
    }
  }
  merged.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  res.json(await Promise.all(merged.map((p) => buildPost(p, myId))));
});

// POST /lfg — create a post
router.post("/lfg", requireAuth, async (req, res): Promise<void> => {
  const myId = req.auth!.userId;
  const parsed = CreateLfgPostBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { game, platform, rank, description, neededPlayers, micRequired, expiresInHours } = parsed.data;
  const expiresAt = expiresInHours ? new Date(Date.now() + expiresInHours * 3600 * 1000) : null;

  const [post] = await db
    .insert(lfgPostsTable)
    .values({
      authorId: myId,
      game,
      platform: platform ?? null,
      rank: rank ?? null,
      description,
      neededPlayers: neededPlayers ?? 1,
      micRequired: micRequired ?? false,
      expiresAt,
    })
    .returning();

  res.status(201).json(await buildPost(post, myId));
});

// POST /lfg/:postId/respond — express interest
router.post("/lfg/:postId/respond", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.postId) ? req.params.postId[0] : req.params.postId;
  const postId = parseInt(raw, 10);
  const myId = req.auth!.userId;

  const parsed = RespondToLfgPostBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [post] = await db.select().from(lfgPostsTable).where(eq(lfgPostsTable.id, postId));
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  if (post.status !== "open") {
    res.status(409).json({ error: "This post is closed" });
    return;
  }
  if (post.expiresAt && post.expiresAt.getTime() <= Date.now()) {
    res.status(409).json({ error: "This post has expired" });
    return;
  }
  if (post.authorId === myId) {
    res.status(400).json({ error: "You can't respond to your own post" });
    return;
  }

  // Idempotent + race-safe: the unique (post_id, user_id) constraint means a
  // duplicate response is a no-op, and `returning()` tells us whether this was
  // a genuinely new response so we only notify once.
  const inserted = await db
    .insert(lfgResponsesTable)
    .values({ postId, userId: myId, message: parsed.data.message ?? null })
    .onConflictDoNothing({ target: [lfgResponsesTable.postId, lfgResponsesTable.userId] })
    .returning();

  if (inserted.length > 0) {
    const [me] = await db.select().from(usersTable).where(eq(usersTable.id, myId));
    await db.insert(notificationsTable).values({
      userId: post.authorId,
      type: "lfg_response",
      title: `${me.displayName} wants to squad up for ${post.game}`,
      body: parsed.data.message ?? null,
      relatedId: post.id,
    });
  }

  res.json(await buildPost(post, myId));
});

// POST /lfg/:postId/close — author closes the post
router.post("/lfg/:postId/close", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.postId) ? req.params.postId[0] : req.params.postId;
  const postId = parseInt(raw, 10);
  const myId = req.auth!.userId;

  const [post] = await db.select().from(lfgPostsTable).where(eq(lfgPostsTable.id, postId));
  if (!post || post.authorId !== myId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [updated] = await db
    .update(lfgPostsTable)
    .set({ status: "closed" })
    .where(eq(lfgPostsTable.id, postId))
    .returning();

  res.json(await buildPost(updated, myId));
});

// DELETE /lfg/:postId — author deletes the post
router.delete("/lfg/:postId", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.postId) ? req.params.postId[0] : req.params.postId;
  const postId = parseInt(raw, 10);
  const myId = req.auth!.userId;

  const [post] = await db.select().from(lfgPostsTable).where(eq(lfgPostsTable.id, postId));
  if (!post || post.authorId !== myId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  // Clean up stale LFG notifications that point to this post before deleting the post,
  // so the author's feed doesn't show ghost entries for a post that no longer exists.
  // Scoped to `lfg_response` type only — other notification types use relatedId from
  // different ID spaces (parties, friends, etc.) and must not be touched.
  await db
    .delete(notificationsTable)
    .where(
      and(
        eq(notificationsTable.relatedId, postId),
        eq(notificationsTable.type, "lfg_response"),
      ),
    );
  await db.delete(lfgPostsTable).where(eq(lfgPostsTable.id, postId));
  res.json({ success: true });
});

export default router;
