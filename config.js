// ===================================
// SEVENRISE V3 - SUPABASE CONFIG
// ===================================

const SUPABASE_URL =
"https://eyhvzkqjnpuepqedvprl.supabase.co";

const SUPABASE_ANON_KEY =
"sb_publishable_8octlvT4wMspfEX14uFMuA_ShwqQYbj";

// Initialize Supabase
const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);

console.log("SevenRise V3 Connected");
