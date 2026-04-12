# Handoff Boundaries

Use this file when the request is drifting away from testing policy and into implementation, diagnosis, or review.

## Keep work in `testing-strategies` when
- the user asks what validation layers are required
- the repo needs merge / release / nightly gate policy
- the team needs a risk-based coverage recommendation
- the problem is over-broad, flaky, or expensive validation policy
- the question is whether a change deserves unit vs integration vs contract vs smoke coverage

## Route to `backend-testing` when
- the policy is already chosen and the user now needs to write or repair API/service/database tests
- fixture/factory/seed/reset strategy is the main work
- mock vs fake vs containerized dependency decisions need stack-specific implementation detail
- the team needs concrete test-runner patterns or examples for backend code

## Route to `debugging` when
- a test is already failing and the main question is why
- the suite is flaky because of an unknown root cause
- the task is reproducing, isolating, or verifying a failure rather than choosing policy

## Route to `code-review` when
- a specific PR or diff needs reviewer judgment
- the question is whether the submitted evidence is convincing enough to approve or request changes
- the task is classifying review findings by severity

## Route to `performance-optimization` when
- performance, throughput, latency, memory, or scale is the dominant risk
- the team needs benchmarking/load-test strategy more than functional validation policy

## Route to `web-accessibility` or `web-design-guidelines` when
- accessibility, visual QA, responsive behavior, or design-system compliance is the main validation surface
- screenshots, keyboard navigation, or assistive-tech evidence dominate the review

## Simple heuristic
- "What should we test?" → `testing-strategies`
- "How do we implement those tests?" → `backend-testing`
- "Why is this test failing?" → `debugging`
- "Is this PR ready?" → `code-review`
