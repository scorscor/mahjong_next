# Phase 1: Fix Fatal Bugs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all critical bugs blocking a complete 4-round mahjong match, then verify through integration testing.

**Architecture:** Backend-first fixes (missing import, method overwrite, claim timeout), then frontend fixes (claim data mismatch, optimistic discard), then full end-to-end testing.

**Tech Stack:** Node.js/Express/Socket.IO (backend), Vue 3/Vite/Pinia (frontend), Vitest (backend tests)

---

## Critical Bugs Found (Code Review)

### BUG-1: Missing `MahjongGame` import in handlers.js (BLOCKER)
**File:** `backend/src/socket/handlers.js:1` and `:367`
**Problem:** Line 367 uses `new MahjongGame(...)` but the class is never imported. Only `gameStore` is imported. This causes a `ReferenceError` when `next_round` is triggered, making multi-round games impossible.
**Fix:** Add `import { MahjongGame } from '../game/MahjongGame.js';` at the top.

### BUG-2: `room.endGame = undefined` overwrites prototype method
**File:** `backend/src/socket/handlers.js:368`
**Problem:** This line overwrites `Room.prototype.endGame` (a method) with `undefined`. After this, any call to `room.endGame()` throws `TypeError: room.endGame is not a function`.
**Fix:** Delete this line entirely. It serves no purpose — creating a new `MahjongGame` instance on the next line is sufficient.

### BUG-3: Claim window has no timeout
**File:** `backend/src/game/MahjongGame.js` (throughout claim system)
**Problem:** `_tryResolveClaims()` waits for ALL required responders. If any player disconnects or stops responding, the game hangs permanently.
**Fix:** Add a 30-second auto-pass timer in the `discardTile` method when opening a claim window.

### BUG-4: Frontend `claim_window_opened` data mismatch
**File:** `backend/src/socket/handlers.js:266-270` and `frontend/src/pages/game/game.vue:521-538`
**Problem:** Backend sends `{ discardTile, discardedBy, potentialClaimers: [playerIndices] }` but frontend expects `{ discardTile, fromPlayer, eligiblePlayers: [{playerIndex, canWin, ...}] }`. The new claim path silently fails, falling back to the legacy `can_claim` event.
**Fix:** Remove the `claim_window_opened` handler in frontend (it's non-functional). Keep only the working `can_claim` path, OR fix the backend to send the correct data structure. The simpler fix: remove `claim_window_opened` from both sides since `can_claim` already works.

### BUG-5: Optimistic discard causes state desync
**File:** `frontend/src/pages/game/game.vue:698-707`
**Problem:** `discardSelected()` removes the tile from `myHand` before server confirmation. If the server rejects the discard, local state is wrong.
**Fix:** Don't modify `myHand` in `discardSelected()`. Wait for `tile_discarded` event to confirm, or wait for `game_state_update` to sync.

### BUG-6: Dead code — `WinChecker.calculateFan()`
**File:** `backend/src/game/WinChecker.js:156-270`
**Problem:** This method is never called (Scorer.calculateFan is used instead). It's 115 lines of dead code.
**Fix:** Remove lines 152-270 from WinChecker.js.

### BUG-7: Frontend game state not reset between rounds
**File:** `frontend/src/pages/game/game.vue:778-781`
**Problem:** `nextRound()` only sets `finished.value = false` and emits the event. Old `playerDiscards`, `myMelds`, `otherMelds`, `chatBubbles`, etc. are not cleared. When `game_started` fires for the new round, `updateState()` sets some fields but `playerDiscards` and others remain stale.
**Fix:** Add a `resetForNewRound()` function that clears round-specific state, called from both `game_started` handler and `nextRound()`.

---

## File Structure

### Backend files to modify:
- `backend/src/socket/handlers.js` — Fix import (BUG-1), remove endGame line (BUG-2), fix claim_window_opened (BUG-4)
- `backend/src/game/MahjongGame.js` — Add claim timeout (BUG-3)
- `backend/src/game/WinChecker.js` — Remove dead code (BUG-6)

### Frontend files to modify:
- `frontend/src/pages/game/game.vue` — Fix optimistic discard (BUG-5), remove broken claim_window_opened handler (BUG-4), add round reset (BUG-7)

---

## Tasks

### Task 1: Fix BUG-1 — Add missing MahjongGame import

**Files:**
- Modify: `backend/src/socket/handlers.js:1`

- [ ] **Step 1: Add the import**

In `backend/src/socket/handlers.js`, add the import after the existing one on line 1:

```javascript
import { gameStore } from '../store/GameStore.js';
import { MahjongGame } from '../game/MahjongGame.js';
```

- [ ] **Step 2: Verify no syntax errors**

Run: `cd D:/work/mojang_next/backend && node -e "import('./src/socket/handlers.js').then(() => console.log('OK')).catch(e => console.error(e.message))"`

Expected: No import errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/socket/handlers.js
git commit -m "fix: add missing MahjongGame import in socket handlers"
```

---

### Task 2: Fix BUG-2 — Remove room.endGame = undefined

**Files:**
- Modify: `backend/src/socket/handlers.js:368`

- [ ] **Step 1: Delete the offending line**

Remove line 368: `room.endGame = undefined; // clear`

The surrounding code should look like:
```javascript
      // Start next round
      room.state = 'playing';
      room.game = new MahjongGame(room.players, room.matchSession.dealerIndex);

      const matchInfo = room.matchSession.getState();
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/socket/handlers.js
git commit -m "fix: remove room.endGame=undefined that breaks Room.endGame method"
```

---

### Task 3: Fix BUG-6 — Remove dead calculateFan from WinChecker

**Files:**
- Modify: `backend/src/game/WinChecker.js:152-270`

- [ ] **Step 1: Remove dead code**

Delete lines 152 through 270 (the `calculateFan` method and its comment header `// --- Fan (point) calculation ---`). Keep everything else, including `_extractSets`, `_extractSetsRecursive`, `_isHonorTile`, `_checkFlush`, `_tileDisplayName`, `getChowOptions` which are used by the legacy method but may be useful.

Actually, check: after removing `calculateFan`, check if `_extractSets`, `_extractSetsRecursive`, `_isHonorTile`, `_checkFlush`, `_tileDisplayName` are used anywhere else. If not, remove them too.

- [ ] **Step 2: Verify Scorer.js is the only fan calculator**

Run: `cd D:/work/mojang_next/backend && grep -rn "calculateFan" src/`

Expected: Only `src/game/Scorer.js` should contain `calculateFan`.

- [ ] **Step 3: Run existing tests**

Run: `cd D:/work/mojang_next/backend && npx vitest run`

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/src/game/WinChecker.js
git commit -m "fix: remove dead calculateFan code from WinChecker (Scorer is used instead)"
```

---

### Task 4: Fix BUG-3 — Add claim window timeout

**Files:**
- Modify: `backend/src/game/MahjongGame.js`

- [ ] **Step 1: Add timeout mechanism**

In `MahjongGame.js`, add a `claimTimerId` property in the constructor (after `this.claimWindow = null;` on line 38):

```javascript
this.claimTimerId = null;
```

Add a new method `startClaimTimer`:

```javascript
startClaimTimer(onTimeout) {
  this.clearClaimTimer();
  this.claimTimerId = setTimeout(() => {
    if (this.claimWindow && !this.claimWindow.resolved) {
      // Auto-pass anyone who hasn't responded
      for (const idx of this.claimWindow.requiredResponders) {
        if (!this.claimWindow.claims.has(idx) && !this.claimWindow.passes.has(idx)) {
          this.claimWindow.passes.add(idx);
        }
      }
      onTimeout();
    }
  }, 30000);
}

clearClaimTimer() {
  if (this.claimTimerId) {
    clearTimeout(this.claimTimerId);
    this.claimTimerId = null;
  }
}
```

- [ ] **Step 2: Start timer when claim window opens**

In `discardTile()` method, after setting `this.claimWindow` (around line 196), add timer start. The handler needs to receive the callback. We'll handle this in the socket handler.

Add to the `discardTile` return value when `potentialClaims.length > 0`:

```javascript
if (potentialClaims.length > 0) {
  this.claimWindow = {
    discardTile: tile,
    excludePlayer: playerIndex,
    claims: new Map(),
    passes: new Set(),
    resolved: false,
    requiredResponders: new Set(potentialClaims.map(c => c.playerIndex))
  };
  // Timer will be started by the socket handler
  return {
    success: true,
    nextPlayer: this.currentPlayer,
    tilesLeft: this.tileSet.remaining,
    potentialClaims,
    claimTimerNeeded: true
  };
}
```

- [ ] **Step 3: Hook timer into socket handler**

In `backend/src/socket/handlers.js`, in the `discard_tile` handler, after the claim window check, start the timer:

```javascript
// After the claim_window_opened / can_claim emit block:
if (result.claimTimerNeeded) {
  room.game.startClaimTimer(() => {
    const resolveResult = room.game._tryResolveClaims();
    if (resolveResult.success && resolveResult.resolved === 'pass') {
      io.to(roomId).emit('claim_resolved', {
        type: 'pass',
        nextPlayer: resolveResult.nextPlayer
      });
    }
    // Other resolutions are already handled by declare_claim/pass_claim
  });
}
```

Also clear the timer when claims resolve — in `declare_claim` handler, after any successful resolution:
```javascript
room.game.clearClaimTimer();
```

And in `pass_claim` handler similarly.

- [ ] **Step 4: Run tests**

Run: `cd D:/work/mojang_next/backend && npx vitest run`

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/game/MahjongGame.js backend/src/socket/handlers.js
git commit -m "feat: add 30s claim window timeout to prevent game hangs"
```

---

### Task 5: Fix BUG-4 — Fix claim event data flow

**Files:**
- Modify: `backend/src/socket/handlers.js:243-271`
- Modify: `frontend/src/pages/game/game.vue:518-576`

- [ ] **Step 1: Remove claim_window_opened from backend**

In `handlers.js`, remove the `claim_window_opened` broadcast (lines 266-270):

```javascript
// DELETE these lines:
io.to(roomId).emit('claim_window_opened', {
  discardTile: tile,
  discardedBy: playerIndex,
  potentialClaimers: [...playerClaims.keys()]
});
```

The `can_claim` event sent to individual players (lines 252-263) already works correctly and the frontend handles it.

- [ ] **Step 2: Remove claim_window_opened handler from frontend**

In `game.vue`, remove the `socket.on('claim_window_opened', ...)` handler (lines 521-538).

- [ ] **Step 3: Remove legacy claim_applied handler from frontend**

In `game.vue`, remove the `socket.on('claim_applied', ...)` handler (lines 573-576).

- [ ] **Step 4: Clean up onUnmounted events list**

In `game.vue`, remove `'claim_window_opened'` and `'claim_applied'` from the cleanup list (line 635).

- [ ] **Step 5: Commit**

```bash
git add backend/src/socket/handlers.js frontend/src/pages/game/game.vue
git commit -m "fix: remove broken claim_window_opened event, use working can_claim path"
```

---

### Task 6: Fix BUG-5 — Fix optimistic discard

**Files:**
- Modify: `frontend/src/pages/game/game.vue:698-707`

- [ ] **Step 1: Remove optimistic hand update**

Replace the `discardSelected()` function:

```javascript
function discardSelected() {
  if (!selectedTile.value) return
  const tileToDiscard = selectedTile.value
  socket.emit('discard_tile', { roomId: roomId.value, tile: tileToDiscard })
  // Don't modify myHand here — wait for server confirmation
  // The tile_discarded event or game_state_update will sync the state
  selectedTile.value = null
  selectedIndex.value = -1
  currentDrawnTile.value = null
  // Keep hasDrawn as-is; server state will update it
}
```

- [ ] **Step 2: Ensure tile_discarded handler updates own hand**

In the `tile_discarded` handler (line 496), add hand update for self:

```javascript
socket.on('tile_discarded', (data) => {
  playSFX('discard')
  if (data.playerIndex !== undefined) {
    playerDiscards.value[data.playerIndex] = [
      ...playerDiscards.value[data.playerIndex],
      data.tile
    ]
    lastDiscardPlayer.value = data.playerIndex
    // Update own hand if this is my discard
    if (data.playerIndex === myIndex.value) {
      const idx = myHand.value.indexOf(data.tile)
      if (idx !== -1) myHand.value.splice(idx, 1)
      hasDrawn.value = false
    }
  }
  lastDiscard.value = data.tile
  currentPlayer.value = data.nextPlayer
  selectedTile.value = null
  selectedIndex.value = -1
  currentDrawnTile.value = null
  clearClaimState()
  if (data.playerIndex !== undefined && data.playerIndex !== myIndex.value) {
    if (typeof otherHands.value[data.playerIndex] === 'number') {
      otherHands.value[data.playerIndex] -= 1
    }
  }
})
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/game/game.vue
git commit -m "fix: remove optimistic discard update, wait for server confirmation"
```

---

### Task 7: Fix BUG-7 — Reset state between rounds

**Files:**
- Modify: `frontend/src/pages/game/game.vue`

- [ ] **Step 1: Add resetForNewRound function**

Add after the `clearClaimState` function (around line 652):

```javascript
function resetForNewRound() {
  playerDiscards.value = [[], [], [], []]
  myMelds.value = []
  otherMelds.value = [[], [], [], []]
  chatBubbles.value = []
  tingpaiDetails.value = []
  selfKongTiles.value = []
  lastDiscard.value = null
  lastDiscardPlayer.value = -1
  selectedTile.value = null
  selectedIndex.value = -1
  currentDrawnTile.value = null
  showTingpai.value = false
  gameOverFan.value = null
  gameOverPatterns.value = []
  clearClaimState()
}
```

- [ ] **Step 2: Call resetForNewRound from game_started handler**

In the `game_started` handler (line 453), call `resetForNewRound()` before `updateState(data)`:

```javascript
socket.on('game_started', (data) => {
  resetForNewRound()
  myIndex.value = data.playerIndex
  if (data.roundNumber) roundNumber.value = data.roundNumber
  if (data.totalRounds) totalRounds.value = data.totalRounds
  if (data.matchSession) {
    dealerIndex.value = data.matchSession.dealerIndex
    roundWindName.value = data.matchSession.roundWindName
    matchRunningScores.value = data.matchSession.runningScores
    matchFinished.value = data.matchSession.finished
  }
  updateState(data)
  store.gamePhase = 'playing'
})
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/game/game.vue
git commit -m "fix: properly reset game state between rounds"
```

---

### Task 8: Run backend tests

**Assign to:** test-expert

**Files:**
- All backend test files in `backend/tests/`

- [ ] **Step 1: Run all vitest tests**

Run: `cd D:/work/mojang_next/backend && npx vitest run`

Expected: All tests pass. Report any failures.

- [ ] **Step 2: Report results**

Report the test output: number of tests passed/failed, any errors found.

---

### Task 9: Full integration test — End-to-end game flow

**Assign to:** test-expert

**Prerequisites:** Tasks 1-7 completed, Tasks 8 passed.

- [ ] **Step 1: Start backend server**

Run: `cd D:/work/mojang_next/backend && npm run dev`

Verify: Server starts on port 3000, no errors.

- [ ] **Step 2: Start frontend dev server**

Run: `cd D:/work/mojang_next/frontend && npm run dev`

Verify: Vite starts on port 5173, no errors.

- [ ] **Step 3: Test create room flow**

Open browser tab 1 → `http://localhost:5173` → Enter name "Player1" → Click "创建房间"

Expected: Room created, redirected to `/room/XXXXXX`, see Player1 listed.

- [ ] **Step 4: Test join room flow**

Open tabs 2, 3, 4 → Enter names "Player2", "Player3", "Player4" → Enter room code → Click "加入房间"

Expected: All 4 players visible in room. "开始游戏" button appears.

- [ ] **Step 5: Test game start**

In tab 1 (creator) → Click "开始游戏"

Expected: All 4 tabs redirect to `/game/XXXXXX`. Each player sees their hand of tiles. Dealer sees 14 tiles.

- [ ] **Step 6: Test draw and discard**

In the dealer's tab → Watch auto-draw → Select a tile → Click "打出"

Expected: Tile moves to discard zone. Turn passes to next player.

- [ ] **Step 7: Test claim (碰/吃/杠)**

Continue playing until someone can pong/chow. Click the claim button.

Expected: Claim applied, meld appears, turn changes correctly.

- [ ] **Step 8: Test win (胡)**

Play until someone can win. Click "胡" button.

Expected: Game over overlay appears. Winner, fan count, scores displayed correctly.

- [ ] **Step 9: Test next round**

Creator clicks "下一局".

Expected: New round starts. All discards cleared. New hands dealt. **No crashes.**

- [ ] **Step 10: Test complete 4-round match**

Complete all 4 rounds. After final round:

Expected: "查看最终结果" button appears. Click → redirected to scoreboard with correct cumulative scores.

- [ ] **Step 11: Document all findings**

For each test step, record: PASS/FAIL, any errors in browser console, any unexpected behavior.

---

### Task 10: Fix issues found during integration test

**Assign to:** fullstack-dev

**Prerequisites:** Task 9 completed with reported issues.

- [ ] **Step 1: Review test-expert's report**

Read the test results and identify all failures.

- [ ] **Step 2: Fix each reported issue**

Fix issues one by one, committing after each fix.

- [ ] **Step 3: Re-test**

Ask test-expert to re-test affected areas.

---

## Self-Review

**Spec coverage:** All 7 bugs from the spec have corresponding tasks (1-7). Integration testing is tasks 8-10.

**Placeholder scan:** No TBD/TODO/fill-in-later. All steps contain actual code or commands.

**Type consistency:** `claimTimerNeeded` flag added to `discardTile` return and checked in handler. `resetForNewRound` function defined and called from `game_started`. All method/variable names consistent across tasks.
