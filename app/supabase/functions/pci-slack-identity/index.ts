import {createClient} from 'npm:@supabase/supabase-js@2.117.2';
import {identityHandler} from './handler.js';
const url=Deno.env.get('SUPABASE_URL')!;
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,options);
// A distinct client per exchange prevents concurrent identities sharing Auth state.
Deno.serve(req=>identityHandler({admin,publicClient:createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,options)})(req));
