-- RedAnt schema for Supabase (Postgres)
-- Run this first in Supabase -> SQL Editor, then run data.sql

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE,
  password_hash TEXT,
  role TEXT DEFAULT 'Admin',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS offers (
  id SERIAL PRIMARY KEY,
  label TEXT,
  offer_price INTEGER,
  regular_price INTEGER,
  active INTEGER DEFAULT 1,
  end_date TEXT
);

CREATE TABLE IF NOT EXISTS services (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE,
  name TEXT,
  short_desc TEXT,
  long_desc TEXT,
  price_from INTEGER,
  features_json TEXT,
  not_included_json TEXT,
  process_json TEXT,
  icon TEXT,
  path_card_text TEXT,
  order_num INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS pricing_plans (
  id SERIAL PRIMARY KEY,
  name TEXT,
  price TEXT,
  billing_type TEXT,
  badge TEXT,
  features_json TEXT,
  order_num INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE,
  name TEXT,
  url TEXT,
  industry TEXT,
  region TEXT,
  "desc" TEXT,
  initial TEXT,
  featured INTEGER DEFAULT 1,
  preview_allowed INTEGER DEFAULT 1,
  built_at_webpixel INTEGER DEFAULT 0,
  case_study_json TEXT,
  order_num INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS testimonials (
  id SERIAL PRIMARY KEY,
  client_name TEXT,
  business TEXT,
  town TEXT,
  quote TEXT,
  rating INTEGER DEFAULT 5,
  featured INTEGER DEFAULT 1,
  order_num INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS industries (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE,
  name TEXT,
  intro TEXT,
  problems_json TEXT,
  cta_text TEXT,
  order_num INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS blog_posts (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE,
  title TEXT,
  excerpt TEXT,
  body TEXT,
  category TEXT,
  publish_date TEXT,
  status TEXT DEFAULT 'published'
);

CREATE TABLE IF NOT EXISTS faqs (
  id SERIAL PRIMARY KEY,
  question TEXT,
  answer TEXT,
  category TEXT,
  order_num INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,
  name TEXT,
  business TEXT,
  url TEXT,
  email TEXT,
  phone TEXT,
  message TEXT,
  source TEXT,
  landing_page_slug TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  status TEXT DEFAULT 'New',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS landing_pages (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE,
  title TEXT,
  headline TEXT,
  subtext TEXT,
  cta_text TEXT,
  price_from INTEGER,
  ad_version INTEGER DEFAULT 0,
  blocks_json TEXT,
  status TEXT DEFAULT 'published',
  meta_title TEXT,
  meta_desc TEXT
);

CREATE TABLE IF NOT EXISTS checkups (
  id SERIAL PRIMARY KEY,
  url TEXT,
  email TEXT,
  scores_json TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS activity_log (
  id SERIAL PRIMARY KEY,
  "user" TEXT,
  action TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- SECURITY: Supabase exposes public tables through its REST API using the
-- public "anon" key. Enabling RLS with no policies blocks that access.
-- Your Express server connects with the database role, which is unaffected.
ALTER TABLE users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE services       ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_plans  ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects       ENABLE ROW LEVEL SECURITY;
ALTER TABLE testimonials   ENABLE ROW LEVEL SECURITY;
ALTER TABLE industries     ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_posts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE faqs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads          ENABLE ROW LEVEL SECURITY;
ALTER TABLE landing_pages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkups       ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log   ENABLE ROW LEVEL SECURITY;
