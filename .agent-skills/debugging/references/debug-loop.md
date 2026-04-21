# Debugging Loop

Use this loop when the failure has moved beyond raw symptom collection and the next job is causal reasoning.

1. **Define the failure**
   - expected vs actual
   - trigger/input/state
   - environment
   - deterministic vs flaky
   - known-good vs known-bad if available

2. **Build the smallest reproducer**
   - one command, one test, one request, one UI flow, one fixture, or one commit range
   - remove unrelated setup until the failure is cheap to rerun

3. **Isolate the boundary**
   - code path
   - data/fixture
   - config/flag/env
   - dependency/service
   - timing/concurrency/order
   - history/change range

4. **Run a discriminating check**
   - inspect one suspect branch
   - compare one good vs bad state
   - rerun one focused test
   - use `git bisect` when a reliable pass/fail signal exists
   - add temporary instrumentation only at the narrowed boundary

5. **Record keep/reject decisions**
   - hypothesis
   - check performed
   - result
   - confidence

6. **Verify the fix**
   - reproducer passes
   - nearby edge cases still pass
   - regression guard added

## Practical rule
If you still cannot name the failing boundary, you are probably still in symptom triage and should sharpen the input first.
