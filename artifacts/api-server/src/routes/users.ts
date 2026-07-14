import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import {
  db,
  usersTable,
  userGamesTable,
  gamesTable,
  platformLinksTable,
  profileCommentsTable,
  profilePhotosTable,
  blocksTable,
} from "@workspace/db";
import {
  UpdateProfileBody,
  CreateProfileCommentBody,
  AddProfilePhotoBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { isBlockedBetween } from "./blocks";
import { ObjectStorageService, toPublicImageUrl } from "../lib/objectStorage";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const MAX_PROFILE_PHOTOS = 12;

function safeUser(u: typeof usersTable.$inferSelect) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarUrl: toPublicImageUrl(u.avatarUrl ?? null),
    bannerUrl: toPublicImageUrl(u.bannerUrl ?? null),
    bio: u.bio ?? null,
    allowProfileComments: u.allowProfileComments,
    status: u.status,
    currentGame: u.currentGame ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}

/**
 * Normalizes an uploaded image reference for storage in the DB.
 * Raw presigned GCS URLs become `/objects/...` paths and get a public ACL;
 * external http(s) URLs are kept as-is.
 */
async function normalizeStoredImagePath(userId: number, rawPath: string): Promise<string> {
  // Accept servable URLs (as the API returns them) and store the canonical /objects path.
  const path = rawPath.startsWith("/api/storage/objects/")
    ? rawPath.slice("/api/storage".length)
    : rawPath;
  const isStorageRef =
    path.startsWith("https://storage.googleapis.com/") || path.startsWith("/objects/");
  if (!isStorageRef) return path;
  try {
    return await objectStorageService.trySetObjectEntityAclPolicy(path, {
      owner: String(userId),
      visibility: "public",
    });
  } catch (err) {
    logger.warn({ err }, "Failed to set ACL on uploaded image; storing normalized path");
    return objectStorageService.normalizeObjectEntityPath(path);
  }
}

/** All user ids that have a block in either direction with `userId`. */
async function getBlockedIdSet(userId: number): Promise<Set<number>> {
  const rows = await db
    .select()
    .from(blocksTable)
    .where(or(eq(blocksTable.blockerId, userId), eq(blocksTable.blockedId, userId)));
  const set = new Set<number>();
  for (const r of rows) set.add(r.blockerId === userId ? r.blockedId : r.blockerId);
  return set;
}

function commentAuthor(u: typeof usersTable.$inferSelect) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarUrl: toPublicImageUrl(u.avatarUrl ?? null),
  };
}

// GET /users/search
router.get("/users/search", requireAuth, async (req, res): Promise<void> => {
  const q = req.query.q as string;
  if (!q || q.trim().length === 0) {
    res.status(400).json({ error: "Query is required" });
    return;
  }
  const users = await db.select().from(usersTable)
    .where(ilike(usersTable.username, `%${q}%`))
    .limit(20);
  res.json(users.filter(u => u.id !== req.auth!.userId).map(safeUser));
});

// GET /users/:userId
router.get("/users/:userId", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const userId = parseInt(raw, 10);
  if (isNaN(userId)) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const games = await db.select({ id: userGamesTable.id, game: gamesTable, addedAt: userGamesTable.addedAt })
    .from(userGamesTable)
    .innerJoin(gamesTable, eq(userGamesTable.gameId, gamesTable.id))
    .where(eq(userGamesTable.userId, userId));

  const platforms = await db.select().from(platformLinksTable).where(eq(platformLinksTable.userId, userId));

  res.json({
    ...safeUser(user),
    games: games.map(g => ({
      id: g.id,
      game: {
        id: g.game.id,
        name: g.game.name,
        coverUrl: g.game.coverUrl ?? null,
        genre: g.game.genre ?? null,
        platforms: g.game.platforms ?? [],
        createdAt: g.game.createdAt.toISOString(),
      },
      addedAt: g.addedAt.toISOString(),
    })),
    platforms: platforms.map(p => ({
      id: p.id,
      platform: p.platform,
      profileUrl: p.profileUrl,
      username: p.username ?? null,
      linkedAt: p.linkedAt.toISOString(),
    })),
  });
});

// PATCH /users/:userId/profile
router.patch("/users/:userId/profile", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const userId = parseInt(raw, 10);
  if (userId !== req.auth!.userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const parsed = UpdateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updates: typeof parsed.data = { ...parsed.data };
  if (typeof updates.avatarUrl === "string" && updates.avatarUrl.length > 0) {
    updates.avatarUrl = await normalizeStoredImagePath(userId, updates.avatarUrl);
  }
  if (typeof updates.bannerUrl === "string" && updates.bannerUrl.length > 0) {
    updates.bannerUrl = await normalizeStoredImagePath(userId, updates.bannerUrl);
  }
  const [user] = await db.update(usersTable)
    .set({ ...updates })
    .where(eq(usersTable.id, userId))
    .returning();

  const games = await db.select({ id: userGamesTable.id, game: gamesTable, addedAt: userGamesTable.addedAt })
    .from(userGamesTable)
    .innerJoin(gamesTable, eq(userGamesTable.gameId, gamesTable.id))
    .where(eq(userGamesTable.userId, userId));

  const platforms = await db.select().from(platformLinksTable).where(eq(platformLinksTable.userId, userId));

  res.json({
    ...safeUser(user),
    games: games.map(g => ({
      id: g.id,
      game: {
        id: g.game.id,
        name: g.game.name,
        coverUrl: g.game.coverUrl ?? null,
        genre: g.game.genre ?? null,
        platforms: g.game.platforms ?? [],
        createdAt: g.game.createdAt.toISOString(),
      },
      addedAt: g.addedAt.toISOString(),
    })),
    platforms: platforms.map(p => ({
      id: p.id,
      platform: p.platform,
      profileUrl: p.profileUrl,
      username: p.username ?? null,
      linkedAt: p.linkedAt.toISOString(),
    })),
  });
});

// ── Profile wall comments ────────────────────────────────────────────────────

// GET /users/:userId/comments
router.get("/users/:userId/comments", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const userId = parseInt(raw, 10);
  if (isNaN(userId)) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }
  const [owner] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!owner) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const viewerId = req.auth!.userId;
  const isOwner = viewerId === userId;
  if (!isOwner && (!owner.allowProfileComments || (await isBlockedBetween(viewerId, userId)))) {
    // Wall hidden for this viewer — no info leak about why.
    res.json({ enabled: false, comments: [] });
    return;
  }

  const rows = await db
    .select({ comment: profileCommentsTable, author: usersTable })
    .from(profileCommentsTable)
    .innerJoin(usersTable, eq(profileCommentsTable.authorId, usersTable.id))
    .where(eq(profileCommentsTable.profileUserId, userId))
    .orderBy(desc(profileCommentsTable.createdAt))
    .limit(100);

  // Hide comments from users the viewer has a block with (either direction).
  const blockedIds = await getBlockedIdSet(viewerId);

  res.json({
    enabled: owner.allowProfileComments,
    comments: rows
      .filter(({ author }) => author.id === viewerId || !blockedIds.has(author.id))
      .map(({ comment, author }) => ({
        id: comment.id,
        profileUserId: comment.profileUserId,
        authorId: comment.authorId,
        body: comment.body,
        createdAt: comment.createdAt.toISOString(),
        author: commentAuthor(author),
      })),
  });
});

// POST /users/:userId/comments
router.post("/users/:userId/comments", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const userId = parseInt(raw, 10);
  if (isNaN(userId)) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }
  const parsed = CreateProfileCommentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const body = parsed.data.body.trim();
  if (body.length === 0) {
    res.status(400).json({ error: "Comment cannot be empty" });
    return;
  }

  const [owner] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!owner) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const authorId = req.auth!.userId;
  if (authorId !== userId) {
    if (await isBlockedBetween(authorId, userId)) {
      res.status(403).json({ error: "You cannot comment on this profile" });
      return;
    }
    if (!owner.allowProfileComments) {
      res.status(403).json({ error: "Comments are disabled on this profile" });
      return;
    }
  }

  const [comment] = await db
    .insert(profileCommentsTable)
    .values({ profileUserId: userId, authorId, body })
    .returning();
  const [author] = await db.select().from(usersTable).where(eq(usersTable.id, authorId));

  res.status(201).json({
    id: comment.id,
    profileUserId: comment.profileUserId,
    authorId: comment.authorId,
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    author: commentAuthor(author),
  });
});

// DELETE /users/:userId/comments/:commentId — wall owner or comment author
router.delete("/users/:userId/comments/:commentId", requireAuth, async (req, res): Promise<void> => {
  const rawUser = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const rawComment = Array.isArray(req.params.commentId) ? req.params.commentId[0] : req.params.commentId;
  const userId = parseInt(rawUser, 10);
  const commentId = parseInt(rawComment, 10);
  if (isNaN(userId) || isNaN(commentId)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [comment] = await db
    .select()
    .from(profileCommentsTable)
    .where(and(eq(profileCommentsTable.id, commentId), eq(profileCommentsTable.profileUserId, userId)));
  if (!comment) {
    res.status(404).json({ error: "Comment not found" });
    return;
  }
  const me = req.auth!.userId;
  if (me !== comment.authorId && me !== comment.profileUserId) {
    res.status(403).json({ error: "Not allowed" });
    return;
  }
  await db.delete(profileCommentsTable).where(eq(profileCommentsTable.id, comment.id));
  res.status(204).end();
});

// ── Profile photos ───────────────────────────────────────────────────────────

// GET /users/:userId/photos
router.get("/users/:userId/photos", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const userId = parseInt(raw, 10);
  if (isNaN(userId)) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }
  const [owner] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!owner) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const photos = await db
    .select()
    .from(profilePhotosTable)
    .where(eq(profilePhotosTable.userId, userId))
    .orderBy(desc(profilePhotosTable.createdAt));
  res.json(
    photos.map(p => ({
      id: p.id,
      userId: p.userId,
      objectPath: toPublicImageUrl(p.objectPath),
      caption: p.caption ?? null,
      createdAt: p.createdAt.toISOString(),
    })),
  );
});

// POST /users/me/photos
router.post("/users/me/photos", requireAuth, async (req, res): Promise<void> => {
  const parsed = AddProfilePhotoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = req.auth!.userId;
  const existing = await db
    .select()
    .from(profilePhotosTable)
    .where(eq(profilePhotosTable.userId, userId));
  if (existing.length >= MAX_PROFILE_PHOTOS) {
    res.status(400).json({ error: `Photo limit reached (${MAX_PROFILE_PHOTOS})` });
    return;
  }
  const objectPath = await normalizeStoredImagePath(userId, parsed.data.objectPath);
  const [photo] = await db
    .insert(profilePhotosTable)
    .values({ userId, objectPath, caption: parsed.data.caption ?? null })
    .returning();
  res.status(201).json({
    id: photo.id,
    userId: photo.userId,
    objectPath: toPublicImageUrl(photo.objectPath),
    caption: photo.caption ?? null,
    createdAt: photo.createdAt.toISOString(),
  });
});

// DELETE /users/me/photos/:photoId
router.delete("/users/me/photos/:photoId", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.photoId) ? req.params.photoId[0] : req.params.photoId;
  const photoId = parseInt(raw, 10);
  if (isNaN(photoId)) {
    res.status(400).json({ error: "Invalid photo id" });
    return;
  }
  const [photo] = await db
    .select()
    .from(profilePhotosTable)
    .where(and(eq(profilePhotosTable.id, photoId), eq(profilePhotosTable.userId, req.auth!.userId)));
  if (!photo) {
    res.status(404).json({ error: "Photo not found" });
    return;
  }
  await db.delete(profilePhotosTable).where(eq(profilePhotosTable.id, photo.id));
  res.status(204).end();
});

export default router;
