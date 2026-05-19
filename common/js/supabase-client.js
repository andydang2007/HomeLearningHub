/**
 * common/js/supabase-client.js
 * ============================
 * ONLY initializes the Supabase client instance.
 * No business logic, routing, or UI allowed here.
 *
 * Prerequisites: Supabase JS SDK must be loaded before this script.
 * Load order in HTML:
 *   1. <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js">
 *   2. <script src="../common/js/supabase-client.js">
 */

// ── Configuration ─────────────────────────────────────────────────────────────
// TODO: Fill in your project credentials from:
//       Supabase Dashboard → Project Settings → API
const SUPABASE_URL      = 'https://dtrbawiimrfidsnxlfmw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_obiVpwztUSpIoeR8Qy69Zw_Xs4Mc1VH';

// ── Singleton client ──────────────────────────────────────────────────────────
const { createClient } = window.supabase;
window.SupabaseClient   = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
