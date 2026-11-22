-- Several profiles in one account (docs/profiles-plan.md). Run once in the D1 Console, before the new code is merged.
-- kind: every profile that exists now becomes an adult. name_key: the name as compared (see src/sync/profiles.ts), so two names that
-- differ only by case cannot both exist in an account; an empty key is filled in by the server the first time a profile is added.
-- pin_hash: the adult PIN lock, used from the second slice of the plan; nothing reads or writes it yet.
ALTER TABLE profiles ADD COLUMN kind TEXT NOT NULL DEFAULT 'adult' CHECK (kind IN ('adult', 'kid'));
ALTER TABLE profiles ADD COLUMN name_key TEXT NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN pin_hash TEXT CHECK (pin_hash IS NULL OR kind = 'adult');
UPDATE profiles SET name_key = lower(name);
CREATE UNIQUE INDEX profiles_account_name ON profiles (account_id, name_key);
