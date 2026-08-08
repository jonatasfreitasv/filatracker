import { createRequestHandler } from "react-router";

/**
 * Official starter web entry — preserved.
 * Bindings are consumed via `cloudflare:workers` `env` in loaders.
 * Narrowly extended only as needed for the empty-search SSR slice.
 */
const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request) {
    return requestHandler(request);
  },
} satisfies ExportedHandler<Env>;
