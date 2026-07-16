# Security Specification & Threat Model

This document outlines the security architecture and threat modeling for the Story Studio AI-powered storytelling platform. It provides the data invariants, 12 adversarial "Dirty Dozen" payloads designed to bypass rules, and the test-case descriptions used to verify absolute zero-trust security.

## 1. Data Invariants

1. **User Identity Invariant**: A user document (`/users/{userId}`) can only be created and updated by the user themselves. Roles (`role`) and statuses (`authorStatus`) cannot be escalated by standard users; they require administrative privilege.
2. **Story Authorship Invariant**: A story can only be created, modified, or deleted by its registered author or by an administrator. The `authorId` must strictly match the creator's authenticated user ID.
3. **Chapter Integrity Invariant**: A chapter can only be created, modified, or deleted by the author of the parent story or an administrator.
4. **Reading Progress Isolation**: A user's reading progress is private and can only be accessed or updated by the authenticated owner of the progress record.
5. **Character Creator Ownership**: Created characters are strictly private to the user who generated them.
6. **Like and Rating Integrity**: A user can only create or update their own like or rating. Likes and ratings can only be deleted by the user who created them.
7. **System-Only and Read-Only Fields**: Fields like `createdAt`, `averageRating`, `likesCount`, `ratingCount`, and `viewsCount` are system-managed on stories and cannot be arbitrarily manipulated by standard clients.

---

## 2. The "Dirty Dozen" Adversarial Payloads

Here are the 12 attack vectors designed to challenge and bypass the Firestore security policy:

### Payload 1: Self-Escalation to Admin Role
* **Target Path**: `/users/attacker_uid`
* **Intended Exploit**: Attacker attempts to modify their role to `admin`.
* **Payload**:
  ```json
  {
    "uid": "attacker_uid",
    "email": "attacker@exploit.com",
    "role": "admin",
    "authorStatus": "approved"
  }
  ```
* **Expected Result**: `PERMISSION_DENIED`

### Payload 2: Author Status Spoofing
* **Target Path**: `/users/attacker_uid`
* **Intended Exploit**: Standard user attempts to mark themselves as `approved` author without admin vetting.
* **Payload**:
  ```json
  {
    "uid": "attacker_uid",
    "email": "attacker@exploit.com",
    "role": "user",
    "authorStatus": "approved"
  }
  ```
* **Expected Result**: `PERMISSION_DENIED`

### Payload 3: Story Authorship Hijacking (Impersonation)
* **Target Path**: `/stories/story_123`
* **Intended Exploit**: User `attacker_uid` attempts to create a story with `authorId: victim_uid`.
* **Payload**:
  ```json
  {
    "authorId": "victim_uid",
    "authorName": "Victim",
    "title": "Stolen Story",
    "content": "Malicious content",
    "status": "draft",
    "safetyStatus": "unchecked"
  }
  ```
* **Expected Result**: `PERMISSION_DENIED`

### Payload 4: Arbitrary Like Count Manipulation
* **Target Path**: `/stories/story_123`
* **Intended Exploit**: Attacker attempts to directly update a story's `likesCount` to `999999`.
* **Payload**:
  ```json
  {
    "likesCount": 999999
  }
  ```
* **Expected Result**: `PERMISSION_DENIED` (Clients cannot arbitrarily modify core metrics)

### Payload 5: Rating Spoofing (Rating as Another User)
* **Target Path**: `/stories/story_123/ratings/victim_uid`
* **Intended Exploit**: Attacker attempts to cast a low rating on behalf of another user.
* **Payload**:
  ```json
  {
    "userId": "victim_uid",
    "rating": 1,
    "createdAt": "2026-07-08T10:00:00Z"
  }
  ```
* **Expected Result**: `PERMISSION_DENIED`

### Payload 6: Duplicate Likes Spoofing
* **Target Path**: `/stories/story_123/likes/attacker_uid`
* **Intended Exploit**: Attacker attempts to set an invalid like payload.
* **Payload**:
  ```json
  {
    "userId": "victim_uid"
  }
  ```
* **Expected Result**: `PERMISSION_DENIED` (userId in Like must match request.auth.uid)

### Payload 7: Chapter Insertion into Another Author's Story
* **Target Path**: `/stories/victim_story_123/chapters/chapter_exploit`
* **Intended Exploit**: Attacker tries to insert a chapter into a story owned by a victim.
* **Payload**:
  ```json
  {
    "id": "chapter_exploit",
    "storyId": "victim_story_123",
    "title": "Hacked Chapter",
    "content": "Vandalized content",
    "order": 1
  }
  ```
* **Expected Result**: `PERMISSION_DENIED` (Master Gate rule prevents chapter additions unless authenticated user is the story owner)

### Payload 8: Premium Only Story Bypass
* **Target Path**: `/stories/premium_story_123`
* **Intended Exploit**: Unauthenticated or free-tier user attempts to read a premium-only story directly.
* **Expected Result**: `PERMISSION_DENIED`

### Payload 9: PII Read Leak (Reading User Profile Privately)
* **Target Path**: `/users/victim_uid`
* **Intended Exploit**: Attacker tries to read another user's profile containing their private email or status.
* **Expected Result**: `PERMISSION_DENIED` (Access is restricted to Owner or Admin)

### Payload 10: Character Creation for Another User
* **Target Path**: `/users/victim_uid/characters/char_123`
* **Intended Exploit**: Attacker tries to create a character under a victim's user path.
* **Payload**:
  ```json
  {
    "id": "char_123",
    "userId": "victim_uid",
    "name": "Hacked Hero"
  }
  ```
* **Expected Result**: `PERMISSION_DENIED`

### Payload 11: Progress Sparing (Modifying Another User's Reading Progress)
* **Target Path**: `/users/victim_uid/readingProgress/story_123`
* **Intended Exploit**: Attacker tries to read or modify the reading percentage of a victim.
* **Payload**:
  ```json
  {
    "storyId": "story_123",
    "progressPercentage": 100,
    "viewedAt": "2026-07-08T10:00:00Z"
  }
  ```
* **Expected Result**: `PERMISSION_DENIED`

### Payload 12: Inappropriate Comment Flag Bypass / Arbitrary Moderation
* **Target Path**: `/stories/story_123/comments/comment_456`
* **Intended Exploit**: Standard user tries to clear the `isReported` flag or decrease `reportCount` on a flagged comment.
* **Payload**:
  ```json
  {
    "id": "comment_456",
    "userId": "author_uid",
    "userName": "Author",
    "text": "Reported comment text",
    "isReported": false,
    "reportCount": 0
  }
  ```
* **Expected Result**: `PERMISSION_DENIED` (Only moderators/admins can clear reports, users can only flag them)

---

## 3. Test Verification Runner Schema

The tests assert that each exploit is caught. The following test script demonstrates the zero-trust setup:

```typescript
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';

describe('Story Studio Firebase Security Rules', () => {
  let testEnv;

  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'story-studio-applet',
      firestore: {
        rules: require('fs').readFileSync('firestore.rules', 'utf8')
      }
    });
  });

  after(async () => {
    await testEnv.cleanup();
  });

  it('Payload 1: Denies self-escalation of roles by standard users', async () => {
    const context = testEnv.authenticatedContext('attacker_uid', { email: 'attacker@exploit.com', email_verified: true });
    const db = context.firestore();
    await assertFails(db.doc('users/attacker_uid').update({ role: 'admin' }));
  });

  it('Payload 3: Denies hijacking authorship of stories', async () => {
    const context = testEnv.authenticatedContext('attacker_uid', { email: 'attacker@exploit.com', email_verified: true });
    const db = context.firestore();
    await assertFails(db.doc('stories/story_123').set({
      authorId: 'victim_uid',
      authorName: 'Victim',
      title: 'Stolen Story',
      content: 'Malicious content',
      status: 'draft',
      safetyStatus: 'unchecked'
    }));
  });

  it('Payload 7: Denies inserting chapters into victim stories', async () => {
    const context = testEnv.authenticatedContext('attacker_uid', { email: 'attacker@exploit.com', email_verified: true });
    const db = context.firestore();
    await assertFails(db.doc('stories/victim_story_123/chapters/exploit').set({
      id: 'exploit',
      storyId: 'victim_story_123',
      title: 'Hacked',
      content: 'Hacked',
      order: 1
    }));
  });
});
```
