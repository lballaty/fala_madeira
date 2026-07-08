// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/check-user-status.js
// Description: Check user account status in Supabase
// Author: Libor Ballaty <libor@arionetworks.com>
// Created: 2026-04-07

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkUserStatus() {
  const email = 'liborballaty@gmail.com';

  console.log('🔍 Checking user status for:', email);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Try to sign in to check if account exists and is confirmed
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email,
    password: 'wrong-password-test'
  });

  if (error) {
    console.log('Auth Error Code:', error.status);
    console.log('Auth Error Message:', error.message);
    console.log();

    if (error.message.includes('Email not confirmed')) {
      console.log('❌ Status: EMAIL NOT CONFIRMED');
      console.log('   The account exists but email needs confirmation');
      console.log('   Password reset emails will NOT be sent');
    } else if (error.message.includes('Invalid login credentials')) {
      console.log('✅ Status: ACCOUNT EXISTS & CONFIRMED');
      console.log('   (Wrong password used for test, but account is valid)');
      console.log('   Password reset emails SHOULD be sent');
    } else if (error.message.includes('not found') || error.message.includes('does not exist')) {
      console.log('❌ Status: ACCOUNT DOES NOT EXIST');
      console.log('   Need to sign up first');
    } else {
      console.log('⚠️  Status: UNKNOWN');
      console.log('   Unexpected error - check message above');
    }
  } else {
    console.log('⚠️  Unexpected: Login succeeded with test password');
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

checkUserStatus().catch(console.error);
