# syntax=docker/dockerfile:1
# Stages: deps → build → runtime (slim, Next standalone) and tools (full deps: migrate / seed / prewarm / eval).
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# next/font downloads Google Fonts at build time and occasionally gets an empty response: retry instead of failing the deploy.
RUN npm run build || (sleep 10 && npm run build) || (sleep 30 && npm run build)
# Chrome extension zip, served by the app at /downloads/bluff-checkout-guard.zip (see /extension). BLUFF_APP_URL is the
# app's public address baked into it (compose passes https://${BASE_DOMAIN}); without it no zip is built and /extension
# shows the build command instead. Declared after `npm run build` so changing it doesn't rebuild Next.
ARG BLUFF_APP_URL=""
RUN mkdir -p extension/release && if [ -n "$BLUFF_APP_URL" ]; then \
      node extension/build.mjs --outdir /tmp/bluff-extension --zip extension/release/bluff-checkout-guard.zip; \
    else echo "BLUFF_APP_URL not set: skipping the Checkout Guard zip"; fi

FROM deps AS tools
COPY . .
ENV NODE_ENV=production
CMD ["npm", "run", "db:migrate"]

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
# Files read from disk at runtime (not traced as imports): mock-agent fixtures, demo storefronts, eval results.
COPY --from=build /app/fixtures ./fixtures
COPY --from=build /app/stores ./stores
COPY --from=build /app/eval/results.json ./eval/results.json
COPY --from=build /app/db ./db
# The Checkout Guard zip (+ its version info), read by app/downloads/bluff-checkout-guard.zip/route.ts. May be empty.
COPY --from=build /app/extension/release ./extension/release
RUN useradd -r -u 1001 bluff && chown -R bluff /app
USER bluff
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=4s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
