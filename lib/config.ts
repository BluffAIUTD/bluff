/** Typed env access. Read lazily so tests can mutate process.env. */
const DEV_SECRET = "dev-insecure-secret";

export const MAYA_ID = "00000000-0000-4000-8000-000000000001";
export const EVAL_USER_ID = "00000000-0000-4000-8000-0000000000e1";

export type Config = ReturnType<typeof getConfig>;

export function getConfig() {
  const env = process.env;
  const isProd = env.NODE_ENV === "production";
  const sessionSecret = env.SESSION_SECRET || DEV_SECRET;
  return {
    isProd,
    agentMode: (env.AGENT_MODE === "live" ? "live" : "mock") as "live" | "mock",
    demoMode: env.DEMO_MODE !== "0",
    baseDomain: env.BASE_DOMAIN || "localhost:3000",
    sessionSecret,
    demoKey: env.DEMO_KEY || (isProd ? "" : "demo"),
    evalKey: env.EVAL_KEY || (isProd ? "" : "eval"),
    mockSpeed: env.MOCK_SPEED === undefined ? 1 : Number(env.MOCK_SPEED),
    databaseUrl: env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/bluff",
    nvidia: {
      baseUrl: env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1",
      apiKey: env.NVIDIA_API_KEY || "",
      model: env.NEMOTRON_MODEL || "",
      smallModel: env.NEMOTRON_SMALL_MODEL || env.NEMOTRON_MODEL || "",
      embedModel: env.EMBED_MODEL || "",
      /** "off" sends chat_template_kwargs.enable_thinking=false (Nemotron 3.x); unset leaves the model default. */
      thinking: env.NEMOTRON_THINKING === "off" ? "off" : "default",
    },
    rdapEnabled: env.RDAP_ENABLED === "1",
    nessie: {
      baseUrl: env.NESSIE_BASE_URL || "https://api.nessieisreal.com",
      apiKey: env.NESSIE_API_KEY || "",
      customerId: env.NESSIE_CUSTOMER_ID || "",
    },
  };
}

/** Throws on unsafe production configuration. Called from the session layer on first use. */
export function assertProductionConfig(c: Config = getConfig()) {
  if (!c.isProd) return;
  if (c.sessionSecret === DEV_SECRET || c.sessionSecret === "change-me-in-production") {
    throw new Error("SESSION_SECRET must be set to a unique value in production");
  }
}

/** True when live mode is requested but its credentials are missing (caller falls back to mock and warns). */
export function liveAgentAvailable(c: Config = getConfig()) {
  return c.agentMode === "live" && !!c.nvidia.apiKey && !!c.nvidia.model;
}

/**
 * Canonical public address of the app. The app is served at the apex BASE_DOMAIN (https://bluffai.us; bluff.<domain>
 * redirects there) and the demo storefronts at <slug>.<BASE_DOMAIN>. Locally: http://localhost:3000.
 * APP_URL overrides it (no trailing slash).
 */
export function appOrigin(c: Config = getConfig()): string {
  const override = process.env.APP_URL?.trim();
  if (override) return override.replace(/\/+$/, "");
  const host = c.baseDomain.toLowerCase();
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) || /\.localhost(:\d+)?$/.test(host) || /\.test(:\d+)?$/.test(host);
  return `${local ? "http" : "https"}://${host}`;
}

/** Host part of appOrigin() ("bluffai.us", "localhost:3000"), used in share texts and SMS bodies. */
export function appHost(c: Config = getConfig()): string {
  return appOrigin(c).replace(/^https?:\/\//, "");
}

/** Public URL of one of Bluff's own demo storefronts: https://fastkicks-shop.bluffai.us (http://fastkicks-shop.localhost:3000 locally). */
export function storeOrigin(slug: string, c: Config = getConfig()): string {
  const o = new URL(appOrigin(c));
  return `${o.protocol}//${slug}.${o.host}`;
}
