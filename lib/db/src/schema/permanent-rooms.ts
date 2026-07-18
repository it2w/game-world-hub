import { pgTable, serial, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const permanentRoomsTable = pgTable("permanent_rooms", {
  id:           serial("id").primaryKey(),
  ownerId:      integer("owner_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  name:         text("name").notNull(),
  description:  text("description"),
  imageUrl:     text("image_url"),
  passwordHash: text("password_hash"),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  ownerUq: uniqueIndex("permanent_rooms_owner_uq").on(t.ownerId),
}));

export type PermanentRoom = typeof permanentRoomsTable.$inferSelect;
