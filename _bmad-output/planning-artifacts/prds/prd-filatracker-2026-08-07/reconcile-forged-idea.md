# Reconcile: forged-idea → PRD + addendum

**Input:** `_bmad-output/forge/filament-price-spec/forged-idea.md`  
**Against:** `prd.md` + `addendum.md` (`prd-filatracker-2026-08-07`)  
**Date:** 2026-08-07  
**Lens:** Ideas in input that are missing or contradicted in PRD/addendum — especially qualitative tone/feel drops.

---

## Coverage summary

| Forge section | Status vs PRD/addendum |
|---------------|------------------------|
| Multi-loja BR, pt-BR/BRL; specialty ≠ ML; taxonomy + R$/kg; não frete | Covered (§1, §4.1–4.2, §5, §6) |
| Day-1 = ofertas pesquisáveis; catálogo canônico = direção | Covered (§1, §4.3, §6.2, addendum B) |
| ML fora MVP; mínimo 5 lojas especializadas | Covered (§4.6, §6.1; list named beyond forge) |
| Merge: marca + tipo específico + peso; cor fora | Covered (§3 Merge, FR-9) |
| Tipos separados; família-pai inclui subtipos | Covered (FR-2, FR-9) |
| Frete fora; ranking = preço anúncio + disclaimer | Covered (FR-6, §5) |
| Sem imagens; loja = nome texto; UI densa/objetiva | Mostly covered (FR-5, §12) — see Gap G3 |
| Scrape determinístico + mapa versionado; AI offline; homologação; unsupported; sem bypass | Covered (addendum A, §5, FR-14–15) |
| Rejeitados (catálogo maduro, frete, imagens/logos, ML, adapter artesanal único, LLM runtime, auto-reparo) | Covered (addendum B, §5) |
| Sem AI no match MVP | **Missing as explicit lock** — Gap G1 |
| Diâmetro na chave de merge (ainda aberto) | **Contradicted** — Gap G2 |
| Lista 5 lojas / formato mapa / monetização (ainda aberto) | Resolved or deferred (not missing forge intent) |

---

## Gaps (severity-ranked)

### G1 — Medium — Policy missing: “Sem AI no match do MVP”

**Input:** Merge/taxonomia — *“Sem AI no match do MVP.”*  
**PRD/addendum:** Deterministic Merge rules (FR-9); LLM banned at **scrape runtime** only (§5, addendum A/B). No explicit rejection of AI/LLM for Offer match/Merge. FR-10 language (*“Match confidence”*) can be read as inviting scored/ML matching later.  
**Risk:** Implementers treat “no AI” as scrape-only and add ML matching without a product decision.  
**Feel:** Forge’s hard cut on matching honesty is softer in PRD.

### G2 — Medium — Contradiction: diameter still open vs closed

**Input:** Ainda aberto — *“Diâmetro na chave de merge.”*  
**PRD/addendum:** Diameter **out** of Merge key (§3, FR-4/FR-9); addendum B — *“Diameter in Merge key | Rejected (user)”*.  
**Risk:** Forge SoT and PRD disagree on open vs decided; re-litigation or stale forge doc.  
**Note:** If PRD decision is intentional override, forge “Ainda aberto” should be closed to match.

### G3 — Medium — Qualitative tone drop: “não vitrine” / direta–objetiva–densa

**Input:** Valor — *“…não frete, não vitrine.”* UI — *“direta, objetiva, densa.”*  
**PRD:** §12 restates dense/objective/comparison-tool-not-storefront; FR-5 bans images/logos. Also expands browse IA (brand/family), price history chart, optional `/stores`, competitive narrative — denser product surface than forge’s stark anti-vitrine one-liner.  
**Risk:** UX drifts toward catalog/browse “vitrine” feel while still meeting literal non-goals (no photos/logos).  
**Feel:** Paired negation (*não frete / não vitrine*) and punchy density mandate are diluted into softer aesthetic guidance.

### G4 — Low — Traceability: anti-bot §81 anchor dropped

**Input:** *“sem bypass anti-bot (§81).”*  
**PRD/addendum:** Policy retained (no CAPTCHA/bypass → Unsupported); raw_plan §81 cross-reference omitted.  
**Risk:** Weak link back to raw_plan rationale when cutting tech draft.

### G5 — Low — Open “formato exato do mapa” not mirrored in PRD open questions

**Input:** Ainda aberto — exact map format.  
**PRD/addendum:** Mechanism deferred (addendum A/D); §8 open questions omit map-format lock.  
**Risk:** Minor; architecture owns it, but forge open item has no PRD §8 counterpart.

---

## Non-gaps (resolved beyond forge — for awareness)

- **Five named stores** — forge left list open; PRD §6.1 / addendum C named Closin, Voolt3D, 3D Colors, F3D, Topink3D.
- **Monetization/afiliado** — forge open; PRD §11 affiliate-ready, not day-1 revenue dependency.
- **Price history chart** — not in forge; PRD launch feature (memlog override). Addition, not an input→PRD omission.

---

## Suggested PRD/addendum fixes (if reconciling toward forge)

1. Add non-goal / addendum B row: **No AI/LLM in Offer match or Merge for MVP** (deterministic rules only); tighten FR-10 wording away from ambiguous “confidence” if it implies ML.
2. Either update forge “Ainda aberto” to close diameter, or flag G2 as intentional PRD override in memlog.
3. Strengthen §12 / value line with forge pairing: **não frete, não vitrine** — comparison tool, not showcase; keep density as a hard UI constraint, not only tone copy.
4. Optional: cite raw_plan §81 next to anti-bot policy; add map-format to §8 or explicitly “owned by architecture.”

---

## Verdict

Forge product spine (offers-first specialty search, taxonomy honesty, frete/images/ML out, scrape homologation model) is largely in PRD + addendum. Material gaps are **G1** (AI-in-match lock), **G2** (diameter open vs rejected), and **G3** (anti-vitrine / dense-UI feel softened).
