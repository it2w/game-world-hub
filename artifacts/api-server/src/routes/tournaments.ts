import { Router, type IRouter } from "express";
import { eq, desc, and, sql } from "drizzle-orm";
import { db, usersTable, notificationsTable, pool } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { pushToUser } from "../ws/signaling";
import { toPublicImageUrl } from "../lib/objectStorage";

const router: IRouter = Router();

// ── DB setup ──────────────────────────────────────────────────────────────────

async function ensureTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tournaments (
      id               SERIAL PRIMARY KEY,
      creator_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name             TEXT NOT NULL,
      game             TEXT NOT NULL,
      description      TEXT,
      max_participants INTEGER NOT NULL CHECK (max_participants IN (4,8,16,32)),
      status           TEXT NOT NULL DEFAULT 'upcoming'
                         CHECK (status IN ('upcoming','active','completed')),
      start_date       TIMESTAMPTZ,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tournament_participants (
      tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      seed_number   INTEGER,
      joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tournament_id, user_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tournament_matches (
      id            SERIAL PRIMARY KEY,
      tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      round         INTEGER NOT NULL,
      position      INTEGER NOT NULL,
      player1_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      player2_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      winner_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_trophies (
      id            SERIAL PRIMARY KEY,
      user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      won_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, tournament_id)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_t_matches_tournament ON tournament_matches(tournament_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_t_participants_tournament ON tournament_participants(tournament_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_trophies_user ON user_trophies(user_id)`);
}

ensureTables().catch(err => console.error("[tournaments] init failed:", err));

// ── Helpers ───────────────────────────────────────────────────────────────────

function userSummary(u: typeof usersTable.$inferSelect) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarUrl: toPublicImageUrl(u.avatarUrl ?? null),
  };
}

async function getTournamentRow(id: number) {
  const { rows } = await pool.query<{
    id: number; creator_id: number; name: string; game: string;
    description: string | null; max_participants: number; status: string;
    start_date: string | null; created_at: string; updated_at: string;
  }>("SELECT * FROM tournaments WHERE id=$1", [id]);
  return rows[0] ?? null;
}

async function getParticipantCount(tournamentId: number): Promise<number> {
  const { rows } = await pool.query<{ cnt: string }>(
    "SELECT COUNT(*) AS cnt FROM tournament_participants WHERE tournament_id=$1",
    [tournamentId],
  );
  return parseInt(rows[0]?.cnt ?? "0", 10);
}

/** Shuffle an array in-place (Fisher-Yates). */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Single-elimination bracket generator.
 * Creates matches for all rounds. Round 1 has participantCount/2 matches;
 * subsequent rounds are empty placeholders. Player slots in later rounds
 * are filled in as match results are submitted.
 */
async function generateBracket(tournamentId: number): Promise<void> {
  const { rows: participants } = await pool.query<{ user_id: number }>(
    "SELECT user_id FROM tournament_participants WHERE tournament_id=$1 ORDER BY joined_at",
    [tournamentId],
  );

  const count = participants.length;
  if (count < 2) throw new Error("Not enough participants");

  // Shuffle and assign seeds
  const seeded = shuffle(participants.map(p => p.user_id));
  for (let i = 0; i < seeded.length; i++) {
    await pool.query(
      "UPDATE tournament_participants SET seed_number=$1 WHERE tournament_id=$2 AND user_id=$3",
      [i + 1, tournamentId, seeded[i]],
    );
  }

  const totalRounds = Math.log2(count);

  // Clear any existing matches (in case of re-generation)
  await pool.query("DELETE FROM tournament_matches WHERE tournament_id=$1", [tournamentId]);

  // Round 1 — seed-based pairing: 1v2, 3v4, etc.
  for (let pos = 1; pos <= count / 2; pos++) {
    const p1 = seeded[(pos - 1) * 2];
    const p2 = seeded[(pos - 1) * 2 + 1];
    await pool.query(
      `INSERT INTO tournament_matches (tournament_id, round, position, player1_id, player2_id)
       VALUES ($1, 1, $2, $3, $4)`,
      [tournamentId, pos, p1, p2 ?? null],
    );
  }

  // Later rounds — empty placeholder matches
  for (let round = 2; round <= totalRounds; round++) {
    const matchesInRound = count / Math.pow(2, round);
    for (let pos = 1; pos <= matchesInRound; pos++) {
      await pool.query(
        `INSERT INTO tournament_matches (tournament_id, round, position, player1_id, player2_id)
         VALUES ($1, $2, $3, NULL, NULL)`,
        [tournamentId, round, pos],
      );
    }
  }
}

/** Returns total rounds for a given participant count */
function totalRoundsFor(count: number): number {
  return Math.log2(count);
}

/** Notify all participants of a tournament */
async function notifyParticipants(
  tournamentId: number,
  excludeUserId: number,
  type: string,
  title: string,
  body: string,
): Promise<void> {
  const { rows } = await pool.query<{ user_id: number }>(
    "SELECT user_id FROM tournament_participants WHERE tournament_id=$1",
    [tournamentId],
  );
  for (const { user_id } of rows) {
    if (user_id === excludeUserId) continue;
    const [notification] = await db
      .insert(notificationsTable)
      .values({ userId: user_id, type, title, body, relatedId: tournamentId })
      .returning();
    pushToUser(user_id, { type: "notification", notification });
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /tournaments — list all tournaments
router.get("/tournaments", requireAuth, async (req, res): Promise<void> => {
  const viewerId = req.auth!.userId;
  const statusFilter = req.query.status as string | undefined;
  const gameFilter = req.query.game as string | undefined;

  let q = `
    SELECT t.*, u.id AS uid, u.username, u.display_name, u.avatar_url,
           COUNT(tp.user_id)::INT AS participant_count
    FROM tournaments t
    JOIN users u ON u.id = t.creator_id
    LEFT JOIN tournament_participants tp ON tp.tournament_id = t.id
  `;
  const params: (string | number)[] = [];
  const conditions: string[] = [];

  if (statusFilter && ["upcoming", "active", "completed"].includes(statusFilter)) {
    params.push(statusFilter);
    conditions.push(`t.status = $${params.length}`);
  }
  if (gameFilter) {
    params.push(`%${gameFilter}%`);
    conditions.push(`t.game ILIKE $${params.length}`);
  }

  if (conditions.length > 0) q += " WHERE " + conditions.join(" AND ");
  q += " GROUP BY t.id, u.id ORDER BY t.created_at DESC LIMIT 100";

  const { rows } = await pool.query(q, params);

  // Check which ones the viewer has joined
  const { rows: joinedRows } = await pool.query<{ tournament_id: number }>(
    "SELECT tournament_id FROM tournament_participants WHERE user_id=$1",
    [viewerId],
  );
  const joinedSet = new Set(joinedRows.map(r => r.tournament_id));

  res.json({
    tournaments: rows.map(r => ({
      id: r.id,
      name: r.name,
      game: r.game,
      description: r.description,
      maxParticipants: r.max_participants,
      status: r.status,
      startDate: r.start_date,
      createdAt: r.created_at,
      participantCount: r.participant_count,
      isFull: r.participant_count >= r.max_participants,
      hasJoined: joinedSet.has(r.id),
      isCreator: r.creator_id === viewerId,
      creator: {
        id: r.uid,
        username: r.username,
        displayName: r.display_name,
        avatarUrl: toPublicImageUrl(r.avatar_url),
      },
    })),
  });
});

// POST /tournaments — create tournament
router.post("/tournaments", requireAuth, async (req, res): Promise<void> => {
  const creatorId = req.auth!.userId;
  const { name, game, description, maxParticipants, startDate } = req.body as {
    name?: string; game?: string; description?: string;
    maxParticipants?: number; startDate?: string;
  };

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: "Name is required" });
    return;
  }
  if (!game || typeof game !== "string" || game.trim().length === 0) {
    res.status(400).json({ error: "Game is required" });
    return;
  }
  if (![4, 8, 16, 32].includes(Number(maxParticipants))) {
    res.status(400).json({ error: "maxParticipants must be 4, 8, 16, or 32" });
    return;
  }

  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO tournaments (creator_id, name, game, description, max_participants, start_date)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [creatorId, name.trim(), game.trim(), description?.trim() ?? null,
     Number(maxParticipants), startDate ? new Date(startDate) : null],
  );
  const tournamentId = rows[0].id;

  // Creator auto-joins
  await pool.query(
    "INSERT INTO tournament_participants (tournament_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [tournamentId, creatorId],
  );

  const tournament = await getTournamentRow(tournamentId);
  const [creator] = await db.select().from(usersTable).where(eq(usersTable.id, creatorId));

  res.status(201).json({
    id: tournament!.id,
    name: tournament!.name,
    game: tournament!.game,
    description: tournament!.description,
    maxParticipants: tournament!.max_participants,
    status: tournament!.status,
    startDate: tournament!.start_date,
    createdAt: tournament!.created_at,
    participantCount: 1,
    isFull: tournament!.max_participants === 1,
    hasJoined: true,
    isCreator: true,
    creator: userSummary(creator),
  });
});

// GET /tournaments/:id — tournament detail
router.get("/tournaments/:id", requireAuth, async (req, res): Promise<void> => {
  const viewerId = req.auth!.userId;
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const tournament = await getTournamentRow(id);
  if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }

  const [creator] = await db.select().from(usersTable).where(eq(usersTable.id, tournament.creator_id));
  if (!creator) { res.status(404).json({ error: "Tournament not found" }); return; }

  const { rows: participantRows } = await pool.query<{
    user_id: number; seed_number: number | null; joined_at: string;
    username: string; display_name: string; avatar_url: string | null;
  }>(
    `SELECT tp.user_id, tp.seed_number, tp.joined_at,
            u.username, u.display_name, u.avatar_url
     FROM tournament_participants tp
     JOIN users u ON u.id = tp.user_id
     WHERE tp.tournament_id=$1 ORDER BY tp.joined_at`,
    [id],
  );

  const hasJoined = participantRows.some(p => p.user_id === viewerId);

  res.json({
    id: tournament.id,
    name: tournament.name,
    game: tournament.game,
    description: tournament.description,
    maxParticipants: tournament.max_participants,
    status: tournament.status,
    startDate: tournament.start_date,
    createdAt: tournament.created_at,
    participantCount: participantRows.length,
    isFull: participantRows.length >= tournament.max_participants,
    hasJoined,
    isCreator: tournament.creator_id === viewerId,
    creator: userSummary(creator),
    participants: participantRows.map(p => ({
      userId: p.user_id,
      seedNumber: p.seed_number,
      joinedAt: p.joined_at,
      username: p.username,
      displayName: p.display_name,
      avatarUrl: toPublicImageUrl(p.avatar_url),
    })),
  });
});

// POST /tournaments/:id/join — join a tournament
router.post("/tournaments/:id/join", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const tournament = await getTournamentRow(id);
  if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }
  if (tournament.status !== "upcoming") {
    res.status(400).json({ error: "Tournament is no longer accepting participants" });
    return;
  }

  const count = await getParticipantCount(id);
  if (count >= tournament.max_participants) {
    res.status(400).json({ error: "Tournament is full" });
    return;
  }

  await pool.query(
    "INSERT INTO tournament_participants (tournament_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
    [id, userId],
  );

  // Notify creator
  if (tournament.creator_id !== userId) {
    const [joiner] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    const [notification] = await db
      .insert(notificationsTable)
      .values({
        userId: tournament.creator_id,
        type: "tournament_join",
        title: `${joiner.displayName} joined your tournament`,
        body: tournament.name,
        relatedId: id,
      })
      .returning();
    pushToUser(tournament.creator_id, { type: "notification", notification });
  }

  res.json({ joined: true });
});

// DELETE /tournaments/:id/join — leave a tournament
router.delete("/tournaments/:id/join", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const tournament = await getTournamentRow(id);
  if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }
  if (tournament.status !== "upcoming") {
    res.status(400).json({ error: "Cannot leave an active or completed tournament" });
    return;
  }
  if (tournament.creator_id === userId) {
    res.status(400).json({ error: "Creator cannot leave their own tournament" });
    return;
  }

  await pool.query(
    "DELETE FROM tournament_participants WHERE tournament_id=$1 AND user_id=$2",
    [id, userId],
  );

  res.status(204).end();
});

// POST /tournaments/:id/start — start tournament and generate bracket (creator only)
router.post("/tournaments/:id/start", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const tournament = await getTournamentRow(id);
  if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }
  if (tournament.creator_id !== userId) {
    res.status(403).json({ error: "Only the creator can start the tournament" });
    return;
  }
  if (tournament.status !== "upcoming") {
    res.status(400).json({ error: "Tournament already started or completed" });
    return;
  }

  const count = await getParticipantCount(id);
  if (count < 2) {
    res.status(400).json({ error: "Need at least 2 participants to start" });
    return;
  }
  // Participant count must be a power of 2 (we only allow 4/8/16/32 max, but if fewer joined we need to handle byes)
  // For simplicity: allow any count ≥ 2, generateBracket handles it
  // Actually: for clean brackets, we require count to be exactly 4, 8, 16, or 32
  // OR we allow any count but pad with byes (player2_id = NULL → auto-advance)
  // → We'll allow any count ≥ 2 and let bracket have BYE slots

  await generateBracket(id);
  await pool.query("UPDATE tournaments SET status='active', updated_at=NOW() WHERE id=$1", [id]);

  // Notify all participants
  await notifyParticipants(id, userId, "tournament_started",
    `Tournament started: ${tournament.name}`,
    `The bracket is ready! May the best player win.`);

  res.json({ started: true });
});

// GET /tournaments/:id/bracket — get the bracket
router.get("/tournaments/:id/bracket", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const tournament = await getTournamentRow(id);
  if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }

  const { rows: matchRows } = await pool.query<{
    id: number; round: number; position: number;
    player1_id: number | null; player2_id: number | null; winner_id: number | null;
  }>(
    "SELECT id, round, position, player1_id, player2_id, winner_id FROM tournament_matches WHERE tournament_id=$1 ORDER BY round, position",
    [id],
  );

  // Gather all user IDs we need
  const userIdSet = new Set<number>();
  for (const m of matchRows) {
    if (m.player1_id) userIdSet.add(m.player1_id);
    if (m.player2_id) userIdSet.add(m.player2_id);
    if (m.winner_id) userIdSet.add(m.winner_id);
  }

  // Fetch users in one batch
  const userMap = new Map<number, { id: number; username: string; displayName: string; avatarUrl: string | null }>();
  if (userIdSet.size > 0) {
    const ids = Array.from(userIdSet);
    const { rows: users } = await pool.query<{
      id: number; username: string; display_name: string; avatar_url: string | null;
    }>(`SELECT id, username, display_name, avatar_url FROM users WHERE id = ANY($1)`, [ids]);
    for (const u of users) {
      userMap.set(u.id, {
        id: u.id,
        username: u.username,
        displayName: u.display_name,
        avatarUrl: toPublicImageUrl(u.avatar_url),
      });
    }
  }

  // Group by round
  const roundMap = new Map<number, typeof matchRows>();
  for (const m of matchRows) {
    if (!roundMap.has(m.round)) roundMap.set(m.round, []);
    roundMap.get(m.round)!.push(m);
  }

  const rounds = Array.from(roundMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([round, matches]) => ({
      round,
      matches: matches.map(m => ({
        id: m.id,
        position: m.position,
        player1: m.player1_id ? userMap.get(m.player1_id) ?? null : null,
        player2: m.player2_id ? userMap.get(m.player2_id) ?? null : null,
        winner: m.winner_id ? userMap.get(m.winner_id) ?? null : null,
      })),
    }));

  // Check for champion: winner of the final match
  let champion = null;
  if (rounds.length > 0) {
    const finalRound = rounds[rounds.length - 1];
    if (finalRound.matches.length === 1 && finalRound.matches[0].winner) {
      champion = finalRound.matches[0].winner;
    }
  }

  res.json({ rounds, champion });
});

// POST /tournaments/:id/matches/:matchId/result — submit match result (creator only)
router.post("/tournaments/:id/matches/:matchId/result", requireAuth, async (req, res): Promise<void> => {
  const userId = req.auth!.userId;
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const rawMatchId = Array.isArray(req.params.matchId) ? req.params.matchId[0] : req.params.matchId;
  const id = parseInt(rawId, 10);
  const matchId = parseInt(rawMatchId, 10);

  if (isNaN(id) || isNaN(matchId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const tournament = await getTournamentRow(id);
  if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }
  if (tournament.creator_id !== userId) {
    res.status(403).json({ error: "Only the creator can submit match results" });
    return;
  }
  if (tournament.status !== "active") {
    res.status(400).json({ error: "Tournament is not active" });
    return;
  }

  const { rows: matchRows } = await pool.query<{
    id: number; round: number; position: number;
    player1_id: number | null; player2_id: number | null; winner_id: number | null;
  }>(
    "SELECT * FROM tournament_matches WHERE id=$1 AND tournament_id=$2",
    [matchId, id],
  );
  const match = matchRows[0];
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }
  if (match.winner_id !== null) {
    res.status(400).json({ error: "Match result already submitted" });
    return;
  }

  const { winnerId } = req.body as { winnerId?: number };
  if (!winnerId || typeof winnerId !== "number") {
    res.status(400).json({ error: "winnerId is required" });
    return;
  }
  if (winnerId !== match.player1_id && winnerId !== match.player2_id) {
    // Allow BYE advance: if one player is null, the other auto-wins
    const validPlayers = [match.player1_id, match.player2_id].filter(Boolean);
    if (!validPlayers.includes(winnerId)) {
      res.status(400).json({ error: "Winner must be one of the match participants" });
      return;
    }
  }

  // Set winner
  await pool.query("UPDATE tournament_matches SET winner_id=$1 WHERE id=$2", [winnerId, matchId]);

  // Get all matches for this tournament
  const { rows: allMatches } = await pool.query<{
    id: number; round: number; position: number;
    player1_id: number | null; player2_id: number | null; winner_id: number | null;
  }>(
    "SELECT id, round, position, player1_id, player2_id, winner_id FROM tournament_matches WHERE tournament_id=$1 ORDER BY round, position",
    [id],
  );
  allMatches.find(m => m.id === matchId)!.winner_id = winnerId; // patch local copy

  // Advance winner to next round
  const totalRounds = Math.max(...allMatches.map(m => m.round));
  let nextMatch = null;
  if (match.round < totalRounds) {
    const nextRound = match.round + 1;
    const nextPos = Math.ceil(match.position / 2);
    // odd position → player1 slot, even position → player2 slot
    const slot = match.position % 2 === 1 ? "player1_id" : "player2_id";
    const { rows: nextMatchRows } = await pool.query<{ id: number }>(
      `UPDATE tournament_matches SET ${slot}=$1 WHERE tournament_id=$2 AND round=$3 AND position=$4 RETURNING id`,
      [winnerId, id, nextRound, nextPos],
    );
    if (nextMatchRows.length > 0) {
      nextMatch = nextMatchRows[0];
    }
  }

  // Check if tournament is complete (all matches have a winner)
  const updatedMatches = allMatches.map(m => m.id === matchId ? { ...m, winner_id: winnerId } : m);
  const allDone = updatedMatches.every(m => m.winner_id !== null);

  let tournamentWinner = null;
  if (allDone) {
    // Mark tournament as completed
    await pool.query("UPDATE tournaments SET status='completed', updated_at=NOW() WHERE id=$1", [id]);

    // Find champion (winner of final match)
    const finalMatch = updatedMatches.find(m => m.round === totalRounds && m.position === 1);
    const championId = finalMatch?.winner_id ?? winnerId;

    // Award trophy
    await pool.query(
      "INSERT INTO user_trophies (user_id, tournament_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
      [championId, id],
    );

    const [champion] = await db.select().from(usersTable).where(eq(usersTable.id, championId));
    if (champion) {
      tournamentWinner = userSummary(champion);

      // Notify champion
      const [notification] = await db
        .insert(notificationsTable)
        .values({
          userId: championId,
          type: "tournament_won",
          title: `🏆 You won the tournament!`,
          body: `Congratulations! You are the champion of "${tournament.name}"`,
          relatedId: id,
        })
        .returning();
      pushToUser(championId, { type: "notification", notification });

      // Notify all other participants
      await notifyParticipants(id, championId, "tournament_completed",
        `Tournament completed: ${tournament.name}`,
        `${champion.displayName} is the champion!`);
    }
  } else {
    // Check if current round is fully complete → notify participants a new round started
    const currentRoundMatches = updatedMatches.filter(m => m.round === match.round);
    const roundDone = currentRoundMatches.every(m => m.winner_id !== null);
    if (roundDone && match.round < totalRounds) {
      await notifyParticipants(id, -1, "tournament_round",
        `Round ${match.round + 1} started: ${tournament.name}`,
        `Round ${match.round} is complete. Check the updated bracket.`);
    }
  }

  res.json({ success: true, nextMatch, tournamentWinner });
});

// GET /users/:id/trophies — trophies on user profile
router.get("/users/:id/trophies", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const profileUserId = parseInt(rawId, 10);
  if (isNaN(profileUserId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { rows } = await pool.query<{
    id: number; tournament_id: number; won_at: string;
    name: string; game: string; max_participants: number;
  }>(
    `SELECT ut.id, ut.tournament_id, ut.won_at,
            t.name, t.game, t.max_participants
     FROM user_trophies ut
     JOIN tournaments t ON t.id = ut.tournament_id
     WHERE ut.user_id=$1
     ORDER BY ut.won_at DESC`,
    [profileUserId],
  );

  res.json(rows.map(r => ({
    id: r.id,
    tournamentId: r.tournament_id,
    wonAt: r.won_at,
    tournamentName: r.name,
    game: r.game,
    maxParticipants: r.max_participants,
  })));
});

export default router;
