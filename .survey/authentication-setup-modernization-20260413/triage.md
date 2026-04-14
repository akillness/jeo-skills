# Triage
- Problem: `authentication-setup` is still a legacy catch-all skill that mixes authn, authz, security hardening, SSO, and large code dumps instead of acting like a modern product-auth setup router.
- Audience: Fullstack and backend developers shipping product authentication for web and API systems, especially SaaS apps that need login plus roles, organizations, or protected APIs.
- Why now: The backend cluster already has sharper neighbors (`api-design`, `api-documentation`, `backend-testing`), and `authentication-setup` is now the weakest highly visible boundary in that lane while still lacking both `references/` and `evals/`.
