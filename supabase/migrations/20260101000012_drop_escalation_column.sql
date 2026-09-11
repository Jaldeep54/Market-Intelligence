-- Market Intelligence: remove the 24h pending-approval escalation feature.
-- That feature (a scheduled email to jaldeep.g@goldisolar.com for signups
-- pending over 24h) has been removed entirely -- admin-driven password
-- reset (setUserPasswordAction) replaces self-service reset, and there is
-- no automated reminder/escalation of any kind in the final account model.
-- escalated_at (added in 20260101000011) only ever existed to support that
-- cron job, so it's dropped here rather than left as dead schema.
alter table public.profiles drop column if exists escalated_at;
