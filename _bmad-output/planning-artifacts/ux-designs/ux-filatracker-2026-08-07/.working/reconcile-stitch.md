# Stitch ↔ PRD reconcile — FilaTracker UX (2026-08-07)

Sources: five Stitch HTML mockups under `stitch_filatracker_brazil_filament_comparison/`, `filatracker/DESIGN.md`, `.working/source-extract-prd.md`. PRD spines win on product/IA conflicts; Stitch is inspirational for density/layout only where aligned.

---

## Surfaces found (map folder → IA surface)

| Stitch folder | Maps to PRD IA surface | Notes |
|---------------|------------------------|--------|
| `in_cio_filatracker/` | **Home** | Search-first hero + Material Family chips; decorative ticker |
| `resultados_de_busca_filatracker/` | **Search results** | Sidebar filters + dense offer table |
| `detalhes_do_filamento_filatracker/` | **Offer / Merge detail** | Multi-store comparison + price-history panel |
| `sem_resultados_filatracker/` | **Search empty state** | Explicit empty (not error page) + material chips |
| `materiais_filatracker/` | **Browse: Material Family** | Educational bento “catálogo” (see Conflicts) |

**Referenced in chrome but not mocked:** nav link **Marcas** → PRD **Browse: Brand** (no HTML folder).

**Shared chrome across all pages:** fixed header (logo `FilaTracker`, persistent search, Materiais, Marcas, person avatar); footer with frete legal + affiliate disclosure placeholder.

---

## What to keep (aligned with PRD)

- **Search-first Home** with optional **Material Family quick-entry chips** (PLA, PETG, ASA, ABS, TPU…) — matches PRD Home IA; no product photography.
- **Offer-centric results**: dense table/list of Offers with brand, Specific Type, color as display, weight, Store as **text name**, Listing Price, R$/kg, availability badge, outbound control.
- **Filter groups** present in spirit: Marca, Tipo Específico, Peso, Faixa de Preço; **“Apenas em estoque”** toggle; sort **Menor preço** / **R$/kg** (plus “Mais recentes” as freshness-adjacent).
- **Status badges** vocabulary aligned with DESIGN: `DISPONÍVEL`, `INDISPONÍVEL`, `PROMOÇÃO` / `PROMOCIONAL` pattern; promo strikethrough only when an original price is shown.
- **Frete / conditions disclaimer** near results ranking and under detail comparison (“Frete e condições…”, detail copy that prices exclude frete + 48h stale callout).
- **Footer legal + affiliate disclosure placeholder** — matches Legal/trust need; merchants remain purchase surface.
- **Detail comparison table**: Loja, Preço, R$/kg, Status, Atualizado, outbound; **>48h / stale** qualification on a row.
- **Price history panel** on detail (basic chart) — keep *pattern*, but bind to **per Offer URL** (see Conflicts).
- **Empty state** as dedicated surface: honest “Não encontramos…” + suggestions that are **Material Family chips**, not fabricated substitute Offers.
- **Zero-image / Store-as-text** intent in results+detail tables (no product photos, no Store logo chrome).
- **pt-BR + BRL**; dual type system (**Hanken Grotesk** UI + **JetBrains Mono** for prices/specs); density / “data over decoration” principles stated in DESIGN.md Brand & Style.
- **Desktop results layout**: ~3-col filter sidebar + ~9-col table (matches DESIGN layout guidance).
- **Outbound external-link affordance** (`open_in_new`) signaling leave-to-merchant.

---

## Conflicts with PRD (spines win — list each; propose drop/override)

1. **Account / person avatar in header**  
   PRD: fully anonymous; no auth/accounts.  
   **Drop** avatar and any account affordance.

2. **Home hero “melhor preço” + detail “MENOR PREÇO” without always-on frete caveat at the claim**  
   PRD: frete disclaimer wherever ranking / “cheapest” language appears; avoid clickbait “guaranteed lowest / including frete.” Home hero has no frete line next to the claim (only footer).  
   **Override** copy to comparison-tool framing; place frete disclaimer adjacent to any “menor/melhor preço” callout.

3. **“Comparação em tempo real”** (Home subcopy)  
   PRD: no live scrape on search; freshness is batch / last-checked.  
   **Override** to honest freshness language (e.g. last verified / index update), never “tempo real.”

4. **Home marquee: `STORES: 14 ACTIVE`, AVG PLA/PETG, SKU index ticker**  
   PRD MVP coverage ~five specialty Stores; must not claim inflated “N lojas”; Home must not be deal/market rails.  
   **Drop** marquee / aggregate “best of market” strip entirely (or replace with non-claiming, accurate coverage only if product ops confirm).

5. **Mercado Livre / Amazon (and similar marketplaces) as Stores in mock data**  
   PRD: specialty BR stores outside ML; ML/marketplace aggregation out of MVP.  
   **Drop** from v1 store set and mock content; use specialty Stores only (Closin, Voolt3D, 3D Colors, F3D, Topink3D, etc.).

6. **CTA label `VER` / `Ver Loja` / `Esgotado`**  
   PRD locked CTA: **Ver na loja** (outbound redirect).  
   **Override** all outbound labels to **Ver na loja**; do not replace with “Esgotado” as the only action on a row.

7. **OOS / unavailable rows with disabled outbound**  
   PRD: availability + last-checked visible; user may pick another Offer; Unmatched remain outbound-capable. Disabling leave-to-merchant fights honesty and SM-1.  
   **Override**: keep badge + de-emphasize row; still allow **Ver na loja** (merchant may clarify stock).

8. **`POUCO ESTOQUE` as a third stock state**  
   PRD availability model: in-stock vs OOS (+ stale freshness). Partial stock not specified.  
   **Drop** or map into DISPONÍVEL / store-supplied note only if data exists; do not invent scarcity UX.

9. **Detail price history as Merge-level 30-day chart + Média / Variação %**  
   PRD: basic history **per Offer URL** when history exists; **per-Merge aggregated charts out of MVP**; never invent % from history for promo.  
   **Override**: chart scoped to selected Offer URL; empty/insufficient-history state when missing; drop Merge-aggregate average/% as primary MVP UI.

10. **Materiais page as educational “Catálogo Técnico” bento (difficulty meters, nozzle temps, essays, Compósitos e Exóticos)**  
    PRD: Browse Material Family = reach Offers without login; anti-vitrine / not showcase encyclopedia; density hard constraint.  
    **Override** to dense Material Family index → filtered results (counts/offers entry). **Drop** difficulty meters, long educational copy, exotic marketing cards as primary IA (optional later content, not MVP spine).

11. **Home marketing chrome: glass blur header, shadow-xl pill search, animated SVG grid, “Engine v2.4” eyebrow**  
    PRD anti-refs: massive hero / glassmorphism / giant cards; comparison tool not landing page.  
    **Override** toward flatter, denser search-first shell; **drop** decorative engine versioning and heavy motion as required UI.

12. **Missing Default Diameter Filter (1.75 mm + unknown)**  
    PRD mandatory default; known non-1.75 excluded until cleared.  
    **Add** (not in Stitch filters) — spine gap in mockups.

13. **Brand vs Store conflation in filters** (e.g. “Voolt3D” under Marca while also Store name)  
    PRD separates Brand (Merge key) from Store (merchant text).  
    **Override** filter taxonomy: Marca = filament brand; Loja = Store name (optional filter).

14. **Detail claim “Comparação de preços em 5 lojas”**  
    Allowed only when coverage is true; PRD: if &lt;5 active, must not claim “5 lojas.”  
    **Override** to dynamic/accurate coverage copy.

15. **Results CTA color inconsistency + black primary buttons vs DESIGN “Technical Blue” CTA**  
    Product CTA is Ver na loja; visual token conflict is DESIGN.md issue (below), but black `VER` on results vs `#0ea5e9` “Ver Loja” on detail must be unified in EXPERIENCE/VISUAL.

16. **Always-on affiliate footer**  
    PRD: disclose when affiliates on; until then honest that merchants sell.  
    **Override** copy timing: keep placeholder pattern; don’t imply active affiliate program before tags exist.

---

## DESIGN.md token issues (e.g. frontmatter vs body color mismatch — Stitch body says Primary #0F172A but frontmatter primary #000000)

| Issue | Frontmatter / HTML Tailwind | DESIGN.md body prose | HTML mockup behavior |
|-------|-----------------------------|----------------------|----------------------|
| **Primary** | `#000000` | **Primary (#0F172A)** deep text/headers | Logo/text use `text-primary` → black; not slate-900 |
| **Secondary** | `#515f74` | **Secondary (#334155)** | Mixed; M3 secondary-container blues appear |
| **Tertiary / CTA blue** | tertiary `#000000`; `on-tertiary-container` `#008cc7` | **Tertiary (#0EA5E9)** for interactive/CTAs | Detail CTAs **hardcode `#0ea5e9`**; results CTAs use **black primary** |
| **Canvas / background** | `#f7f9fb` | Neutral **#F8FAFC** | Uses frontmatter background |
| **Outlines / elevation colors** | outline `#76777d`, outline-variant `#c6c6cd` | Borders **#E2E8F0**; Level 1 **#F1F5F9** | Mostly M3 outline-variant; not slate border tokens |
| **Functional stock colors** | Only Material error `#ba1a1a` in tokens | Em estoque **#059669**, OOS **#DC2626**, trend **#D97706** | Badges use ad-hoc greens/reds/ambers (`#2e7d32`, `#c62828`, `#166534`, etc.) — not tokenized |
| **Shadows / blur** | N/A (tokens don’t define elevation) | **Rejects shadows and blurs**; tonal layering + 1px outlines | Widespread `shadow-sm`/`shadow-xl`, `backdrop-blur-md`, glow blurs — **body principle violated by HTML** |
| **Border radius** | YAML: sm 0.125 / DEFAULT 0.25 / full **9999px**; HTML config maps DEFAULT→`0.125rem`, `full`→`0.75rem` | Soft 4px controls; pills only for filter chips | Pill mega-search + chips use `rounded-full` but Tailwind `full` is **0.75rem**, not true pill — **config bug** |
| **Row height** | dense 32 / standard 48 | Components section: table rows **40px** | Results rows are padded flex (~48-ish), not locked 40 |
| **Button primary** | primary black | Primary buttons = **Technical Blue + white** | Split: black vs `#0ea5e9` |
| **Selection chips** | — | Fully rounded pills for active filters | Home chips often `rounded-lg`, not pills |

**Reconcile recommendation for VISUAL.md:** Treat **body slate industrial palette** (`#0F172A` / `#334155` / `#0EA5E9` / `#F8FAFC` + functional greens/reds) as the intended product look; treat YAML/HTML M3 black-primary export as Stitch codegen artifact. Normalize CTA to Technical Blue; strip shadow/blur to match “rejects shadows” rule; fix `rounded.full` to true pill if chips need it; tokenize badge colors; pick one row height (prefer 40 or dense 32 consistently).

---

## Behavioral patterns for EXPERIENCE.md

Carry forward as interaction patterns (after PRD overrides above):

1. **Global shell:** persistent header search + Materiais / Marcas browse entry; footer frete + (conditional) affiliate honesty.
2. **Home job:** one primary search field + Material Family chips as secondary entry; land in results filtered by family.
3. **Results job:** filter sidebar (desktop) / collapse pattern (tablet+ per DESIGN); result count; stock-first toggle; sort by Listing Price or R$/kg; dense Offer rows with color swatch + type label; frete footnote under table; row hover = background shift only.
4. **Outbound:** compact **Ver na loja** + external icon; leave via internal redirect (not raw merchant href alone).
5. **Detail job:** identity header (Specific Type + weight badges, brand+type title); multi-Offer comparison table sorted with in-stock above OOS; show last-checked; mark stale (&gt;48h); frete disclaimer under ranking table; history when Offer has data.
6. **Empty job:** clear no-match message; suggest broader Material Family entry points; **do not** invent Offers.
7. **Promo display:** strikethrough original only when Store-supplied original &gt; Listing Price.
8. **R$/kg:** show under price when weight known; omit when unknown (never invent).
9. **Status badges:** DISPONÍVEL / INDISPONÍVEL / optional PROMOCIONAL; avoid unverified scarcity states.
10. **Density:** tables/lists over cards for comparison surfaces; cards only if needed for Material Family browse entry (minimal).

---

## Missing surfaces vs PRD IA

| PRD surface | In Stitch? | Gap |
|-------------|------------|-----|
| Home | Yes | Needs de-marketing / coverage honesty |
| Search results | Yes | Add diameter default; brand vs store; CTA copy |
| Empty results | Yes | Keep; tighten suggestion rules |
| Offer / Merge detail | Yes | Per-Offer history; history-empty state missing |
| Browse: Material Family | Partial | Exists as catalog; needs IA reshape to browse→offers |
| **Browse: Brand** | **No** (nav only) | **Missing mockup** |
| **/stores** index | **No** | Optional v1 — undecided |
| Legal/trust | Footer only | No dedicated page; may be enough for MVP |
| History empty / insufficient | **No** | Required by PRD when no history |
| Unmatched vs Merged education | **No** | Behavior locked; UI labeling unspecified — still a UX gap |
| Coverage messaging when &lt;5 Stores | **No** | Must not hardcode “5” / “14” |

---

## Qualitative ideas dropped

Stitch flourishes that are **not** carried into MVP UX (dropped as decoration or anti-spine):

- Animated technical grid / extrusion SVG backgrounds (Home, Empty).
- “FilaTracker Engine v2.4” editorial eyebrow.
- Home **marquee ticker** (SKU counts, avg R$/kg by family, inflated store counts).
- Glassmorphic / blurred / shadow-lift **mega pill search** and focus glow.
- Person / account circle in nav.
- Materials **bento catalog** with difficulty meters, nozzle-temp education, animated flex waves, Compósitos e Exóticos marketing tiles.
- Soft blur orbs and gradient headline treatments on Materiais.
- Pulse “live” chip treatment (e.g. PETG-CF).
- **POUCO ESTOQUE** scarcity badge.
- Merge-level **Média / Variação −4.2%** history summary as primary detail widget.
- Disabled / “Esgotado” replacing outbound on OOS rows.
- Marketplace Store names (ML, Amazon) as demo data.
- Heavy card hover lift (`-translate-y`, shadow-xl) on browse surfaces.

**Keep as optional later (not MVP):** richer material education content; true `/stores` trust index; polish motion — only if they don’t reopen vitrine or false-coverage risks.

---

## Verdict (for downstream UX docs)

Stitch correctly sketches the **comparison-tool spine** (search → dense Offer table → multi-store detail → empty state → material browse entry) and the **legal/frete honesty** footer pattern. It drifts into **marketing home**, **educational vitrine browse**, **marketplace demo Stores**, **account chrome**, and **token/CTA inconsistency**. Reconcile by keeping density + table/filter/outbound behaviors, rewriting claims to PRD honesty rules, adding Brand browse + diameter default + per-Offer history empty, and aligning VISUAL tokens to the DESIGN.md **body** slate/Technical Blue system—not the black M3 frontmatter export.
