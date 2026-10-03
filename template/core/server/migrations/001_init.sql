CREATE TABLE users (
  id serial PRIMARY KEY,
  email text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'editor' CHECK (role IN ('owner', 'editor')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower ON users (lower(email));

CREATE TABLE sessions (
  id_hash text PRIMARY KEY,
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_expires ON sessions (expires_at);

CREATE TABLE pages (
  id serial PRIMARY KEY,
  path text NOT NULL UNIQUE,
  title text NOT NULL DEFAULT '',
  seo jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE blocks (
  id serial PRIMARY KEY,
  page_id int NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  position int NOT NULL,
  type text NOT NULL,
  variant text,
  props jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX blocks_page ON blocks (page_id, position);

-- Whole-page snapshots taken before every save. Cheap, and "undo my last
-- edit" is the support request a lite CMS gets most.
CREATE TABLE page_revisions (
  id serial PRIMARY KEY,
  page_id int NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  snapshot jsonb NOT NULL,
  edited_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX page_revisions_page ON page_revisions (page_id, created_at DESC);

CREATE TABLE site_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  data jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO site_settings (id, data) VALUES (1, '{}');

CREATE TABLE media (
  id serial PRIMARY KEY,
  file text NOT NULL UNIQUE,
  url text NOT NULL,
  alt text NOT NULL DEFAULT '',
  width int,
  height int,
  mime text,
  size bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE form_submissions (
  id serial PRIMARY KEY,
  block_id int REFERENCES blocks(id) ON DELETE SET NULL,
  page_path text,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE redirects (
  from_path text PRIMARY KEY,
  to_path text NOT NULL,
  status int NOT NULL DEFAULT 301
);

-- Collections (blog posts, events, team members) are scaffolded, not built.
-- The tables exist so the shape is settled; /api/collections returns 501.
CREATE TABLE collections (
  id serial PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  item_fields jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE collection_items (
  id serial PRIMARY KEY,
  collection_id int NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  slug text NOT NULL,
  title text NOT NULL,
  props jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  UNIQUE (collection_id, slug)
);
