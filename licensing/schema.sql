CREATE TABLE IF NOT EXISTS licenses (
  id uuid PRIMARY KEY,
  key_hash text NOT NULL UNIQUE,
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REVOKED')),
  plan text NOT NULL DEFAULT 'LIFETIME',
  max_devices integer NOT NULL DEFAULT 2,
  created_at timestamptz NOT NULL,
  expires_at timestamptz,
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS license_activations (
  id uuid PRIMARY KEY,
  license_id uuid NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  device_name text NOT NULL,
  app_version text NOT NULL,
  activated_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  revoked_at timestamptz,
  UNIQUE(license_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_license_activations_license ON license_activations(license_id);
CREATE INDEX IF NOT EXISTS idx_licenses_key_hash ON licenses(key_hash);