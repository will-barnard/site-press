CREATE TABLE users (
  id serial PRIMARY KEY,
  email text NOT NULL,
  password_hash text NOT NULL,
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower ON users (lower(email));

CREATE TABLE sessions (
  id_hash text PRIMARY KEY,
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed', 'cancelled')),
  stage text,
  progress real NOT NULL DEFAULT 0,
  options jsonb NOT NULL DEFAULT '{}',
  summary jsonb,
  error text,
  worker text,
  cancel_requested boolean NOT NULL DEFAULT false,
  created_by int REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);
CREATE INDEX jobs_queue ON jobs (status, created_at);

CREATE TABLE job_events (
  id bigserial PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  at timestamptz NOT NULL DEFAULT now(),
  stage text,
  level text NOT NULL DEFAULT 'info',
  message text NOT NULL,
  data jsonb
);
CREATE INDEX job_events_job ON job_events (job_id, id);
