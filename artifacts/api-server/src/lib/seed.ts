import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import {
  db,
  usersTable,
  gamesTable,
  userGamesTable,
  friendshipsTable,
  friendRequestsTable,
  partiesTable,
  partyMembersTable,
  partyActivityTable,
  conversationsTable,
  conversationParticipantsTable,
  messagesTable,
  platformLinksTable,
  notificationsTable,
} from "@workspace/db";

export async function seed() {
  // Check if already seeded
  const existing = await db.select().from(usersTable).limit(1);
  if (existing.length > 0) return;

  const hash = await bcrypt.hash("password123", 10);

  // Create users
  const [ghost, nova, blade, viper, storm] = await db
    .insert(usersTable)
    .values([
      { username: "ghost_x", passwordHash: hash, displayName: "Ghost", status: "online", currentGame: "Valorant", bio: "Top fragger, mid or feed." },
      { username: "nova_fx", passwordHash: hash, displayName: "Nova", status: "online", currentGame: "Elden Ring", bio: "Souls vet. PvP specialist." },
      { username: "blade99", passwordHash: hash, displayName: "Blade", status: "away", currentGame: "Call of Duty", bio: "Grinder. Always ready to party." },
      { username: "viper_z", passwordHash: hash, displayName: "Viper", status: "busy", currentGame: "League of Legends", bio: "Diamond support main." },
      { username: "storm_r", passwordHash: hash, displayName: "Storm", status: "offline", currentGame: null, bio: "Casual weekends." },
    ])
    .returning();

  // Create games master list
  const [valorant, elden, cod, lol, fortnite, minecraft, apex, rocketLeague, gta, cyberpunk] = await db
    .insert(gamesTable)
    .values([
      { name: "Valorant", genre: "FPS", platforms: ["PC"] },
      { name: "Elden Ring", genre: "RPG", platforms: ["PC", "PlayStation", "Xbox"] },
      { name: "Call of Duty: Warzone", genre: "Battle Royale", platforms: ["PC", "PlayStation", "Xbox"] },
      { name: "League of Legends", genre: "MOBA", platforms: ["PC"] },
      { name: "Fortnite", genre: "Battle Royale", platforms: ["PC", "PlayStation", "Xbox", "Nintendo"] },
      { name: "Minecraft", genre: "Sandbox", platforms: ["PC", "PlayStation", "Xbox", "Nintendo"] },
      { name: "Apex Legends", genre: "Battle Royale", platforms: ["PC", "PlayStation", "Xbox"] },
      { name: "Rocket League", genre: "Sports", platforms: ["PC", "PlayStation", "Xbox", "Nintendo"] },
      { name: "GTA Online", genre: "Action", platforms: ["PC", "PlayStation", "Xbox"] },
      { name: "Cyberpunk 2077", genre: "RPG", platforms: ["PC", "PlayStation", "Xbox"] },
    ])
    .returning();

  // Assign games to users
  await db.insert(userGamesTable).values([
    { userId: ghost.id, gameId: valorant.id },
    { userId: ghost.id, gameId: cod.id },
    { userId: ghost.id, gameId: apex.id },
    { userId: nova.id, gameId: elden.id },
    { userId: nova.id, gameId: cyberpunk.id },
    { userId: nova.id, gameId: valorant.id },
    { userId: blade.id, gameId: cod.id },
    { userId: blade.id, gameId: fortnite.id },
    { userId: blade.id, gameId: apex.id },
    { userId: viper.id, gameId: lol.id },
    { userId: viper.id, gameId: valorant.id },
    { userId: storm.id, gameId: minecraft.id },
    { userId: storm.id, gameId: rocketLeague.id },
    { userId: storm.id, gameId: gta.id },
  ]);

  // Platform links
  await db.insert(platformLinksTable).values([
    { userId: ghost.id, platform: "steam", profileUrl: "https://steamcommunity.com/id/ghost_x", username: "ghost_x" },
    { userId: ghost.id, platform: "xbox", profileUrl: "https://www.xbox.com/play/user/ghost_x", username: "ghost_x" },
    { userId: nova.id, platform: "steam", profileUrl: "https://steamcommunity.com/id/nova_fx", username: "nova_fx" },
    { userId: nova.id, platform: "playstation", profileUrl: "https://psnprofiles.com/nova_fx", username: "nova_fx" },
    { userId: blade.id, platform: "battlenet", profileUrl: "https://www.battlenet.com/blade99", username: "blade99#1234" },
    { userId: viper.id, platform: "epic", profileUrl: "https://www.epicgames.com/id/viper_z", username: "viper_z" },
  ]);

  // Friendships: ghost <-> nova, ghost <-> blade, nova <-> viper
  await db.insert(friendshipsTable).values([
    { userId: ghost.id, friendId: nova.id },
    { userId: nova.id, friendId: ghost.id },
    { userId: ghost.id, friendId: blade.id },
    { userId: blade.id, friendId: ghost.id },
    { userId: nova.id, friendId: viper.id },
    { userId: viper.id, friendId: nova.id },
    { userId: ghost.id, friendId: storm.id },
    { userId: storm.id, friendId: ghost.id },
  ]);

  // Pending friend request from blade to viper
  await db.insert(friendRequestsTable).values({ fromUserId: blade.id, toUserId: viper.id, status: "pending" });

  // Create a party
  const [conv] = await db.insert(conversationsTable).values({ type: "party", name: "Valorant Ranked Run" }).returning();
  await db.insert(conversationParticipantsTable).values([
    { conversationId: conv.id, userId: ghost.id },
    { conversationId: conv.id, userId: nova.id },
    { conversationId: conv.id, userId: blade.id },
  ]);

  const [party] = await db.insert(partiesTable).values({
    name: "Valorant Ranked Run",
    game: "Valorant",
    platform: "PC",
    description: "Looking for 2 more. Diamond+ only.",
    leaderId: ghost.id,
    maxSize: 5,
    isPublic: true,
    conversationId: conv.id,
  }).returning();

  await db.insert(partyMembersTable).values([
    { partyId: party.id, userId: ghost.id },
    { partyId: party.id, userId: nova.id },
    { partyId: party.id, userId: blade.id },
  ]);

  await db.insert(partyActivityTable).values([
    { partyId: party.id, actorId: ghost.id, action: "created" },
    { partyId: party.id, actorId: nova.id, action: "joined" },
    { partyId: party.id, actorId: blade.id, action: "joined" },
  ]);

  // Seed some messages
  await db.insert(messagesTable).values([
    { conversationId: conv.id, senderId: ghost.id, content: "anyone wanna run ranked?" },
    { conversationId: conv.id, senderId: nova.id, content: "im in, give me 5 mins" },
    { conversationId: conv.id, senderId: blade.id, content: "ready when you are" },
  ]);

  // Direct conversation between ghost and nova
  const [directConv] = await db.insert(conversationsTable).values({ type: "direct" }).returning();
  await db.insert(conversationParticipantsTable).values([
    { conversationId: directConv.id, userId: ghost.id },
    { conversationId: directConv.id, userId: nova.id },
  ]);
  await db.insert(messagesTable).values([
    { conversationId: directConv.id, senderId: nova.id, content: "yo you gonna be on tonight?" },
    { conversationId: directConv.id, senderId: ghost.id, content: "yeah for sure, around 8pm" },
  ]);

  // Notifications for ghost
  await db.insert(notificationsTable).values([
    { userId: ghost.id, type: "friend_request", title: "Viper sent you a friend request", relatedId: 1 },
    { userId: ghost.id, type: "message", title: "Nova: yo you gonna be on tonight?", relatedId: directConv.id },
  ]);
}
