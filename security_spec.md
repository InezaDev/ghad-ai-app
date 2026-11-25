# GHAD AI — Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Strict Ownership & Email Verification**: Every teacher document under `/users/{userId}` and its subcollections (`private`, `plans`, `chats`, `assessments`, `methodologies`) is readable and writable **only** by the authenticated, email-verified user whose `request.auth.uid == userId`.
2. **Master Gate Relational Integrity**: Subcollection writes (`plans`, `chats`, `assessments`, `methodologies`, `private`) verify that the parent `/users/{userId}` document exists and has `data.uid == request.auth.uid` via `get()`.
3. **PII Isolation**: Email addresses and teacher/school identity fields live exclusively in `/users/{userId}/private/profile` (never in `/users/{userId}`), with `allow list: if false` and `allow get: if isVerifiedOwner(userId)`.
4. **Immortal Identity & Temporal Integrity**: `uid`, `id`, and `createdAt` cannot be modified after creation; `createdAt == request.time` on create and `updatedAt == request.time` on create/update.
5. **Bounded Payloads & Strict Keys**: Every collection validates `keys().hasAll(...) && keys().hasOnly(...)` on create, `affectedKeys().hasOnly(...)` on update, string `.size()` bounds (including optional REB `assessmentCriteria` <= 2000, `homework` <= 2000, and stage `observations` <= 1500), regex ID validation (`^[a-zA-Z0-9_\-]+$`), and bounded array lengths (`stages.size() <= 15`, `messages.size() <= 100`, `questions.size() <= 40`, `strategies.size() <= 20`).
6. **Secure List Queries**: `allow list` on subcollections explicitly validates `isVerifiedOwner(userId) && resource.data.uid == request.auth.uid` without calling `get()`/`exists()` inside `list`.

## 2. The "Dirty Dozen" Attack Payloads (All Must Fail with PERMISSION_DENIED)
1. **Unauthenticated Read/Write**: Unauthenticated user tries `get` or `create` on `/users/userA/plans/plan1`.
2. **Unverified Email Write**: Authenticated user with `email_verified: false` tries to `create` `/users/userA/private/profile`.
3. **Cross-Tenant Read**: User B (`uid: userB`) tries `get` or `list` on `/users/userA/plans`.
4. **Cross-Tenant PII Read**: User B tries `get` on `/users/userA/private/profile`.
5. **Identity Spoofing on Create**: User A tries to `create` `/users/userA/plans/plan1` with `uid: "userB"`.
6. **Shadow / Ghost Field Injection**: User A tries to `create` `/users/userA` with `{ uid: "userA", displayName: "Alice", isAdmin: true, createdAt: ..., updatedAt: ... }`.
7. **Orphaned Subcollection Write**: User A tries to `create` `/users/userA/plans/plan1` before `/users/userA` parent exists.
8. **ID Poisoning**: User A tries to `create` `/users/userA/plans/bad..id$with/chars` or a 500-char ID.
9. **Immortal Timestamp Tampering**: User A tries to `update` `/users/userA/plans/plan1` and mutate `createdAt` or `uid`.
10. **Client-Spoofed Timestamp**: User A tries to `create` `/users/userA/plans/plan1` with `createdAt` set to a fake past timestamp instead of `request.time`.
11. **Unbounded Array / Value Poisoning**: User A tries to `create` `/users/userA/chats/chat1` with `messages` of length 101 or a 50KB `title`.
12. **Root Catch-All / Unknown Collection**: Any user tries to read or write `/admins/userA` or `/public_leaks/doc1`.
