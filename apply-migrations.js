// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/apply-migrations.js
// Description: Apply database migrations to Supabase using PostgreSQL direct connection
// Author: Libor Ballaty <libor@arionetworks.com>
// Created: 2026-04-02

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables
dotenv.config({ path: '.env.local', quiet: true });

// Supabase PostgreSQL connection string format:
// postgresql://postgres:[YOUR-PASSWORD]@db.gxlrmdfqcqimwwplrdgd.supabase.co:5432/postgres

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const projectRef = supabaseUrl ? supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] : null;

console.log('🔧 FalaMadeira Database Migration Tool');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

if (!projectRef) {
  console.error('❌ Could not extract project reference from VITE_SUPABASE_URL');
  console.error('Expected format: https://PROJECT_REF.supabase.co');
  process.exit(1);
}

// Check for database password
const dbPassword = process.env.SUPABASE_DB_PASSWORD;

if (!dbPassword) {
  console.error('❌ Missing SUPABASE_DB_PASSWORD in .env.local');
  console.error('\n📋 To get your database password:');
  console.error('1. Go to: https://supabase.com/dashboard/project/gxlrmdfqcqimwwplrdgd/settings/database');
  console.error('2. Find "Database password" section');
  console.error('3. Copy your password or reset it');
  console.error('4. Add to .env.local: SUPABASE_DB_PASSWORD="your-password-here"');
  console.error('\n⚠️  Note: This is different from your API keys!');
  process.exit(1);
}

// Direct connection (IPv6-reachable from this machine; verified 2026-07-08). The
// pooler host is region-specific and was wrong for this project (us-west-1 -> tenant not found).
// Fallback pooler, if ever needed: postgresql://postgres.${projectRef}:<pw>@aws-0-<region>.pooler.supabase.com:6543/postgres
const connectionString = `postgresql://postgres:${encodeURIComponent(dbPassword)}@db.${projectRef}.supabase.co:5432/postgres`;

async function executeSqlFile(filePath) {
  console.log(`📄 Reading SQL file: ${path.basename(filePath)}`);

  const sql = fs.readFileSync(filePath, 'utf8');
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

  try {
    console.log('🔌 Connecting to Supabase database...');
    await client.connect();
    console.log('✅ Connected successfully!\n');

    console.log('🔄 Executing SQL migration...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Execute the entire SQL file as a single transaction
    await client.query('BEGIN');

    try {
      await client.query(sql);
      await client.query('COMMIT');

      console.log('✅ Migration executed successfully!\n');

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }

    // Verify tables were created
    console.log('🔍 Verifying tables...');
    await verifyTables(client);

  } catch (error) {
    console.error('\n❌ Migration failed:');
    console.error(error.message);

    if (error.message.includes('password authentication failed')) {
      console.error('\n💡 Hint: Check your SUPABASE_DB_PASSWORD in .env.local');
    } else if (error.message.includes('relation') && error.message.includes('already exists')) {
      console.log('\n⚠️  Some tables already exist - this may be expected');
    }

    process.exit(1);
  } finally {
    await client.end();
    console.log('\n🔌 Database connection closed');
  }
}

async function verifyTables(client) {
  const tables = ['tickets', 'logs', 'global_settings', 'video_suggestions', 'lesson_corrections'];

  for (const table of tables) {
    try {
      const result = await client.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = $1
        )`,
        [table]
      );

      if (result.rows[0].exists) {
        console.log(`  ✅ ${table}`);
      } else {
        console.log(`  ❌ ${table} - NOT FOUND`);
      }
    } catch (err) {
      console.log(`  ❌ ${table} - ERROR: ${err.message}`);
    }
  }
}

// Main execution — accept a SQL file path as the first CLI argument.
const sqlFilePath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, 'missing_tables.sql');

if (!fs.existsSync(sqlFilePath)) {
  console.error(`❌ SQL file not found: ${sqlFilePath}`);
  console.error('Usage: node apply-migrations.js <path-to-sql-file>');
  process.exit(1);
}

executeSqlFile(sqlFilePath);
