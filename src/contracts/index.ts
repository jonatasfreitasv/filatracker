/**
 * SearchPage / SearchHit / query exports (v2 initial contract).
 */

export {
  SEARCH_PAGE_CONTRACT_VERSION,
  SEARCH_QUERY_MAX_SCALARS,
  SEARCH_QUERY_MAX_UTF8_BYTES,
  SEARCH_CURSOR_MAX_UTF8_BYTES,
  SEARCH_PAGE_MAX_HITS,
  SEARCH_PAGE_MAX_SUGGESTIONS,
  SEARCH_PAGE_MAX_STORE_SUPPORT,
  SEARCH_PAGE_MAX_TOKENS,
  SEARCH_TOKEN_MAX_UTF8_BYTES,
  SEARCH_QUALIFICATION_MAX_UTF8_BYTES,
  SEARCH_ERROR_MAX_UTF8_BYTES,
  SEARCH_MAX_ERRORS,
  SEARCH_MAX_TOTAL_COUNT,
  MONEY_CENTAVOS_MAX,
  SEARCH_RPC_MAX_UTF8_BYTES,
  SEARCH_RPC_ENVELOPE_HEADROOM_BYTES,
  DEFAULT_RETRY_AFTER_SECONDS,
  SEARCH_INDEX_VERSION,
  SEARCH_PARSER_VERSION,
  MoneyCentavosSchema,
  MassGramsSchema,
  UtcInstantSchema,
  canonicalizeUtcInstant,
  CorrelationIdSchema,
  AvailabilityDisplaySchema,
  StoreSupportStateDisplaySchema,
  SearchPageQuerySchema,
  SearchPageQueryV2Schema,
  SearchPageSchema,
  SearchPageV2Schema,
  SearchHitSchema,
  SearchHitV2Schema,
  MaterialFamilySuggestionSchema,
  StoreSupportSummarySchema,
  SearchPageRpcOutcomeSchema,
  SearchPageRpcOutcomeV2Schema,
  SearchPageAllowedOutcomeSchema,
  RpcOutcomeKindSchema,
  RpcOutcomeNotFoundSchema,
  RpcOutcomeGoneSchema,
  parseSearchPageQuery,
  decodeSearchPageRpcOutcome,
} from "./search-page";

export type {
  SearchPage,
  SearchPageV2,
  SearchPageQuery,
  SearchPageQueryV2,
  SearchHit,
  SearchHitV2,
  MaterialFamilySuggestion,
  StoreSupportSummary,
  SearchPageRpcOutcome,
  SearchPageRpcOutcomeV2,
  RpcOutcomeKind,
  SearchPageAllowedOutcome,
  RpcEnvelopeMeta,
  AvailabilityDisplay,
} from "./search-page";

export {
  RAW_OFFER_OBSERVATION_CONTRACT_VERSION,
  RAW_OFFER_OBSERVATION_CONTRACT_VERSION_V2,
  RAW_OFFER_OBSERVATION_NO_PREDECESSOR,
  RawOfferObservationSchema,
  RawOfferObservationV1Schema,
  RawOfferObservationV2Schema,
  RawOfferObservationAnySchema,
  RawOfferObservationDecoders,
  AvailabilitySchema,
  PriceEvidenceSchema,
  toObservationV2,
} from "./raw-offer-observation";

export type {
  RawOfferObservation,
  RawOfferObservationV1,
  RawOfferObservationV2,
  Availability,
  PriceEvidence,
} from "./raw-offer-observation";

export {
  STORE_MAP_CONTRACT_VERSION,
  STORE_MAP_NO_PREDECESSOR,
  StoreMapSchema,
  StoreMapDecoders,
} from "./store-map";

export type { StoreMap } from "./store-map";

export {
  STORE_RUN_EVIDENCE_CONTRACT_VERSION,
  STORE_RUN_EVIDENCE_CONTRACT_VERSION_V2,
  STORE_RUN_EVIDENCE_NO_PREDECESSOR,
  StoreRunEvidenceSchema,
  StoreRunEvidenceV1Schema,
  StoreRunEvidenceV2Schema,
  StoreRunEvidenceAnySchema,
  StoreRunEvidenceDecoders,
  StoreRunOutcomeKindSchema,
  FailureCodeSchema,
  BudgetUsageSchema,
} from "./store-run-evidence";

export type {
  StoreRunEvidence,
  StoreRunEvidenceV1,
  StoreRunEvidenceV2,
  StoreRunOutcomeKind,
  FailureCode,
  BudgetUsage,
} from "./store-run-evidence";

export {
  OFFER_CONTRACT_VERSION,
  OFFER_CONTRACT_NO_PREDECESSOR,
  PublishedOfferSchema,
  StagedOfferSchema,
  SpecificTypeSchema,
  MaterialFamilySchema,
  DiameterMmSchema,
  OfferDecoders,
} from "./offer";

export type {
  PublishedOffer,
  StagedOffer,
  SpecificType,
  MaterialFamily,
} from "./offer";

export {
  PRICE_POINT_CONTRACT_VERSION,
  PRICE_POINT_CONTRACT_NO_PREDECESSOR,
  PricePointSchema,
  PricePointDecoders,
  priceTuplesEqual,
} from "./price-point";

export type { PricePoint, PriceTuple } from "./price-point";

export {
  INGESTION_RUN_CONTRACT_VERSION,
  INGESTION_RUN_CONTRACT_NO_PREDECESSOR,
  IngestionRunSchema,
  RunStateSchema,
  PublicationClassSchema,
  LEGAL_RUN_TRANSITIONS,
  TERMINAL_RUN_STATES,
  canTransitionRun,
  isTerminalRunState,
  IngestionRunDecoders,
} from "./ingestion-run";

export type {
  IngestionRun,
  RunState,
  PublicationClass,
  TerminalRunState,
} from "./ingestion-run";

export {
  QUEUE_ENVELOPE_CONTRACT_VERSION,
  QUEUE_ENVELOPE_CONTRACT_NO_PREDECESSOR,
  QueueEnvelopeSchema,
  QueueEnvelopeKindSchema,
  QueueEnvelopeDecoders,
  decodeQueueEnvelope,
} from "./queue-envelope";

export type { QueueEnvelope, QueueEnvelopeKind } from "./queue-envelope";

export {
  STORE_HEALTH_CONTRACT_VERSION,
  STORE_HEALTH_CONTRACT_NO_PREDECESSOR,
  StoreHealthSchema,
  StoreSupportStateSchema,
  PublicationActivationGateSchema,
  StoreLifecycleTransitionSchema,
  LEGAL_SUPPORT_TRANSITIONS,
  canTransitionSupport,
  StoreHealthDecoders,
} from "./store-health";

export type {
  StoreHealth,
  StoreSupportState,
  PublicationActivationGate,
  StoreLifecycleTransition,
  StoreLifecycleActor,
} from "./store-health";
