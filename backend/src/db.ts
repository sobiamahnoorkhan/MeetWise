import { createClient } from "@supabase/supabase-js";

const rawUrl = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!rawUrl || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");

// Supabase createClient expects the project URL, not the REST endpoint.
// Normalize an accidentally supplied /rest/v1 suffix so requests do not become
// /rest/v1/rest/v1/<table>.
const url = rawUrl.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/i, "");

export const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false }
});
