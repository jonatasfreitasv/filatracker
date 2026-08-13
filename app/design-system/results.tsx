import type { ReactNode } from "react";

import type {
  MaterialFamilySuggestion,
  SearchHit,
} from "../../src/contracts";

function formatBrl(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatMass(grams: number): string {
  if (grams >= 1000 && grams % 1000 === 0) {
    return `${grams / 1000} kg`;
  }
  return `${grams} g`;
}

function formatDiameter(mm: number): string {
  return `${mm.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mm`;
}

function formatFreshness(observedAt: string | null, stale: boolean): string {
  if (observedAt === null || !Number.isFinite(Date.parse(observedAt))) {
    return "Observação desconhecida";
  }
  const absolute = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(observedAt));
  return `${stale ? "Desatualizado" : "Observado"} em ${absolute}`;
}

function availabilityLabel(
  availability: SearchHit["availability"],
): string {
  if (availability === "available") return "Disponível";
  if (availability === "unavailable") return "Indisponível";
  return "Disponibilidade desconhecida";
}

type ResultsTableProps = {
  hits: SearchHit[];
  caption?: string;
};

/** Dense informational Offer results — no CTAs, images, or logos. */
export function ResultsTable({ hits, caption }: ResultsTableProps) {
  return (
    <div
      className="ft-results"
      role="region"
      aria-label="Tabela de resultados rolável"
      tabIndex={0}
    >
      <table className="ft-results-table">
        {caption ? <caption className="ft-visually-hidden">{caption}</caption> : null}
        <thead>
          <tr>
            <th scope="col">Oferta</th>
            <th scope="col">Loja</th>
            <th scope="col">Preço</th>
            <th scope="col">R$/kg</th>
            <th scope="col">Disponibilidade</th>
            <th scope="col">Atualização</th>
          </tr>
        </thead>
        <tbody>
          {hits.map((hit) => (
            <OfferRow key={`${hit.kind}:${hit.id}`} hit={hit} />
          ))}
        </tbody>
      </table>
      <p className="ft-results-disclaimer" role="note">
        Preços de listagem sem frete. Condições finais na loja de destino.
      </p>
    </div>
  );
}

type OfferRowProps = {
  hit: SearchHit;
};

export function OfferRow({ hit }: OfferRowProps) {
  const meta: { label: string; value: string }[] = [];
  if (hit.brandName) meta.push({ label: "Marca", value: hit.brandName });
  if (hit.materialFamily) meta.push({ label: "Material", value: hit.materialFamily });
  if (hit.specificTypeLabel) meta.push({ label: "Tipo específico", value: hit.specificTypeLabel });
  if (hit.color) meta.push({ label: "Cor", value: hit.color });
  if (hit.diameterMm !== null) meta.push({ label: "Diâmetro", value: formatDiameter(hit.diameterMm) });
  if (hit.massGrams !== null) meta.push({ label: "Peso", value: formatMass(hit.massGrams) });

  return (
    <tr className="ft-offer-row" data-result-id={hit.id}>
      <th scope="row" className="ft-offer-title">
        <span className="ft-mobile-label">Oferta</span>
        <span className="ft-offer-title-text">{hit.title}</span>
        {meta.length > 0 ? (
          <span className="ft-offer-meta">
            {meta.map((item) => (
              <span className="ft-offer-meta-item" key={item.label}>
                <span className="ft-meta-label">{item.label}</span>
                {item.value}
              </span>
            ))}
          </span>
        ) : null}
      </th>
      <td><span className="ft-mobile-label">Loja</span>{hit.storeName ?? "—"}</td>
      <td className="ft-mono">
        <span className="ft-mobile-label">Preço</span>
        {hit.listingPriceCentavos !== null
          ? formatBrl(hit.listingPriceCentavos)
          : "—"}
      </td>
      <td className="ft-mono">
        <span className="ft-mobile-label">R$/kg</span>
        {hit.pricePerKgCentavos !== null
          ? formatBrl(hit.pricePerKgCentavos)
          : "—"}
      </td>
      <td><span className="ft-mobile-label">Disponibilidade</span>{availabilityLabel(hit.availability)}</td>
      <td className="ft-mono">
        <span className="ft-mobile-label">Atualização</span>
        {formatFreshness(hit.observedAt, hit.stale)}
      </td>
    </tr>
  );
}

type SuggestionChipsProps = {
  suggestions: MaterialFamilySuggestion[];
};

export function SuggestionChips({ suggestions }: SuggestionChipsProps) {
  if (suggestions.length === 0) return null;
  return (
    <ul className="ft-suggestions" aria-label="Famílias de material publicadas">
      {suggestions.map((s) => (
        <li key={s.id}>
          <a
            className="ft-suggestion-chip"
            href={`/search?q=${encodeURIComponent(s.label)}`}
          >
            {s.label}
          </a>
        </li>
      ))}
    </ul>
  );
}

type QualificationBannerProps = {
  children: ReactNode;
};

export function QualificationBanner({ children }: QualificationBannerProps) {
  return (
    <p className="ft-qualification" role="status" aria-live="polite">
      {children}
    </p>
  );
}
