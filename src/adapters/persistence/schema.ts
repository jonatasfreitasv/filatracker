import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Singleton projection/support epoch bookkeeping.
 * Required so getSearchPage can read an authoritative empty catalog slice.
 * No Offer/Merge/Store/PricePoint/FTS schema in Story 1.1.
 */
export const projectionMeta = sqliteTable("projection_meta", {
  id: integer("id").primaryKey().notNull(),
  projectionEpoch: integer("projection_epoch").notNull(),
  supportEpoch: integer("support_epoch").notNull(),
  updatedAt: text("updated_at").notNull(),
});
