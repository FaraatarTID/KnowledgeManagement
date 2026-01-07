-- Create users table
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'VIEWER',
    department VARCHAR(100) DEFAULT 'General',
    status VARCHAR(50) DEFAULT 'Active',
    created_at TIMESTAMP
    WITH
        TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP
    WITH
        TIME ZONE DEFAULT NOW()
);

-- Access control for users table (Row Level Security)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own data
CREATE POLICY "Users can view own data" ON public.users FOR
SELECT USING (auth.uid () = id);

-- Policy: Admins can view all data (This requires additional setup for custom claims or role tables usually)
-- For simplicity in this demo migration, we might just allow service role key full access
-- service_role key bypasses RLS, so this table is secure by default from public anon access

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users (email);