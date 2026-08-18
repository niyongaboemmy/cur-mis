#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# End-to-end HTTP test of the leave approval routes.
#
# Unlike leave_approval_flow_test.php (which drives the service directly), this
# goes over the wire: it boots a throwaway PHP server and exercises the real
# router, AuthMiddleware and Maybe/PermissionMiddleware chain with JWTs minted
# for synthetic reviewers holding one stage permission each.
#
#   ./scripts/tests/leave_approval_http_test.sh
#
# Fixtures are prefixed ZZTEST_ and swept before and after every run.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$(cd "$HERE/../.." && pwd)"
PORT="${LEAVE_TEST_PORT:-8799}"
BASE="http://127.0.0.1:$PORT"
TOK="$HERE/.zztest-tokens.json"

cleanup() {
  # `disown` first so bash does not print a "Terminated" job notice after the
  # summary, which reads like a test failure.
  if [ -n "${SERVER_PID:-}" ]; then
    disown "$SERVER_PID" 2>/dev/null
    kill "$SERVER_PID" 2>/dev/null
    wait "$SERVER_PID" 2>/dev/null
  fi
  ( cd "$BACKEND" && php "$HERE/_zztest_teardown.php" >/dev/null 2>&1 )
  rm -f "$TOK"
}
trap cleanup EXIT

php -S "127.0.0.1:$PORT" -t "$BACKEND/public" "$BACKEND/public/index.php" >/dev/null 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 25); do
  curl -s -o /dev/null "$BASE/api/hr/leave/types" && break
  sleep 0.2
done

# Fresh fixtures every run — the mint script sweeps leftovers first.
( cd "$BACKEND" && php "$HERE/_mint_test_tokens.php" 2>/dev/null | tail -1 > "$TOK" )
if ! python3 -c "import json;json.load(open('$TOK'))" 2>/dev/null; then
  echo "Could not mint test tokens — is the database reachable?"; exit 1
fi

t() { python3 -c "import json,sys;print(json.load(open('$TOK'))['$1']['token'])"; }
uid() { python3 -c "import json,sys;print(json.load(open('$TOK'))['$1']['id'])"; }

REQ=$(t requester); HOD=$(t hod); HR=$(t hr); NOB=$(t nobody); CFG=$(t chainadmin)
VC=$(t vc); HRREC=$(t hrrec); DAF=$(t daf)

pass=0; fail=0
# check <name> <expected-status> <actual-status> [body]
check() {
  if [ "$2" == "$3" ]; then echo "  ✓ $1"; pass=$((pass+1));
  else echo "  ✗ $1 — expected HTTP $2, got $3"; [ -n "$4" ] && echo "      $4"; fail=$((fail+1)); fi
}
# call <METHOD> <path> <token> [json-body] → sets $CODE and $BODY
call() {
  local out
  out=$(curl -s -w '\n%{http_code}' -X "$1" "$BASE$2" \
        -H "Authorization: Bearer $3" -H 'Content-Type: application/json' \
        ${4:+-d "$4"})
  CODE=$(echo "$out" | tail -1)
  BODY=$(echo "$out" | sed '$d')
}
# Evaluate a python expression against the last response body, with `d` bound
# to the decoded JSON. The expression arrives via argv so quoting survives.
jq_() { python3 -c 'import json,sys;d=json.load(sys.stdin);print(eval(sys.argv[1]))' "$1" <<< "$BODY"; }

echo
echo "Route reachability + permission gating"
call GET /api/hr/leave/types "$REQ";              check "REQUEST_LEAVE can read the leave-type catalogue" 200 "$CODE" "$BODY"
call GET /api/hr/leave/types "$NOB";              check "an unrelated permission is refused the catalogue" 403 "$CODE"
call GET /api/hr/leave/approvals/queue "$VC";     check "a stage approver can read the approval queue" 200 "$CODE" "$BODY"
call GET /api/hr/leave/approvals/queue "$NOB";    check "a non-approver is refused the approval queue" 403 "$CODE"
call GET /api/hr/leave/approvals/queue "$REQ";    check "REQUEST_LEAVE alone is refused the approval queue" 403 "$CODE"
call GET /api/hr/leave/requests "$HR";            check "VIEW_LEAVE_REQUESTS can read the register" 200 "$CODE" "$BODY"
call GET /api/hr/leave/requests "$REQ";           check "a requester cannot read the whole register" 403 "$CODE"
call GET /api/hr/leave/stats "$HR";               check "stats are readable by a leave viewer" 200 "$CODE" "$BODY"
call GET /api/hr/leave/my-requests "$REQ";        check "self-service list is readable" 200 "$CODE" "$BODY"
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/hr/leave/approvals/queue")
check "the approval queue rejects an anonymous caller" 401 "$CODE"

echo
echo "Stats payload"
call GET /api/hr/leave/stats "$HR"
check "stats expose the per-stage backlog" "True" "$(jq_ "d['data'].get('by_stage') is not None")"
check "stats expose the SLA breach count" "True" "$(jq_ "d['data'].get('overdue') is not None")"
check "each stage backlog entry reports its overdue count" "True" \
  "$(jq_ "all('overdue' in s for s in d['data']['by_stage']) if d['data']['by_stage'] else True")"
check "stats expose the changes-requested count" "True" "$(jq_ "d['data'].get('changes_requested') is not None")"

echo
echo "Chain configuration is read-only without MANAGE_LEAVE_TYPES"
TYPE_ID=$(python3 -c "
import json,urllib.request
r=urllib.request.Request('$BASE/api/hr/leave/types',headers={'Authorization':'Bearer $REQ'})
print(json.load(urllib.request.urlopen(r))['data'][0]['id'])")
call GET "/api/hr/leave/types/$TYPE_ID/stages" "$HR";   check "reading a chain needs MANAGE_LEAVE_TYPES" 403 "$CODE"
call POST "/api/hr/leave/types/$TYPE_ID/stages" "$HOD" '{"stages":[]}'
check "editing a chain needs MANAGE_LEAVE_TYPES" 403 "$CODE"

echo
echo "Approval chain configuration"
call GET "/api/hr/leave/types/$TYPE_ID/stages" "$CFG"
check "a chain administrator can read a chain" 200 "$CODE" "$BODY"
check "the seeded chain is the institution's four signatures" "True" \
  "$(jq_ "[s['stage_key'] for s in d['data']['stages']] == ['vice_chancellor','hr_recommendation','daf_review','vc_final_authorization']")"
check "only the last stage is the final authorization" "True" \
  "$(jq_ "[bool(s['is_final_approval']) for s in d['data']['stages']] == [False,False,False,True]")"
check "the chain comes back in order" "True" \
  "$(jq_ "[s['stage_order'] for s in d['data']['stages']] == sorted(s['stage_order'] for s in d['data']['stages'])")"
check "exactly one stage is the final approval" "1" \
  "$(jq_ "sum(1 for s in d['data']['stages'] if s['is_final_approval'])")"
check "the final approval is the last stage" "True" \
  "$(jq_ "bool(d['data']['stages'][-1]['is_final_approval'])")"
check "the editor is told which permissions it may choose" "True" \
  "$(jq_ "len(d['data']['available_stage_permissions']) >= 6")"
check "each stage reports how many people can sign it" "True" \
  "$(jq_ "all('holder_count' in s for s in d['data']['stages'])")"
check "the approver picker reports holder counts per permission" "True" \
  "$(jq_ "set(d['data']['permission_holder_counts']) == set(d['data']['available_stage_permissions'])")"

call GET "/api/hr/leave/types/99999999/stages" "$CFG"
check "an unknown leave type is a 404" 404 "$CODE"

# Every rule validateChain() enforces, over the wire.
call POST "/api/hr/leave/types/$TYPE_ID/stages" "$CFG" '{"stages":[]}'
check "an empty chain is refused" 422 "$CODE"
call POST "/api/hr/leave/types/$TYPE_ID/stages" "$CFG" '{}'
check "a missing stages array is refused" 422 "$CODE"
call POST "/api/hr/leave/types/$TYPE_ID/stages" "$CFG" \
  '{"stages":[{"stage_key":"a","stage_label":"A","required_permission_slug":"APPROVE_LEAVE_L1","is_final_approval":0}]}'
check "a chain with no final stage is refused" 422 "$CODE"
call POST "/api/hr/leave/types/$TYPE_ID/stages" "$CFG" \
  '{"stages":[{"stage_key":"a","stage_label":"A","required_permission_slug":"APPROVE_LEAVE_L1","is_final_approval":1},{"stage_key":"b","stage_label":"B","required_permission_slug":"APPROVE_LEAVE_FINAL","is_final_approval":0}]}'
check "a final stage that is not last is refused" 422 "$CODE"
call POST "/api/hr/leave/types/$TYPE_ID/stages" "$CFG" \
  '{"stages":[{"stage_key":"dup","stage_label":"A","required_permission_slug":"APPROVE_LEAVE_L1","is_final_approval":0},{"stage_key":"dup","stage_label":"B","required_permission_slug":"APPROVE_LEAVE_FINAL","is_final_approval":1}]}'
check "duplicate stage keys are refused" 422 "$CODE"
call POST "/api/hr/leave/types/$TYPE_ID/stages" "$CFG" \
  '{"stages":[{"stage_key":"a","stage_label":"A","required_permission_slug":"NOT_A_PERMISSION","is_final_approval":1}]}'
check "an unknown permission slug is refused" 422 "$CODE"
call POST "/api/hr/leave/types/$TYPE_ID/stages" "$CFG" \
  '{"stages":[{"stage_key":"a","stage_label":"","required_permission_slug":"APPROVE_LEAVE_L1","is_final_approval":1}]}'
check "a stage with no name is refused" 422 "$CODE"

call GET "/api/hr/leave/types/$TYPE_ID/stages" "$CFG"
check "every rejected edit left the stored chain untouched" "4" "$(jq_ "len(d['data']['stages'])")"

# A valid three-stage chain, then put it back.
call POST "/api/hr/leave/types/$TYPE_ID/stages" "$CFG" \
  '{"stages":[{"stage_key":"s1","stage_label":"Supervisor","required_permission_slug":"APPROVE_LEAVE_L1","is_final_approval":0,"sla_hours":24},{"stage_key":"s2","stage_label":"Dean","required_permission_slug":"APPROVE_LEAVE_L2","is_final_approval":0,"sla_hours":48},{"stage_key":"s3","stage_label":"HR","required_permission_slug":"APPROVE_LEAVE_FINAL","is_final_approval":1,"sla_hours":72}]}'
check "a valid chain saves" 200 "$CODE" "$BODY"
check "stage_order is assigned from array position" "True" \
  "$(jq_ "[s['stage_order'] for s in d['data']] == [1,2,3]")"
check "the saved chain keeps its SLAs" "24" "$(jq_ "d['data'][0]['sla_hours']")"
call GET /api/hr/leave/types "$CFG"
check "the leave-type list reports the new stage count" "3" \
  "$(jq_ "next(t['stage_count'] for t in d['data'] if t['id']==$TYPE_ID)")"

call POST "/api/hr/leave/types/$TYPE_ID/stages" "$CFG" \
  '{"stages":[{"stage_key":"vice_chancellor","stage_label":"Vice Chancellor","required_permission_slug":"APPROVE_LEAVE_VC","is_final_approval":0,"sla_hours":48},{"stage_key":"hr_recommendation","stage_label":"HR — Recommendation","required_permission_slug":"APPROVE_LEAVE_HR","is_final_approval":0,"sla_hours":48},{"stage_key":"daf_review","stage_label":"DAF — Director of Administration & Finance","required_permission_slug":"APPROVE_LEAVE_DAF","is_final_approval":0,"sla_hours":48},{"stage_key":"vc_final_authorization","stage_label":"Vice Chancellor — Final Authorization","required_permission_slug":"APPROVE_LEAVE_FINAL","is_final_approval":1,"sla_hours":48}]}'
check "the institutional default chain is restored" 200 "$CODE" "$BODY"
check "the restored chain has four stages" "4" "$(jq_ "len(d['data'])")"

echo
echo "Full request lifecycle over HTTP — the institution's four signatures"
START=2031-02-03; END=2031-02-05
call POST /api/hr/leave/my-requests "$REQ" "{\"leave_type_id\":$TYPE_ID,\"start_date\":\"$START\",\"end_date\":\"$END\",\"reason\":\"ZZTEST http\"}"
check "a staff member can file their own leave" 201 "$CODE" "$BODY"
RID=$(jq_ "d['data']['id']")
check "the new request enters at stage 1" "1" "$(jq_ "d['data']['current_stage_order']")"
check "stage 1 is the Vice Chancellor" "Vice Chancellor" "$(jq_ "d['data']['current_stage_label']")"
check "the chain has four stages" "4" "$(jq_ "d['data']['total_stages']")"
check "the new request is Pending" "Pending" "$(jq_ "d['data']['status']")"

call POST /api/hr/leave/my-requests "$REQ" "{\"leave_type_id\":$TYPE_ID,\"start_date\":\"$START\",\"end_date\":\"$END\"}"
check "an overlapping resubmission is refused" 422 "$CODE"

call GET /api/hr/leave/approvals/queue "$VC"
check "queue rows carry the stage clock" "True" \
  "$(jq_ "all(k in d['data'][0] for k in ('hours_at_stage','is_overdue','current_stage_sla_hours','stage_entered_at'))")"
check "the request lands in the Vice Chancellor's queue" "True" \
  "$(jq_ "any(r['id']==$RID for r in d['data'])")"
call GET /api/hr/leave/approvals/queue "$HRREC"
check "it is not yet in HR's queue" "False" "$(jq_ "any(r['id']==$RID for r in d['data'])")"
call GET /api/hr/leave/approvals/queue "$DAF"
check "it is not yet in the DAF's queue" "False" "$(jq_ "any(r['id']==$RID for r in d['data'])")"

# Each office may only sign its own stage, and only in sequence.
call POST "/api/hr/leave/approvals/$RID/decide" "$HRREC" '{"decision":"approved"}'
check "HR cannot sign before the Vice Chancellor" 422 "$CODE"
call POST "/api/hr/leave/approvals/$RID/decide" "$DAF" '{"decision":"approved"}'
check "the DAF cannot sign before HR" 422 "$CODE"
call POST "/api/hr/leave/approvals/$RID/decide" "$HR" '{"decision":"approved"}'
check "final authorization cannot be given first" 422 "$CODE"
call POST "/api/hr/leave/approvals/$RID/decide" "$REQ" '{"decision":"approved"}'
check "the requester cannot reach the decide endpoint at all" 403 "$CODE"
call POST "/api/hr/leave/approvals/$RID/decide" "$VC" '{"decision":"sideways"}'
check "an unknown decision verb is rejected by validation" 422 "$CODE"

call POST "/api/hr/leave/approvals/$RID/decide" "$VC" '{"decision":"approved","comment":"Noted."}'
check "the Vice Chancellor signs stage 1" 200 "$CODE" "$BODY"
check "it advances to HR" "HR — Recommendation" "$(jq_ "d['data']['current_stage_label']")"
check "the VC signature does not grant the leave" "Pending" "$(jq_ "d['data']['status']")"

call POST "/api/hr/leave/approvals/$RID/decide" "$HRREC" '{"decision":"approved","comment":"Recommended."}'
check "HR signs its recommendation" 200 "$CODE" "$BODY"
check "it advances to the DAF" "DAF — Director of Administration & Finance" \
  "$(jq_ "d['data']['current_stage_label']")"
check "HR only recommends — it cannot grant" "Pending" "$(jq_ "d['data']['status']")"

call GET "/api/hr/leave/my-requests/$RID/progress" "$REQ"
check "the requester can read their own progress" 200 "$CODE" "$BODY"
check "the flow renders six steps" "6" "$(jq_ "d['data']['total_steps']")"
check "progress captions the request it belongs to" "True" \
  "$(jq_ "all(d['data'].get(k) for k in ('employee_name','leave_type_name','start_date','end_date','days_requested'))")"
check "progress counts signatures separately from steps" "4" "$(jq_ "d['data']['signatures_total']")"
check "two signatures are recorded at this point" "2" "$(jq_ "d['data']['signatures_done']")"
check "the submission and outcome are not counted as signatures" "True" \
  "$(jq_ "d['data']['signatures_total'] == d['data']['total_steps'] - 2")"
check "step 1 is the responsible officer's preparation" "Prepared by (Responsible Officer)" \
  "$(jq_ "d['data']['steps'][0]['label']")"
check "every progress step carries its clock fields" "True" \
  "$(jq_ "all(k in s for s in d['data']['steps'] for k in ('sla_hours','decided_at','actor','actor_role'))")"
check "the awaiting step reports how long it has waited" "True" \
  "$(jq_ "any(s['state']=='current' and s.get('hours_waiting') is not None for s in d['data']['steps'])")"
check "each signed stage names the office that signed it" "True" \
  "$(jq_ "all(s['actor_role'] for s in d['data']['steps'][1:3])")"
check "progress lists the recorded decisions" "3" "$(jq_ "len(d['data']['history'])")"

call GET "/api/hr/leave/requests/$RID/progress" "$HR"
check "a reviewer can read the progress of any request" 200 "$CODE" "$BODY"

call POST "/api/hr/leave/approvals/$RID/decide" "$DAF" '{"decision":"approved","comment":"Funds available."}'
check "the DAF signs" 200 "$CODE" "$BODY"
check "it returns to the VC for final authorization" "Vice Chancellor — Final Authorization" \
  "$(jq_ "d['data']['current_stage_label']")"

call POST "/api/hr/leave/requests/$RID/reject" "$HR" '{"comment":""}'
check "a rejection with no reason is refused" 422 "$CODE"
call POST "/api/hr/leave/requests/$RID/request-changes" "$HR" '{"comment":"Attach the invitation."}'
check "the final authoriser can send the request back for changes" 200 "$CODE" "$BODY"
check "the request is now awaiting the requester" "ChangesRequested" "$(jq_ "d['data']['status']")"
check "it stays parked at the stage that flagged it" "4" "$(jq_ "d['data']['current_stage_order']")"

call POST "/api/hr/leave/my-requests/$RID/resubmit" "$REQ" '{"reason":"Invitation attached."}'
check "the requester can resubmit" 200 "$CODE" "$BODY"
check "resubmission returns it to review" "Pending" "$(jq_ "d['data']['status']")"
check "resubmission returns it to the SAME stage" "4" "$(jq_ "d['data']['current_stage_order']")"

call POST "/api/hr/leave/approvals/$RID/decide" "$HR" '{"decision":"approved","comment":"Authorised."}'
check "the final authorization grants the leave" 200 "$CODE" "$BODY"
check "the request is Approved" "Approved" "$(jq_ "d['data']['status']")"

# Same decision, two tables: the audit trail's decided_at and the request's
# reviewed_at must agree. They are written by MySQL and the application
# respectively, so a timezone mismatch shows up here as hours of drift.
call GET "/api/hr/leave/requests/$RID/progress" "$HR"
check "the audit trail and the request row share one clock" "True" \
  "$(jq_ "abs((__import__('datetime').datetime.fromisoformat(d['data']['steps'][-1]['decided_at']) - __import__('datetime').datetime.fromisoformat(max(h['decided_at'] for h in d['data']['history']))).total_seconds()) < 120")"
check "every signature is attributed" "True" \
  "$(jq_ "all(s['actor'] for s in d['data']['steps'][1:5])")"

call POST "/api/hr/leave/approvals/$RID/decide" "$HR" '{"decision":"approved"}'
check "a granted request cannot be decided again" 422 "$CODE"

call DELETE "/api/hr/leave/requests/$RID" "$HR"
check "cancelling a granted leave needs MANAGE_LEAVE_REQUESTS" 403 "$CODE"
call DELETE "/api/hr/leave/my-requests/$RID" "$REQ"
check "the requester cannot cancel a granted leave" 422 "$CODE"

echo
echo "Notification centre"
call GET /api/notifications/unread-count "$REQ"
check "the unread-count endpoint is reachable" 200 "$CODE" "$BODY"
CODE_ANON=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/notifications/unread-count")
check "notifications reject an anonymous caller" 401 "$CODE_ANON"

call GET /api/notifications "$REQ"
check "the notification list is readable" 200 "$CODE" "$BODY"
check "the requester was notified about every step of their request" "True" \
  "$(jq_ "len([n for n in d['data']['data'] if n['entity_type']=='leave_request' and n['entity_id']==$RID]) >= 4")"
check "a notification carries a deep link" "/me/leave" \
  "$(jq_ "next(n['link'] for n in d['data']['data'] if n['entity_id']==$RID)")"
check "the grant notification is marked as a success" "success" \
  "$(jq_ "next(n['severity'] for n in d['data']['data'] if n['type']=='LEAVE_APPROVED')")"
check "the changes-requested notification is a warning" "warning" \
  "$(jq_ "next(n['severity'] for n in d['data']['data'] if n['type']=='LEAVE_CHANGESREQUESTED')")"

# The approver was notified when it arrived, and that notification has since
# been retired — the request is granted, so it is no longer awaiting anyone.
call GET /api/notifications "$VC"
check "the stage-1 approver was told a request needed them" "True" \
  "$(jq_ "any(n['type']=='LEAVE_AWAITING_DECISION' and n['entity_id']==$RID for n in d['data']['data'])")"
check "that action notification links to the approval queue" "/hr/leave/approvals" \
  "$(jq_ "next(n['link'] for n in d['data']['data'] if n['type']=='LEAVE_AWAITING_DECISION')")"
call GET "/api/notifications?unread=1" "$VC"
check "a settled request stops asking the approver to decide it" "False" \
  "$(jq_ "any(n['type']=='LEAVE_AWAITING_DECISION' and n['entity_id']==$RID for n in d['data']['data'])")"
call GET /api/notifications "$NOB"
check "an unrelated user is notified about nothing" "0" "$(jq_ "d['data']['total']")"

# One unread id, so we can prove read-marking is scoped to its owner.
call GET /api/notifications "$REQ"
NID=$(jq_ "next((n['id'] for n in d['data']['data'] if not n['is_read']), 0)")
call POST "/api/notifications/$NID/read" "$HR"
check "one user cannot mark another's notification read" 404 "$CODE"
call POST "/api/notifications/$NID/read" "$REQ"
check "the owner can mark their notification read" 200 "$CODE" "$BODY"

call GET "/api/notifications?unread=1" "$REQ"
check "a read notification leaves the unread list" "False" \
  "$(jq_ "any(n['id']==$NID for n in d['data']['data'])")"

call POST /api/notifications/read-entity "$REQ" "{\"entity_type\":\"leave_request\",\"entity_id\":$RID}"
check "opening a record clears its notifications" 200 "$CODE" "$BODY"
call GET "/api/notifications?unread=1" "$REQ"
check "nothing about that record is left unread" "0" \
  "$(jq_ "len([n for n in d['data']['data'] if n['entity_id']==$RID])")"

call POST /api/notifications/read-entity "$REQ" '{"entity_type":"","entity_id":0}'
check "read-entity validates its input" 422 "$CODE"

call POST /api/notifications/read-all "$REQ"
check "mark-all-read succeeds" 200 "$CODE" "$BODY"
call GET /api/notifications/unread-count "$REQ"
check "mark-all-read leaves nothing unread" "0" "$(jq_ "d['data']['total']")"

echo
echo "──────────────────────────────────────────────────────────────"
echo "  passed: $pass   failed: $fail"
echo "──────────────────────────────────────────────────────────────"
exit $([ $fail -eq 0 ] && echo 0 || echo 1)
