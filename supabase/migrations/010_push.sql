-- Web Push: one row per browser endpoint. Idempotent.
create unique index if not exists push_subscriptions_endpoint_key on push_subscriptions(endpoint);
