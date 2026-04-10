# Phase 1: Fix Fatal Bugs and Run Through Full Flow

## Goal

Fix all known critical/serious bugs, then run integration testing to verify the complete game flow works end-to-end for one full match (4 rounds).

## Scope

Backend bug fixes, frontend bug fixes, integration testing. No new features in this phase.

## Bug Fixes

### Backend (4 items)

1. **endGame method overwritten** (`handlers.js:368`)
   - `room.endGame = undefined` overwrites the Room.prototype.endGame method
   - Fix: Remove this line or use a different property name like `room._endGameFlag`

2. **Pong/Kong detection confusion** (`MahjongGame.js:223-224`)
   - 3 identical tiles in hand triggers kong claim instead of pong
   - Fix: When a player has exactly 3 of a discarded tile, offer both pong AND kong options; when 2 tiles, only offer pong

3. **Claim window timeout missing** (`MahjongGame.js`)
   - No auto-pass timeout; game hangs if a player disconnects or stops responding
   - Fix: Add 30-second timer on claim window; auto-pass all pending claims on timeout

4. **Duplicate fan calculation dead code** (`WinChecker.js:156-270`)
   - `WinChecker.calculateFan()` is dead code (Scorer.calculateFan() is actually used)
   - Fix: Remove the dead calculateFan method from WinChecker

### Frontend (3 items)

5. **Optimistic discard update** (`game.vue`)
   - Card removed from hand before server confirms
   - Fix: Only update hand after receiving server confirmation (`tile_discarded` event)

6. **Legacy claim system compatibility code** (`game.vue`)
   - Old `can_claim`/`claim_applied` listeners still present alongside new system
   - Fix: Remove legacy event listeners since backend uses the new claim system

7. **Game over state cleanup** (`game.vue`)
   - Verify all state resets correctly between rounds and after match end
   - Fix: Add explicit state reset on `game_over` and proper cleanup on `match_finished`

## Testing Plan

- Test expert starts both frontend and backend servers
- Opens 4 browser tabs, each joining the same room with different names
- Executes a complete game round: draw -> discard -> chow/pong/kong/win
- Tests edge cases: decline claims, self-kong, tingpai hints, quick chat
- Completes a full 4-round match including scoreboard
- Reports all issues with steps to reproduce

## Execution Strategy

**Parallel approach**: Full-stack dev fixes backend and frontend bugs simultaneously. Test expert prepares test environment and test cases. Once fixes are ready, test expert runs integration tests and reports findings. Dev fixes any new issues discovered during testing.

## Success Criteria

- Complete 4-round match without crashes or hangs
- All player actions (draw, discard, chow, pong, kong, win) work correctly
- Claim window resolves correctly (priority, timeout)
- Scoreboard displays correct cumulative scores
- No console errors during normal gameplay
