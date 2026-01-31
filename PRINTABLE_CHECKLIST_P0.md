# 📋 PRINTABLE CHECKLIST: Phase 0 Emergency Fixes

**Print this. Post on wall. Check off daily.**

---

## **PHASE 0: EMERGENCY FIXES (Feb 3-7, 2026)**

### **MONDAY, FEB 3: PLANNING & SETUP**

```
MORNING (9 AM)
- [ ] Read START_HERE.md (30 min)
- [ ] Read QUICK_REFERENCE.md (15 min)
- [ ] Review FIXES/ code patches (15 min)
- [ ] Confirm staging environment working

MIDDAY (12 PM)
- [ ] Team standup (15 min)
- [ ] Assign work: Who's doing P0.1? P0.2? P0.3?
- [ ] Create GitHub Project with Phase 0 columns
- [ ] Create branch: feature/p0-emergency-fixes

AFTERNOON (2 PM)
- [ ] Backend dev reads P0.1-P0.3 in IMPLEMENTATION_PLAN.md
- [ ] Security lead reviews FIXES/ code
- [ ] QA reviews testing strategy
- [ ] DevOps preps staging environment

END OF DAY
- [ ] All team members understand scope
- [ ] No blockers
- [ ] Daily standup notes documented
```

---

### **TUESDAY, FEB 4: IMPLEMENT P0.1 (TIMING ATTACK)**

```
9 AM - 12 PM: CODING (4 hours)
- [ ] Backend dev starts 4-hour timer
- [ ] Apply patch: FIXES/P0.1-timing-attack-mitigation.ts
  - [ ] Modify: server/src/services/auth.service.ts
  - [ ] Update: validateCredentials() method
  - [ ] Add: Constant-time delay logic
  - [ ] Add: Jitter (10-50ms random)
  
- [ ] Verify the change compiles
  $ npm run build  ← Should succeed

1 PM - 2 PM: TESTING
- [ ] Write timing test (100 iterations)
- [ ] Run test: npm run test
  - [ ] Results show < 100ms std dev? YES / NO
  - [ ] Success rate unchanged? YES / NO
  - [ ] No compile errors? YES / NO

2 PM - 3 PM: REVIEW & PR
- [ ] Code review checklist:
  - [ ] No "as any" types added
  - [ ] Comments explain constant-time approach
  - [ ] Test coverage > 80%
  - [ ] No security regressions
  
- [ ] Create PR:
  - [ ] Title: "fix: constant-time auth to prevent timing attacks"
  - [ ] Description: "Implements P0.1 from IMPLEMENTATION_PLAN.md"
  - [ ] Tag: @security-lead for review

3 PM - 4 PM: PEER REVIEW
- [ ] Security lead reviews PR
  - [ ] Asks questions? Handle them
  - [ ] Approves? Mark for merge
  - [ ] Rejects? Address and resubmit

COMMIT LOG (Example)
$ git log --oneline
  abc1234 fix: constant-time auth to prevent timing attacks
```

**🎯 End of Day:** P0.1 PR created and reviewed ✅

---

### **WEDNESDAY, FEB 5: IMPLEMENT P0.2 (GRACEFUL SHUTDOWN)**

```
9 AM - 11 AM: CODING (3 hours)
- [ ] Backend dev starts on P0.2
- [ ] Apply patch: FIXES/P0.2-graceful-shutdown.ts
  - [ ] Modify: server/src/index.ts
  - [ ] Add: setupGracefulShutdown() call
  - [ ] Modify: server/src/services/access.service.ts
  - [ ] Add: flush() method to AuditService
  - [ ] Add: MAX_BUFFER_SIZE property
  
- [ ] Verify compilation
  $ npm run build  ← Should succeed

11 AM - 12 PM: MANUAL TESTING
- [ ] Start server:
  $ npm run dev
  
- [ ] In another terminal, send test requests:
  $ curl http://localhost:3001/api/v1/health
  
- [ ] While requests in flight, send SIGTERM:
  $ kill -SIGTERM <PID>
  
- [ ] Verify logs show:
  - [ ] "SIGTERM received"
  - [ ] "Server closed"
  - [ ] "Audit logs flushed"
  - [ ] "Graceful shutdown complete"
  
- [ ] Check Supabase audit_logs table:
  - [ ] All test logs present? YES / NO

12 PM - 1 PM: CODE REVIEW
- [ ] Review checklist:
  - [ ] Signal handlers registered? YES / NO
  - [ ] Timeout protection (30s)? YES / NO
  - [ ] All services flushed? YES / NO
  - [ ] No data loss? YES / NO

1 PM - 2 PM: CREATE PR
- [ ] Create PR:
  - [ ] Title: "fix: graceful shutdown with buffer flushing"
  - [ ] Description: "Implements P0.2 from IMPLEMENTATION_PLAN.md"
  - [ ] References P0.1 PR
  - [ ] Tag: @devops for deployment review

2 PM - 3 PM: REVIEW
- [ ] DevOps/Security reviews
  - [ ] Safety of timeout logic
  - [ ] Kubernetes compatibility
  - [ ] Docker signal handling

**🎯 End of Day:** P0.2 PR created and reviewed ✅

---

### **THURSDAY, FEB 6: IMPLEMENT P0.3 (AUDIT VALIDATION)**

```
9 AM - 10 AM: CODING (2 hours)
- [ ] Backend dev starts on P0.3
- [ ] Apply patch: FIXES/P0.3-audit-validation.ts
  - [ ] Modify: server/src/services/access.service.ts
  - [ ] Add: Zod schema at top of file
  - [ ] Replace: log() method with validated version
  - [ ] Add: Field validation (userId, action, query, etc.)

- [ ] Verify compilation
  $ npm run build  ← Should succeed

10 AM - 11 AM: UNIT TESTING
- [ ] Write Zod schema tests
- [ ] Test cases:
  - [ ] Valid entry accepted
  - [ ] Invalid action rejected
  - [ ] Query > 2000 chars rejected
  - [ ] Metadata > 10 keys rejected
  - [ ] Anonymous user accepted
  
- [ ] Run tests:
  $ npm run test audit  ← Should all pass

11 AM - 12 PM: CODE REVIEW
- [ ] Review checklist:
  - [ ] All enum values correct
  - [ ] Error handling graceful
  - [ ] No data loss on validation failure
  - [ ] Backward compatible

12 PM - 1 PM: CREATE PR
- [ ] Create PR:
  - [ ] Title: "fix: validate audit log entries with Zod"
  - [ ] Description: "Implements P0.3 from IMPLEMENTATION_PLAN.md"
  - [ ] Links to P0.1 and P0.2
  - [ ] Tag: @security-lead

1 PM - 2 PM: REVIEW
- [ ] Security lead reviews
  - [ ] SQL injection risk eliminated? YES / NO
  - [ ] Schema correct? YES / NO

**🎯 End of Day:** P0.3 PR created and reviewed ✅

---

### **FRIDAY, FEB 7: INTEGRATION & DEPLOYMENT**

```
9 AM - 10 AM: FINAL TESTING
- [ ] All 3 PRs approved
- [ ] Merge to main branch:
  $ git checkout main
  $ git pull
  $ git merge feature/p0-emergency-fixes

- [ ] Run full test suite:
  $ npm test
  ✓ All tests pass? YES / NO

- [ ] Build production version:
  $ npm run build
  ✓ Build succeeds? YES / NO

10 AM - 11 AM: STAGING DEPLOYMENT
- [ ] Deploy to staging:
  $ docker-compose -f docker-compose.staging.yml up -d

- [ ] Smoke tests:
  - [ ] Server starts (check /health endpoint)
  - [ ] Auth works (try login)
  - [ ] RAG query works (try /api/v1/query)
  - [ ] Graceful shutdown works (kill -SIGTERM)
  - [ ] Logs appear (tail logs)

- [ ] QA signs off:
  - [ ] Smoke tests passed? YES / NO
  - [ ] No new errors in logs? YES / NO
  - [ ] Performance acceptable? YES / NO

11 AM - 12 PM: PRODUCTION DEPLOYMENT
- [ ] Prepare rollback script:
  ```bash
  #!/bin/bash
  git revert HEAD~2  # Revert last 3 commits
  npm run build
  docker build -t aikb:rollback .
  docker-compose up -d  # Redeploy
  ```

- [ ] Deploy to production:
  ```bash
  docker build -t aikb:v1.1.0 .
  docker-compose up -d
  ```

- [ ] Verify production:
  - [ ] Server online (check /health)
  - [ ] Error logs clean
  - [ ] Auth responses < 600ms (timing + jitter)
  - [ ] Audit logs flowing to Supabase

12 PM - 5 PM: MONITORING
- [ ] Every 30 minutes, check:
  - [ ] Error rate < 0.5%
  - [ ] No SIGTERM crashes
  - [ ] Audit logs appear in Supabase
  - [ ] Performance normal

- [ ] At end of day:
  - [ ] 4 hours monitoring complete? YES / NO
  - [ ] No issues found? YES / NO
  - [ ] Ready for Monday? YES / NO

END OF DAY: POST-MORTEM
- [ ] Team standup (15 min)
  - [ ] What went well?
  - [ ] What was hard?
  - [ ] Lessons learned?
  - [ ] Ready for P1 next week?

**🎯 End of Week:** Phase 0 complete in production ✅

---

## **DAILY STANDUP TEMPLATE**

Print and use daily.

```
DATE: __________

WHAT I DID YESTERDAY:
- 

WHAT I'M DOING TODAY:
- 

BLOCKERS:
- 

RISK ASSESSMENT (1-10):
  Current: ___
  Expected: ___

CONFIDENCE (1-10):
  Can finish today: ___
  Can ship to prod: ___

NOTES:
- 
```

---

## **EMERGENCY CONTACTS**

```
STUCK ON P0.1 (TIMING ATTACK)?
- Check: IMPLEMENTATION_PLAN.md section P0.1
- Check: FIXES/P0.1-timing-attack-mitigation.ts comments
- Ask: @security-lead (timing attacks are their domain)

STUCK ON P0.2 (GRACEFUL SHUTDOWN)?
- Check: IMPLEMENTATION_PLAN.md section P0.2
- Check: FIXES/P0.2-graceful-shutdown.ts
- Ask: @devops (deployment procedures)

STUCK ON P0.3 (AUDIT VALIDATION)?
- Check: IMPLEMENTATION_PLAN.md section P0.3
- Check: FIXES/P0.3-audit-validation.ts
- Ask: @backend (Zod validation patterns)

TEST FAILURES?
- Check: QUICK_REFERENCE.md Testing section
- Run: npm run test -- --verbose
- Ask: @qa-lead (test strategy)

ROLLBACK NEEDED?
- Execute: ./rollback.sh (saved in step 11 AM Fri)
- Notify: @on-call, @manager
- Post-mortem: Document what failed

BLOCKED ON SOMETHING ELSE?
- Post in #engineering Slack
- Tag specific person if known
- If urgent: @engineering (all-hands)
```

---

## **SUCCESS CRITERIA (End of P0)**

```
✅ Zero timing attack vulnerabilities
- [ ] Auth responses indistinguishable by timing
- [ ] Timing test shows < 100ms std dev
- [ ] Jitter active (10-50ms added)

✅ Graceful shutdown working
- [ ] SIGTERM handlers registered
- [ ] Server stops accepting new connections
- [ ] In-flight requests complete
- [ ] Buffers flushed to Supabase
- [ ] No audit logs lost

✅ Audit logs validated
- [ ] Zod schema enforced
- [ ] Invalid entries rejected gracefully
- [ ] No SQL injection risk
- [ ] All new logs have correct schema

✅ Production ready
- [ ] All tests pass (npm test)
- [ ] Build succeeds (npm run build)
- [ ] Staging tests pass
- [ ] No errors in production logs (4 hours monitoring)
- [ ] Team confident in rollback procedure
```

---

## **NOTES**

- Each day's work should be completable in 8 hours
- If blocked, escalate immediately (don't wait)
- Commit early, commit often
- Test as you go (not at the end)
- All PRs require security lead approval
- No commits to main directly (PR required)
- Monitor production for 24 hours after deploy

---

**Print this. Post it. Check it off. Ship it. 🚀**

Last Updated: 2026-01-31
