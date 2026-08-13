import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createServer, type ViteDevServer } from "vite";

const execFileAsync = promisify(execFile);
const projectRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const wranglerBin = resolve(projectRoot, "node_modules/.bin/wrangler");

async function wrangler(args: string[], persistRoot: string): Promise<void> {
  await execFileAsync(
    wranglerBin,
    [...args, "--local", "--persist-to", persistRoot, "-c", "wrangler.ingest.jsonc"],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        CI: "1",
        WRANGLER_LOG_PATH: resolve(persistRoot, "wrangler.log"),
      },
      maxBuffer: 10 * 1024 * 1024,
      timeout: 60_000,
      killSignal: "SIGTERM",
    },
  );
}

export type LiveAppHarness = {
  baseUrl: string;
  persistenceRoot: string;
  close(): Promise<void>;
};

/** Starts the actual web SSR Worker plus its auxiliary ingest Worker on isolated D1 state. */
export async function startLiveAppHarness(): Promise<LiveAppHarness> {
  const persistenceRoot = await mkdtemp(resolve(tmpdir(), "filatracker-search-e2e-"));
  const previousPersistence = process.env.FILATRACKER_E2E_PERSIST_PATH;
  let server: ViteDevServer | undefined;
  const restoreEnvironment = () => {
    if (previousPersistence === undefined) {
      delete process.env.FILATRACKER_E2E_PERSIST_PATH;
    } else {
      process.env.FILATRACKER_E2E_PERSIST_PATH = previousPersistence;
    }
  };

  try {
    await wrangler(["d1", "migrations", "apply", "filatracker-local"], persistenceRoot);
    await wrangler(
      ["d1", "execute", "filatracker-local", "--file", "tests/e2e/search-seed.sql", "--yes"],
      persistenceRoot,
    );

    process.env.FILATRACKER_E2E_PERSIST_PATH = persistenceRoot;
    server = await createServer({
      root: projectRoot,
      logLevel: "error",
      server: { host: "127.0.0.1", port: 0, strictPort: false },
    });
    await server.listen();
    const address = server.httpServer?.address();
    if (!address || typeof address === "string") {
      throw new Error("live_app_port_unavailable");
    }

    let closePromise: Promise<void> | undefined;
    return {
      baseUrl: `http://127.0.0.1:${address.port}`,
      persistenceRoot,
      async close() {
        closePromise ??= (async () => {
          try {
            await server?.close();
          } finally {
            restoreEnvironment();
            await rm(persistenceRoot, { recursive: true, force: true });
          }
        })();
        return closePromise;
      },
    };
  } catch (error) {
    try {
      await server?.close();
    } finally {
      restoreEnvironment();
      await rm(persistenceRoot, { recursive: true, force: true });
    }
    throw error;
  }
}
