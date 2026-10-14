CREATE TABLE tenants (
 id UUID PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
 retention_days INTEGER NOT NULL DEFAULT 7 CHECK (retention_days >= 7), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE users (
 id UUID PRIMARY KEY, tenant_id UUID NOT NULL REFERENCES tenants(id), email TEXT NOT NULL UNIQUE CHECK (email = lower(trim(email))),
 password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('admin','viewer')),
 is_active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
 sid TEXT PRIMARY KEY, user_id UUID REFERENCES users(id) ON DELETE CASCADE, data JSONB NOT NULL DEFAULT '{}',
 expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE events (
 id UUID PRIMARY KEY, tenant_id UUID NOT NULL REFERENCES tenants(id), event_timestamp TIMESTAMPTZ NOT NULL,
 received_at TIMESTAMPTZ NOT NULL DEFAULT now(), source TEXT NOT NULL CHECK (source IN ('firewall','network','api','crowdstrike','aws','m365','ad')),
 vendor TEXT, product TEXT, event_type TEXT NOT NULL, event_subtype TEXT,
 severity SMALLINT NOT NULL CHECK (severity BETWEEN 0 AND 10), action TEXT,
 outcome TEXT CHECK (outcome IN ('success','failure','unknown')), src_ip INET, dst_ip INET,
 src_port INTEGER CHECK (src_port BETWEEN 0 AND 65535), dst_port INTEGER CHECK (dst_port BETWEEN 0 AND 65535),
 protocol TEXT, user_name TEXT, host TEXT, process TEXT, url TEXT, http_method TEXT,
 status_code INTEGER CHECK (status_code BETWEEN 100 AND 599), rule_name TEXT, source_rule_id TEXT,
 cloud_account_id TEXT, cloud_region TEXT, cloud_service TEXT, raw TEXT NOT NULL,
 tags TEXT[] NOT NULL DEFAULT '{}', attributes JSONB NOT NULL DEFAULT '{}', parser_version TEXT NOT NULL,
 UNIQUE (tenant_id,id)
);
CREATE INDEX events_tenant_time ON events(tenant_id,event_timestamp DESC,id DESC);
CREATE INDEX events_tenant_source ON events(tenant_id,source,event_timestamp DESC);
CREATE INDEX events_tenant_ip ON events(tenant_id,src_ip,event_timestamp DESC);
CREATE INDEX events_tenant_user ON events(tenant_id,user_name,event_timestamp DESC);
CREATE INDEX events_received ON events(received_at);
CREATE TABLE api_keys (
 id UUID PRIMARY KEY, tenant_id UUID NOT NULL REFERENCES tenants(id), name TEXT NOT NULL,
 key_prefix TEXT NOT NULL, key_hash TEXT NOT NULL UNIQUE, allowed_sources TEXT[] NOT NULL,
 revoked_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK (cardinality(allowed_sources) > 0 AND allowed_sources <@ ARRAY['firewall','network','api','crowdstrike','aws','m365','ad']::text[])
);
CREATE TABLE alert_rules (
 id UUID PRIMARY KEY, tenant_id UUID NOT NULL REFERENCES tenants(id), name TEXT NOT NULL,
 rule_type TEXT NOT NULL CHECK (rule_type = 'failed_login'), threshold INTEGER NOT NULL CHECK (threshold > 0),
 window_seconds INTEGER NOT NULL CHECK (window_seconds > 0), enabled BOOLEAN NOT NULL DEFAULT true,
 created_by UUID NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (tenant_id,id)
);
CREATE INDEX rules_tenant_enabled ON alert_rules(tenant_id,enabled);
CREATE TABLE alerts (
 id UUID PRIMARY KEY, tenant_id UUID NOT NULL REFERENCES tenants(id), rule_id UUID NOT NULL,
 group_key TEXT NOT NULL, observed_count INTEGER NOT NULL CHECK (observed_count > 0),
 window_start TIMESTAMPTZ NOT NULL, window_end TIMESTAMPTZ NOT NULL,
 first_seen TIMESTAMPTZ NOT NULL, last_seen TIMESTAMPTZ NOT NULL,
 status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','closed')), details JSONB NOT NULL DEFAULT '{}',
 UNIQUE (tenant_id,id), FOREIGN KEY (tenant_id,rule_id) REFERENCES alert_rules(tenant_id,id),
 CHECK (window_start < window_end), CHECK (first_seen <= last_seen)
);
CREATE INDEX alerts_tenant_seen ON alerts(tenant_id,last_seen DESC);
CREATE TABLE alert_state (
 tenant_id UUID NOT NULL REFERENCES tenants(id), rule_id UUID NOT NULL, group_key TEXT NOT NULL,
 last_triggered_at TIMESTAMPTZ NOT NULL, active_alert_id UUID,
 PRIMARY KEY (tenant_id,rule_id,group_key), FOREIGN KEY (tenant_id,rule_id) REFERENCES alert_rules(tenant_id,id),
 FOREIGN KEY (tenant_id,active_alert_id) REFERENCES alerts(tenant_id,id)
);
