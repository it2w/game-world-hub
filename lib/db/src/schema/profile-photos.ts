import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Showcase photos a user pins to their own profile (served from object storage).
export const profilePhotosTable = pgTable(
  "profile_photos",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    // Object path within storage, e.g. "/objects/uploads/<uuid>".
    objectPath: text("object_path").notNull(),
    caption: text("caption"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("profile_photos_user_idx").on(t.userId, t.createdAt),
  }),
);

export type ProfilePhoto = typeof profilePhotosTable.$inferSelect;
