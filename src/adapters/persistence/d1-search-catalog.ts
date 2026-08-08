import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import type { SearchCatalogPort } from "../../application/ports";
import { projectionMeta } from "./schema";

export function createD1SearchCatalog(db: D1Database): SearchCatalogPort {
  const orm = drizzle(db);

  return {
    async getEpochs() {
      const row = await orm
        .select()
        .from(projectionMeta)
        .where(eq(projectionMeta.id, 1))
        .get();

      if (!row) {
        throw new Error("projection_meta singleton missing");
      }

      return {
        projectionEpoch: row.projectionEpoch,
        supportEpoch: row.supportEpoch,
      };
    },

    async searchPublished(_query) {
      // Authoritative empty catalog — no Offer tables yet (Stories 1.2–1.4).
      return {
        hits: [],
        totalCount: 0,
        materialFamilySuggestions: [],
      };
    },
  };
}
