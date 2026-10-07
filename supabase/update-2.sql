-- Run once in Supabase SQL Editor (after schema.sql and data.sql).
-- Adds *highlight* markers to service page headlines so the coloured words
-- on the live site are kept now that headlines are edited from the admin.
UPDATE landing_pages SET headline = 'Your website, *refreshed in 48 hours.*'                         WHERE slug = '48-hour-website-refresh';
UPDATE landing_pages SET headline = 'A website that makes your business look *as good as it is.*'   WHERE slug = 'website-design';
UPDATE landing_pages SET headline = 'A website you can *actually update yourself.*'                 WHERE slug = 'wordpress-development';
UPDATE landing_pages SET headline = 'Get found by customers *in your town.*'                        WHERE slug = 'local-seo';
UPDATE landing_pages SET headline = 'Your website, *looked after.*'                                 WHERE slug = 'care-plans';
UPDATE landing_pages SET headline = 'High-converting *ad graphics & visual assets.*'                WHERE slug = 'brand-and-social-graphics';
