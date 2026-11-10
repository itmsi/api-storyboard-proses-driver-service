exports.up = (knex) => knex.raw(`
  CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
  BEGIN
    NEW.updated_at = now();
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql
`)

exports.down = (knex) => knex.raw('DROP FUNCTION IF EXISTS set_updated_at()')
