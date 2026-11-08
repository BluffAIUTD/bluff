-- Crawls are shared across accounts (a recent crawl of a host by anyone is reused): look them up by host alone.
CREATE INDEX IF NOT EXISTS site_scans_host_shared_idx ON site_scans (host, created_at DESC);
