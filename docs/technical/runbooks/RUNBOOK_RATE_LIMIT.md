# Rate Limiting False Positives Runbook

## Symptom: User locked out despite correct password

**Root Cause:** Email-based rate limiter triggered (legitimate)

**Impact:** User unable to login, support tickets, user frustration

**Resolution:**

### Step 1: Check lockout status
```bash
EMAIL="user@example.com"

curl http://localhost:3000/api/admin/ratelimit/user?email=${EMAIL}
```

**Expected Response:**
```json
{
  "email": "user@example.com",
  "isLocked": true,
  "lockedUntil": "2026-02-01T12:30:00Z",
  "failedAttempts": 5,
  "reason": "5 failed auth attempts",
  "lockDurationMinutes": 15
}
```

### Step 2: Verify password is correct
```bash
# Have user provide password in secure channel
# Test auth in separate isolated environment (not production)

# Or check if user just forgot password
# Ask: "When was the last time you successfully logged in?"
```

### Step 3: Unlock immediately (if confident password is correct)
```bash
curl -X POST http://localhost:3000/api/admin/ratelimit/unlock?email=${EMAIL}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "User unlocked",
  "retryAt": "2026-02-01T12:15:00Z"
}
```

### Step 4: Notify user and ask to retry
```bash
# Send notification
curl -X POST http://localhost:3000/api/notifications \
  -H "Content-Type: application/json" \
  -d '{
    "email": "'"${EMAIL}"'",
    "subject": "Account Unlocked",
    "body": "Your account has been unlocked. Please try logging in again.",
    "type": "account_unlocked"
  }'
```

### Step 5: If user still locked out after correct password
```bash
# Check if there's a distributed attack pattern
curl http://localhost:3000/api/admin/ratelimit/threats
```

---

## Symptom: All users from same IP or department locked out

**Root Cause:** Distributed attack detected (legitimate or false positive)

**Impact:** Multiple users unable to access system

**Resolution:**

### Step 1: Check attack analysis
```bash
curl http://localhost:3000/api/admin/ratelimit/threats
```

**Expected Response:**
```json
{
  "threats": [
    {
      "type": "distributed_attack",
      "sourceIPs": ["192.168.1.x", "192.168.1.y"],
      "targetEmails": ["admin@example.com", "dev@example.com"],
      "pattern": "Failed auth from multiple IPs",
      "severity": "medium",
      "startTime": "2026-02-01T12:00:00Z"
    }
  ]
}
```

### Step 2: Determine if legitimate (user department or testing)
- Is this a known testing window?
- Is this the same department using same IP range?
- Check Slack/Teams for notifications about password changes

### Step 3: If legitimate, increase lock timeout temporarily
```bash
# Increase from 15 minutes to 30 minutes
curl -X POST http://localhost:3000/api/admin/ratelimit/config \
  -H "Content-Type: application/json" \
  -d '{
    "lockDurationMinutes": 30,
    "maxFailedAttempts": 5
  }'
```

### Step 4: Notify affected users
```bash
curl -X POST http://localhost:3000/api/notifications/broadcast \
  -H "Content-Type: application/json" \
  -d '{
    "departments": ["Engineering", "Product"],
    "subject": "Temporary Access Issue",
    "body": "We have detected a potential security issue. Access will be restored at 12:45 UTC. Please try again then."
  }'
```

### Step 5: If attack is real, enable additional protection
```bash
# Temporarily disable email-based limiting if false positive rate high
curl -X POST http://localhost:3000/api/admin/feature-flags/rate-limiter-email \
  -H "Content-Type: application/json" \
  -d '{"rolloutPercentage": 0}'

# Monitor IP-based rate limiting instead
curl http://localhost:3000/api/health/ratelimit
```

### Step 6: Once threat passes, return to normal
```bash
# Restore normal lock duration
curl -X POST http://localhost:3000/api/admin/ratelimit/config \
  -H "Content-Type: application/json" \
  -d '{
    "lockDurationMinutes": 15,
    "maxFailedAttempts": 5
  }'

# Re-enable email-based limiting
curl -X POST http://localhost:3000/api/admin/feature-flags/rate-limiter-email \
  -H "Content-Type: application/json" \
  -d '{"rolloutPercentage": 100}'
```

---

## Symptom: False positive lockouts with correct password (intermittent)

**Root Cause:** User password may be known to attacker, or weak password being tested

**Resolution:**

### Step 1: Analyze failed attempts
```bash
EMAIL="user@example.com"

curl http://localhost:3000/api/admin/ratelimit/attempts?email=${EMAIL}&limit=20
```

**Expected Response:**
```json
{
  "attempts": [
    {
      "timestamp": "2026-02-01T12:00:15Z",
      "password": "***",
      "result": "failed",
      "ip": "192.168.1.100",
      "userAgent": "Mozilla/5.0..."
    },
    {
      "timestamp": "2026-02-01T12:00:12Z",
      "password": "***",
      "result": "failed",
      "ip": "203.0.113.45",
      "userAgent": "curl/7.68"
    }
  ]
}
```

### Step 2: Check if multiple IPs attempting same email
```bash
# If yes, user password likely compromised
echo "Multiple IPs detected - PASSWORD LIKELY COMPROMISED"

# If no, might be user typo or legitimate confusion
echo "Single IP detected - Likely user error or false positive"
```

### Step 3: If password compromised, force password reset
```bash
curl -X POST http://localhost:3000/api/admin/users/${USER_ID}/force-password-reset \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Security: Multiple IPs attempted login",
    "requireChangeOnNextLogin": true
  }'
```

### Step 4: Notify user of compromise
```bash
curl -X POST http://localhost:3000/api/notifications \
  -H "Content-Type: application/json" \
  -d '{
    "email": "'"${EMAIL}"'",
    "subject": "Security Alert: Password Reset Required",
    "body": "We detected unauthorized login attempts on your account. Please reset your password immediately.",
    "type": "security_alert",
    "priority": "high"
  }'
```

### Step 5: Monitor user password reset
```bash
# Check if user completes reset within 1 hour
# If not, follow up with additional security measures
```

---

## Monitoring & Prevention

### Key Metrics
```influxql
# Lockout events (target < 10/hour)
from(bucket:"aikb")
  |> filter(fn: (r) => r._measurement == "ratelimit_lockout")
  |> window(every: 1h)
  |> count()

# False positive lockouts (lockout_reason contains "verified_later")
from(bucket:"aikb")
  |> filter(fn: (r) => r._measurement == "ratelimit_lockout" and r.false_positive == "true")
  |> window(every: 1h)
  |> count()

# Lockouts per user (alert if > 5/user in 1 day)
from(bucket:"aikb")
  |> filter(fn: (r) => r._measurement == "ratelimit_lockout")
  |> group(by: ["email"])
  |> window(every: 24h)
  |> count()
```

### Alerting Rules

| Condition | Severity | Action |
|-----------|----------|--------|
| Lockouts > 10/hour | WARNING | Monitor for attack pattern |
| Lockouts > 50/hour | CRITICAL | Disable rate limiting, investigate |
| Single user > 5 lockouts/day | WARNING | Check for compromised password |
| Attack pattern detected | CRITICAL | Page on-call, increase lock duration |

### Dashboard
- **"AIKB Rate Limiting"** - Lockout events, false positives, attack patterns
- **"AIKB Security Threats"** - Failed auth distribution, IP reputation
- **"AIKB User Lockouts"** - Lockout timeline, user distribution

---

## Configuration Options

### Rate Limiting Tiers
```json
{
  "standard": {
    "maxFailedAttempts": 5,
    "lockDurationMinutes": 15,
    "slidingWindowMinutes": 10
  },
  "strict": {
    "maxFailedAttempts": 3,
    "lockDurationMinutes": 30,
    "slidingWindowMinutes": 5
  },
  "relaxed": {
    "maxFailedAttempts": 10,
    "lockDurationMinutes": 5,
    "slidingWindowMinutes": 20
  }
}
```

### Feature Flags
- `rate-limiter-email` - Enable/disable email-based rate limiting
- `rate-limiter-ip` - Enable/disable IP-based rate limiting
- `rate-limiter-adaptive` - Enable/disable adaptive attack detection

---

## False Positive Prevention

### Best Practices
1. **Monitor false positive rate** - Alert if > 5% of lockouts are false positives
2. **Use adaptive thresholds** - Increase limits during known testing windows
3. **Implement user feedback** - "Was this a false positive?" in unlock email
4. **Track patterns** - If user frequently locked out, may need password help
5. **Separate concerns** - Email vs IP vs device fingerprint limiting

### Testing Password Changes
```bash
# During password change testing, disable rate limiting
curl -X POST http://localhost:3000/api/admin/feature-flags/rate-limiter-email \
  -H "Content-Type: application/json" \
  -d '{"rolloutPercentage": 0, "targetEnvironments": ["staging"]}'

# Or temporarily increase lock duration
curl -X POST http://localhost:3000/api/admin/ratelimit/config \
  -H "Content-Type: application/json" \
  -d '{"lockDurationMinutes": 1}'
```

---

## Rollback Procedure

If rate limiting causing cascading failures:

```bash
# 1. Disable all rate limiting
curl -X POST http://localhost:3000/api/admin/feature-flags/rate-limiter-email \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'

# 2. Unlock all users
curl -X POST http://localhost:3000/api/admin/ratelimit/unlock-all

# 3. Monitor error rates and login success
curl http://localhost:3000/api/health

# 4. Once stable, re-enable with relaxed settings
curl -X POST http://localhost:3000/api/admin/ratelimit/config \
  -H "Content-Type: application/json" \
  -d '{"maxFailedAttempts": 10, "lockDurationMinutes": 5}'

# 5. Re-enable feature flag
curl -X POST http://localhost:3000/api/admin/feature-flags/rate-limiter-email \
  -H "Content-Type: application/json" \
  -d '{"enabled": true, "rolloutPercentage": 100}'
```

---

## See Also
- RUNBOOK_AUTH_TIMING.md - Auth performance troubleshooting
- RUNBOOK_DEPLOYMENT.md - Deployment troubleshooting
- RUNBOOK_TRACING.md - Request tracing guide
