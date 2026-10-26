-- Campus Spaces budget counts participant-minutes (people × minutes), the way LiveKit bills.
-- Each finished session adds its seconds to the Lagos day it ended on; open sessions are
-- counted live from space_members.joined_at.

CREATE TABLE IF NOT EXISTS space_usage_days (
    day DATE PRIMARY KEY,
    participant_seconds BIGINT NOT NULL DEFAULT 0 CHECK (participant_seconds >= 0)
);

