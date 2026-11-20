-- Add school schedule windows and Pi-hole config to companion limits
ALTER TABLE companion_limits
  ADD COLUMN IF NOT EXISTS scheduled_pauses JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pihole_url TEXT,
  ADD COLUMN IF NOT EXISTS pihole_password TEXT;

COMMENT ON COLUMN companion_limits.scheduled_pauses IS 'Array of {start,end,days} school schedule windows in Denver time.';
COMMENT ON COLUMN companion_limits.pihole_url IS 'Local Pi-hole base URL, e.g. http://192.168.1.100';
COMMENT ON COLUMN companion_limits.pihole_password IS 'Pi-hole web admin password (used by companion over LAN only).';
