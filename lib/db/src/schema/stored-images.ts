import { pgTable, uuid, text, customType, timestamp } from "drizzle-orm/pg-core";

// Custom type for BYTEA binary columns
const bytea = customType<{ data: Buffer; notNull: false; default: false }>({
  dataType() {
    return "bytea";
  },
});

export const storedImagesTable = pgTable("stored_images", {
  id: uuid("id").primaryKey().defaultRandom(),
  contentType: text("content_type").notNull(),
  data: bytea("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type StoredImage = typeof storedImagesTable.$inferSelect;
