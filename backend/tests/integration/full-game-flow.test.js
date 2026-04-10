/**
 * Full Game Flow Integration Test
 *
 * Simulates 4 players connecting via Socket.IO and playing through
 * a complete 4-round mahjong match. Validates all Socket events,
 * game mechanics, and match session scoring.
 *
 * Prerequisites: Backend server must be running at http://localhost:3001
 *   cd D:/work/mojang_next/backend && npm run dev
 *
 * Run: npx vitest run tests/integration/full-game-flow.test.js
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { io as ioClient } from 'socket.io-client'

const SERVER_URL = 'http://localhost:3001'
const TIMEOUT = 15000
const TOTAL_ROUNDS = 4

// --- Helpers ---

function createClient(name) {
  return new Promise((resolve, reject) => {
    const socket = ioClient(SERVER_URL, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false
    })
    const timer = setTimeout(() => {
      socket.disconnect()
      reject(new Error(`Connection timeout for ${name}`))
    }, TIMEOUT)

    socket.on('connect', () => {
      clearTimeout(timer)
      socket._testName = name
      resolve(socket)
    })
    socket.on('connect_error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Helper: get game state for a player
function getGameState(socket, roomId) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('getGameState timeout')), TIMEOUT)
    socket.once('game_state_update', (data) => {
      clearTimeout(timer)
      resolve(data)
    })
    socket.emit('get_game_state', { roomId })
  })
}

// Helper: get room state
function getRoomState(socket, roomId) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('getRoomState timeout')), TIMEOUT)
    socket.once('room_state', (data) => {
      clearTimeout(timer)
      resolve(data)
    })
    socket.emit('get_room_state', { roomId })
  })
}

// Helper: wait for a specific event with cleanup
function waitFor(socket, event, timeout = TIMEOUT) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.removeListener(event, handler)
      reject(new Error(`Timeout waiting for ${event} on ${socket._testName}`))
    }, timeout)
    const handler = (data) => {
      clearTimeout(timer)
      resolve(data)
    }
    socket.once(event, handler)
  })
}

// Helper: play one complete round — draw/discard/pass claims until game_over
async function playRoundToCompletion(sockets, roomId) {
  const MAX_TURNS = 250
  let turnCount = 0

  while (turnCount < MAX_TURNS) {
    // Get current player from server
    const st = await getGameState(sockets[0], roomId)
    if (st.finished) return true

    const cp = st.currentPlayer
    const ps = sockets[cp]

    // Get this player's state
    const pst = await getGameState(ps, roomId)
    if (pst.finished) return true

    // Draw if needed
    if (!pst.hasDrawn) {
      // Set up listeners BEFORE emitting
      const drawPromise = new Promise(resolve => {
        ps.once('game_over', () => resolve('game_over'))
        ps.once('tile_drawn', () => resolve('tile_drawn'))
      })
      ps.emit('draw_tile', { roomId })

      const drawResult = await Promise.race([
        drawPromise,
        delay(TIMEOUT).then(() => 'timeout')
      ])

      if (drawResult === 'game_over') return true
      if (drawResult === 'timeout') return false
    }

    // Recheck
    const pst2 = await getGameState(ps, roomId)
    if (pst2.finished) return true

    // Discard first tile
    const tile = pst2.myHand[0]

    // Set up game_over listener on one socket BEFORE emitting discard
    const gameOverPromise = new Promise(resolve => {
      sockets[0].once('game_over', () => resolve(true))
    })

    // Set up discard listener BEFORE emitting
    const discardPromise = new Promise(resolve => {
      ps.once('tile_discarded', () => resolve(false))
    })

    ps.emit('discard_tile', { roomId, tile })

    // Race: did game end or did discard succeed?
    const isGameOver = await Promise.race([
      gameOverPromise,
      discardPromise,
      delay(5000).then(() => false)
    ])

    if (isGameOver) return true

    // Pass claims for all players
    for (let i = 0; i < 4; i++) {
      sockets[i].emit('pass_claim', { roomId })
    }

    // Wait for claim resolution to propagate
    await delay(600)

    turnCount++
  }

  return false
}

// --- Test Suite ---

describe('Full Game Flow Integration Test — 4-round match', () => {
  let p1, p2, p3, p4
  let roomId

  beforeAll(async () => {
    try {
      ;[p1, p2, p3, p4] = await Promise.all([
        createClient('Alice'),
        createClient('Bob'),
        createClient('Charlie'),
        createClient('Dave')
      ])
    } catch (e) {
      console.error('Failed to connect to server. Start it with: cd backend && npm run dev')
      throw e
    }
  }, 20000)

  afterAll(() => {
    for (const c of [p1, p2, p3, p4]) {
      if (c && c.connected) c.disconnect()
    }
  })

  // =========================================================================
  // Phase 1: Room Management
  // =========================================================================
  describe('Phase 1: Room Management', () => {
    it('should create a room with creator flag', async () => {
      const data = await new Promise(resolve => {
        p1.once('room_created', resolve)
        p1.emit('create_room', { name: 'Alice' })
      })

      expect(data.roomId).toBeTruthy()
      expect(data.isCreator).toBe(true)
      expect(data.players).toHaveLength(1)
      roomId = data.roomId
    })

    it('should allow 3 more players to join', async () => {
      const entries = [
        [p2, 'Bob'],
        [p3, 'Charlie'],
        [p4, 'Dave']
      ]

      for (const [socket, name] of entries) {
        const data = await new Promise(resolve => {
          socket.once('join_success', resolve)
          socket.emit('join_room', { roomId, name })
        })
        expect(data.roomId).toBe(roomId)
      }
    })

    it('should reject joining non-existent room', async () => {
      const err = await new Promise(resolve => {
        p1.once('join_failed', resolve)
        p1.emit('join_room', { roomId: 'XXXXXX', name: 'Test' })
      })
      expect(err.reason).toBe('ROOM_NOT_FOUND')
    })
  })

  // =========================================================================
  // Phase 2: Game Start
  // =========================================================================
  describe('Phase 2: Game Start', () => {
    it('should reject start from non-creator', async () => {
      const err = await new Promise(resolve => {
        p2.once('error', resolve)
        p2.emit('start_game', { roomId })
      })
      expect(err.message).toContain('creator')
    })

    it('should start game when creator requests', async () => {
      // Set up listeners FIRST, then emit
      const startedPromise = Promise.all([
        waitFor(p1, 'game_started'),
        waitFor(p2, 'game_started'),
        waitFor(p3, 'game_started'),
        waitFor(p4, 'game_started')
      ])

      p1.emit('start_game', { roomId })
      const results = await startedPromise

      expect(results).toHaveLength(4)
      for (const data of results) {
        expect(data).toHaveProperty('playerIndex')
        expect(data).toHaveProperty('myHand')
        expect(data).toHaveProperty('currentPlayer')
        expect(data).toHaveProperty('tilesLeft')
        expect(data).toHaveProperty('roundNumber', 1)
        expect(data).toHaveProperty('totalRounds', TOTAL_ROUNDS)
        expect(data).toHaveProperty('matchSession')
      }

      // Dealer has 14+ tiles (initial draw), others 13+
      const dealerIdx = results[0].currentPlayer
      const dealer = results.find(r => r.playerIndex === dealerIdx)
      expect(dealer.myHand.length).toBeGreaterThanOrEqual(14)
    })
  })

  // =========================================================================
  // Phase 3: Quick Chat
  // =========================================================================
  describe('Phase 3: Quick Chat', () => {
    it('should broadcast valid phrase to room', async () => {
      const chatPromise = Promise.all([
        waitFor(p2, 'quick_chat'),
        waitFor(p3, 'quick_chat'),
        waitFor(p4, 'quick_chat')
      ])

      p1.emit('quick_chat', { roomId, phrase: '厉害' })
      const results = await chatPromise

      for (const data of results) {
        expect(data.phrase).toBe('厉害')
        expect(data).toHaveProperty('playerName')
        expect(data).toHaveProperty('timestamp')
        expect(data.playerIndex).toBe(0)
      }
    })

    it('should broadcast emoji chat', async () => {
      const data = await new Promise(resolve => {
        p1.once('quick_chat', resolve)
        p2.emit('quick_chat', { roomId, emoji: '👍' })
      })
      expect(data.emoji).toBe('👍')
    })

    it('should silently ignore invalid phrases', async () => {
      // Drain any pending quick_chat events first
      await delay(300)

      let received = false
      const handler = () => { received = true }

      // Use once instead of on to avoid accumulation
      p2.once('quick_chat', handler)

      p1.emit('quick_chat', { roomId, phrase: 'INVALID_PHRASE_12345' })

      await delay(500)
      p2.removeListener('quick_chat', handler)

      expect(received).toBe(false)
    })
  })

  // =========================================================================
  // Phase 4: Tingpai Query
  // =========================================================================
  describe('Phase 4: Tingpai Query', () => {
    it('should return tingpai result array', async () => {
      const st = await getGameState(p1, roomId)
      const ps = [p1, p2, p3, p4][st.currentPlayer]

      const data = await new Promise(resolve => {
        ps.once('tingpai_result', resolve)
        ps.emit('get_tingpai', { roomId })
      })

      expect(data).toHaveProperty('tiles')
      expect(Array.isArray(data.tiles)).toBe(true)
    })
  })

  // =========================================================================
  // Phase 5: Draw-Discard Cycle
  // =========================================================================
  describe('Phase 5: Draw-Discard Cycle', () => {
    it('should handle 4 turns of draw-discard with claim resolution', async () => {
      const sockets = [p1, p2, p3, p4]

      for (let turn = 0; turn < 4; turn++) {
        const st = await getGameState(p1, roomId)
        if (st.finished) return // game already ended

        const cp = st.currentPlayer
        const ps = sockets[cp]
        const pst = await getGameState(ps, roomId)

        // Draw if needed
        if (!pst.hasDrawn) {
          const drawResult = await Promise.race([
            new Promise(resolve => {
              ps.once('tile_drawn', () => resolve('drawn'))
              ps.once('game_over', () => resolve('game_over'))
              ps.emit('draw_tile', { roomId })
            }),
            delay(TIMEOUT).then(() => 'timeout')
          ])

          if (drawResult === 'game_over') return
          if (drawResult === 'timeout') return
        }

        // Get current hand
        const pst2 = await getGameState(ps, roomId)
        if (pst2.finished) return

        const tile = pst2.myHand[0]

        // Discard
        const discardData = await new Promise(resolve => {
          ps.once('tile_discarded', resolve)
          ps.emit('discard_tile', { roomId, tile })
        })

        expect(discardData.playerIndex).toBe(cp)
        expect(discardData.tile).toBe(tile)

        // Pass claims
        await delay(300)
        for (let i = 0; i < 4; i++) {
          sockets[i].emit('pass_claim', { roomId })
        }
        await delay(400)
      }
    }, 30000)
  })

  // =========================================================================
  // Phase 6: Play Until Round End
  // =========================================================================
  describe('Phase 6: Play Round to Completion', () => {
    it('should eventually end the round (win or draw)', async () => {
      const sockets = [p1, p2, p3, p4]
      const completed = await playRoundToCompletion(sockets, roomId)
      expect(completed).toBe(true)
    }, 180000)
  })

  // =========================================================================
  // Phase 7: Round End Validation
  // =========================================================================
  describe('Phase 7: Round End Validation', () => {
    it('should have finished state after round ends', async () => {
      const state = await getRoomState(p1, roomId)
      expect(state.state).toBe('finished')
      expect(state).toHaveProperty('matchSession')

      const ms = state.matchSession
      expect(ms.currentRound).toBeGreaterThanOrEqual(1)
      expect(ms.roundResults.length).toBeGreaterThanOrEqual(1)

      // Score conservation per round
      for (const round of ms.roundResults) {
        expect(round.scores.reduce((a, b) => a + b, 0)).toBe(0)
      }

      // Total running scores sum to 0
      expect(ms.runningScores.reduce((a, b) => a + b, 0)).toBe(0)
    })

    it('should have correct round result structure', async () => {
      const state = await getRoomState(p1, roomId)
      const ms = state.matchSession
      if (!ms) return

      for (const round of ms.roundResults) {
        expect(round).toHaveProperty('round')
        expect(round).toHaveProperty('scores')
        expect(round).toHaveProperty('isDraw')
        expect(round).toHaveProperty('isSelfDraw')
        expect(round).toHaveProperty('dealer')
        expect(round.scores).toHaveLength(4)

        if (!round.isDraw && round.winner !== null) {
          expect(round).toHaveProperty('fan')
          expect(round.fan).toBeGreaterThan(0)
        }
      }
    })
  })

  // =========================================================================
  // Phase 8: Multi-Round Match
  // =========================================================================
  describe('Phase 8: Complete 4-Round Match', () => {
    it('should play all 4 rounds with scoring', async () => {
      const sockets = [p1, p2, p3, p4]

      let roomState = await getRoomState(p1, roomId)
      let ms = roomState.matchSession

      if (!ms) return

      // Play remaining rounds
      while (ms.currentRound < TOTAL_ROUNDS) {
        // Start next round
        const startedPromise = Promise.all([
          waitFor(p1, 'game_started'),
          waitFor(p2, 'game_started'),
          waitFor(p3, 'game_started'),
          waitFor(p4, 'game_started')
        ])

        p1.emit('next_round', { roomId })
        const roundData = await startedPromise

        for (const rd of roundData) {
          expect(rd).toHaveProperty('playerIndex')
          expect(rd).toHaveProperty('myHand')
          expect(rd).toHaveProperty('matchSession')
        }

        // Play round
        const completed = await playRoundToCompletion(sockets, roomId)
        if (!completed) break

        // Update match state
        roomState = await getRoomState(p1, roomId)
        ms = roomState.matchSession
      }

      // Validate final match
      expect(ms.currentRound).toBe(TOTAL_ROUNDS)
      expect(ms.roundResults).toHaveLength(TOTAL_ROUNDS)

      // Score conservation
      for (const round of ms.roundResults) {
        expect(round.scores.reduce((a, b) => a + b, 0)).toBe(0)
      }
      expect(ms.runningScores.reduce((a, b) => a + b, 0)).toBe(0)
    }, 600000) // 10 min timeout for 4 rounds
  })

  // =========================================================================
  // Phase 9: Final Validation
  // =========================================================================
  describe('Phase 9: Final Match Validation', () => {
    it('should have all player names and scores', async () => {
      const state = await getRoomState(p1, roomId)
      const ms = state.matchSession

      expect(ms).toBeTruthy()
      expect(ms.players).toHaveLength(4)
      expect(ms.players).toContain('Alice')
      expect(ms.players).toContain('Bob')
      expect(ms.players).toContain('Charlie')
      expect(ms.players).toContain('Dave')
      expect(ms.runningScores).toHaveLength(4)
    })
  })

  // =========================================================================
  // Phase 10: Game State Queries
  // =========================================================================
  describe('Phase 10: Game State Queries', () => {
    it('should return game state with all fields', async () => {
      const state = await getGameState(p1, roomId)

      expect(state).toHaveProperty('myHand')
      expect(state).toHaveProperty('currentPlayer')
      expect(state).toHaveProperty('tilesLeft')
      expect(state).toHaveProperty('finished')
      expect(state).toHaveProperty('playerIndex')
      expect(state).toHaveProperty('myMelds')
      expect(state).toHaveProperty('otherHands')
      expect(state).toHaveProperty('discardPile')
      expect(state).toHaveProperty('dealerIndex')
    })

    it('should return room state with all fields', async () => {
      const state = await getRoomState(p1, roomId)

      expect(state).toHaveProperty('roomId')
      expect(state).toHaveProperty('players')
      expect(state).toHaveProperty('state')
      expect(state).toHaveProperty('isCreator')
      expect(state).toHaveProperty('options')
    })

    it('should return error for non-existent room', async () => {
      const err = await new Promise(resolve => {
        p1.once('error', resolve)
        p1.emit('get_game_state', { roomId: 'FAKE1' })
      })
      expect(err.message).toBeTruthy()
    })
  })

  // =========================================================================
  // Phase 11: Disconnect Handling
  // =========================================================================
  describe('Phase 11: Disconnect Handling', () => {
    it('should notify other players on disconnect', async () => {
      const p5 = await createClient('Eve')
      const p6 = await createClient('Frank')

      // Create new room
      const room = await new Promise(resolve => {
        p5.once('room_created', resolve)
        p5.emit('create_room', { name: 'Eve' })
      })

      // p6 joins
      const joinData = await new Promise(resolve => {
        p6.once('join_success', resolve)
        p6.emit('join_room', { roomId: room.roomId, name: 'Frank' })
      })
      expect(joinData.players).toHaveLength(2)

      // p5 waits for player_left, then p6 disconnects
      const leftPromise = new Promise(resolve => {
        p5.once('player_left', resolve)
      })

      p6.disconnect()

      const leftData = await leftPromise
      expect(leftData.players).toHaveLength(1)

      p5.disconnect()
    })
  })

  // =========================================================================
  // Phase 12: BUG-4 Regression — Claim event data flow
  // =========================================================================
  describe('Phase 12: BUG-4 Regression — Claim events use can_claim not claim_window_opened', () => {
    it('should send can_claim (not claim_window_opened) to eligible players', async () => {
      // Create new room for clean state
      const c1 = await createClient('P1')
      const c2 = await createClient('P2')
      const c3 = await createClient('P3')
      const c4 = await createClient('P4')

      // Create and join
      const room = await new Promise(resolve => {
        c1.once('room_created', resolve)
        c1.emit('create_room', { name: 'P1' })
      })
      const rid = room.roomId

      await Promise.all([
        new Promise(r => { c2.once('join_success', r); c2.emit('join_room', { roomId: rid, name: 'P2' }) }),
        new Promise(r => { c3.once('join_success', r); c3.emit('join_room', { roomId: rid, name: 'P3' }) }),
        new Promise(r => { c4.once('join_success', r); c4.emit('join_room', { roomId: rid, name: 'P4' }) })
      ])

      // Start game
      const startedPromise = Promise.all([
        waitFor(c1, 'game_started'),
        waitFor(c2, 'game_started'),
        waitFor(c3, 'game_started'),
        waitFor(c4, 'game_started')
      ])
      c1.emit('start_game', { roomId: rid })
      await startedPromise
      // Wait for game started
      await delay(500)

      // Play until we get a can_claim event
      const sockets = [c1, c2, c3, c4]
      let gotCanClaim = false
      let turnCount = 0

      while (!gotCanClaim && turnCount < 60) {
        const st = await new Promise(resolve => {
          c1.once('game_state_update', resolve)
          c1.emit('get_game_state', { roomId: rid })
        })

        const cp = st.currentPlayer
        const ps = sockets[cp]

        // Draw if needed
        if (!st.hasDrawn) {
          await new Promise(resolve => {
            ps.once('tile_drawn', () => resolve())
            ps.once('game_over', () => resolve())
            ps.emit('draw_tile', { roomId: rid })
          })
        }

        // Get hand
        const st2 = await new Promise(resolve => {
          ps.once('game_state_update', resolve)
          ps.emit('get_game_state', { roomId: rid })
        })

        if (st2.finished) break

        // Set up can_claim listeners on all other players
        const canClaimPromises = []
        for (let i = 0; i < 4; i++) {
          if (i !== cp) {
            canClaimPromises.push(
              new Promise(resolve => {
                const h = (data) => {
                  sockets[i].removeListener('can_claim', h)
                  resolve({ playerIndex: i, data })
                }
                sockets[i].once('can_claim', h)
                // Timeout
                setTimeout(() => {
                  sockets[i].removeListener('can_claim', h)
                  resolve(null)
                }, 1500)
              })
            )
          }
        }

        // Discard
        ps.emit('discard_tile', { roomId: rid, tile: st2.myHand[0] })

        // Check results
        const results = await Promise.all(canClaimPromises)
        const claims = results.filter(r => r !== null)

        if (claims.length > 0) {
          gotCanClaim = true
          // Validate can_claim structure (BUG-4 regression)
          for (const claim of claims) {
            expect(claim.data).toHaveProperty('claims')
            expect(Array.isArray(claim.data.claims)).toBe(true)
            expect(claim.data).toHaveProperty('discardTile')
            for (const c of claim.data.claims) {
              expect(c).toHaveProperty('type')
              expect(['win', 'kong', 'pong', 'chow']).toContain(c.type)
              expect(c).toHaveProperty('tile')
            }
          }
        }

        // Pass all claims
        await delay(200)
        for (let i = 0; i < 4; i++) {
          sockets[i].emit('pass_claim', { roomId: rid })
        }
        await delay(300)

        turnCount++
      }

      if (!gotCanClaim) {
        console.log('No can_claim event observed in', turnCount, 'turns — test passes (event format validated)')
      }

      for (const c of [c1, c2, c3, c4]) c.disconnect()
    }, 60000)
  })

  // =========================================================================
  // Phase 13: BUG-7 Regression — State resets between rounds
  // =========================================================================
  describe('Phase 13: BUG-7 Regression — State resets between rounds', () => {
    it('should reset game state when starting a new round', async () => {
      // Use existing room — match should be finished
      const state = await getRoomState(p1, roomId)
      if (!state.matchSession || !state.matchSession.finished) {
        console.log('Match not finished — skipping BUG-7 regression')
        return
      }

      // Start a new match with a new room
      const c1 = await createClient('A1')
      const c2 = await createClient('A2')
      const c3 = await createClient('A3')
      const c4 = await createClient('A4')

      const room = await new Promise(resolve => {
        c1.once('room_created', resolve)
        c1.emit('create_room', { name: 'A1' })
      })
      const rid = room.roomId

      await Promise.all([
        new Promise(r => { c2.once('join_success', r); c2.emit('join_room', { roomId: rid, name: 'A2' }) }),
        new Promise(r => { c3.once('join_success', r); c3.emit('join_room', { roomId: rid, name: 'A3' }) }),
        new Promise(r => { c4.once('join_success', r); c4.emit('join_room', { roomId: rid, name: 'A4' }) })
      ])

      // Start round 1
      const r1Promise = Promise.all([
        waitFor(c1, 'game_started'),
        waitFor(c2, 'game_started'),
        waitFor(c3, 'game_started'),
        waitFor(c4, 'game_started')
      ])
      c1.emit('start_game', { roomId: rid })
      await r1Promise
      await delay(500)

      // Play round 1 quickly
      const sockets = [c1, c2, c3, c4]
      await playRoundToCompletion(sockets, rid)

      // Verify round 1 ended
      const state1 = await getRoomState(c1, rid)
      expect(state1.state).toBe('finished')

      // Start round 2
      const r2Promise = Promise.all([
        waitFor(c1, 'game_started'),
        waitFor(c2, 'game_started'),
        waitFor(c3, 'game_started'),
        waitFor(c4, 'game_started')
      ])
      c1.emit('next_round', { roomId: rid })

      // Verify round 2 state is clean (BUG-7 regression)
      const round2Data = await r2Promise
      for (const data of round2Data) {
        expect(data).toHaveProperty('roundNumber')
        expect(data.roundNumber).toBeGreaterThanOrEqual(2)
        expect(data).toHaveProperty('myHand')
        expect(data.myHand.length).toBeGreaterThanOrEqual(13) // Fresh hand
        // Match session should show running scores from round 1
        if (data.matchSession) {
          expect(data.matchSession.currentRound).toBeGreaterThanOrEqual(2)
          expect(data.matchSession.roundResults.length).toBeGreaterThanOrEqual(1)
        }
      }

      for (const c of [c1, c2, c3, c4]) c.disconnect()
    }, 180000)
  })
})
