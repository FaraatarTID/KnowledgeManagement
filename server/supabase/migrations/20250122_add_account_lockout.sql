-- Add account lockout protection (P1.3)
-- Tracks failed login attempts and account lockout state

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP WITH TIME ZONE;

-- Create index for efficient lockout status queries
CREATE INDEX IF NOT EXISTS idx_users_locked_until ON public.users(locked_until);
CREATE INDEX IF NOT EXISTS idx_users_failed_attempts ON public.users(failed_login_attempts);

-- Comment for clarity
COMMENT ON COLUMN public.users.failed_login_attempts IS 'Tracks consecutive failed login attempts for brute-force prevention';
COMMENT ON COLUMN public.users.locked_until IS 'Account locked until this timestamp (NULL = not locked)';
