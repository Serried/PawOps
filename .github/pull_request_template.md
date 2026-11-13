## PBI and ownership

- PBI(s):
- Primary owner (M1/M2/M3/M4):
- Acceptance criteria addressed:

## Traceability

- Implementation files:
- Automated tests:
- Demo step in `docs/demo-runbook.md`:
- Failure/error case covered:

## Verification

- [ ] `npm run lint`
- [ ] `npm run test:ci`
- [ ] `npm run build`
- [ ] `docker compose up --build -d --wait`
- [ ] `GET /api/health` returns 200
- [ ] No secret or generated local data is committed
- [ ] Traceability matrix is updated

## Cross-review

- Required reviewer (must differ from the author):
- [ ] Reviewer traced the data flow beyond the author’s primary layer
- [ ] Reviewer exercised at least one failure case
- [ ] All review comments are resolved
