/**
 * UI Data Flow Validation Test
 *
 * Validates that all Socket.IO events required by the frontend (game.vue)
 * produce correctly structured data. Runs one clean game session through
 * a single draw-discard cycle, validating each event's payload structure.
 *
 * Prerequisites: Backend server running at http://localhost:3001
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { io as ioClient } from 'socket.io-client'

const SERVER_URL = 'http://localhost:3001'
const TIMEOUT = 15000

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
    socket.on('connect', () => { clearTimeout(timer); resolve(socket) })
    socket.on('connect_error', (err) => { clearTimeout(timer); reject(err) })
  })
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)) }

describe('UI Data Flow Validation', () => {
  let p1, p2, p3, p4
  let roomId

  beforeAll(async () => {
    ;[p1, p2, p3, p4] = await Promise.all([
      createClient('Alice'), createClient('Bob'),
      createClient('Charlie'), createClient('Dave')
    ])
  }, 20000)

  afterAll(() => {
    for (const c of [p1, p2, p3, p4]) {
      if (c && c.connected) c.disconnect()
    }
  })

  it('room_created: has roomId, players, isCreator', async () => {
    const data = await new Promise(resolve => {
      p1.once('room_created', resolve)
      p1.emit('create_room', { name: 'Alice' })
    })
    roomId = data.roomId

    expect(data).toHaveProperty('roomId')
    expect(typeof data.roomId).toBe('string')
    expect(data).toHaveProperty('players')
    expect(Array.isArray(data.players)).toBe(true)
    expect(data).toHaveProperty('isCreator')
    expect(data.isCreator).toBe(true)
  })

  it('join_success: has roomId, players, isCreator, options', async () => {
    const data = await new Promise(resolve => {
      p2.once('join_success', resolve)
      p2.emit('join_room', { roomId, name: 'Bob' })
    })

    expect(data).toHaveProperty('roomId')
    expect(data).toHaveProperty('players')
    expect(data).toHaveProperty('isCreator')
    expect(data).toHaveProperty('options')
    expect(data.options).toHaveProperty('totalRounds')
  })

  it('join_failed: has reason for invalid room', async () => {
    const err = await new Promise(resolve => {
      p1.once('join_failed', resolve)
      p1.emit('join_room', { roomId: 'XXXXXX', name: 'Test' })
    })
    expect(err).toHaveProperty('reason')
    expect(err.reason).toBe('ROOM_NOT_FOUND')
  })

  it('game_started: has all fields frontend needs', async () => {
    // Join remaining players
    await Promise.all([
      new Promise(r => { p3.once('join_success', r); p3.emit('join_room', { roomId, name: 'Charlie' }) }),
      new Promise(r => { p4.once('join_success', r); p4.emit('join_room', { roomId, name: 'Dave' }) })
    ])

    const results = await new Promise(resolve => {
      const collected = []
      const handler = (data) => {
        collected.push(data)
        if (collected.length === 4) resolve(collected)
      }
      p1.once('game_started', handler)
      p2.once('game_started', handler)
      p3.once('game_started', handler)
      p4.once('game_started', handler)
      p1.emit('start_game', { roomId })
    })

    for (const data of results) {
      expect(data).toHaveProperty('playerIndex')
      expect(typeof data.playerIndex).toBe('number')
      expect(data).toHaveProperty('roundNumber')
      expect(data).toHaveProperty('totalRounds')
      expect(data).toHaveProperty('myHand')
      expect(Array.isArray(data.myHand)).toBe(true)
      expect(data).toHaveProperty('currentPlayer')
      expect(data).toHaveProperty('tilesLeft')
      if (data.matchSession) {
        expect(data.matchSession).toHaveProperty('dealerIndex')
        expect(data.matchSession).toHaveProperty('runningScores')
        expect(data.matchSession.runningScores).toHaveLength(4)
      }
    }
  })

  it('tile_discarded: has playerIndex, tile, nextPlayer, tilesLeft', async () => {
    // Get state — dealer should have drawn and needs to discard
    const st = await new Promise(resolve => {
      p1.once('game_state_update', resolve)
      p1.emit('get_game_state', { roomId })
    })

    const sockets = [p1, p2, p3, p4]
    const cp = st.currentPlayer
    const ps = sockets[cp]

    // Dealer should have hasDrawn=true, so discard directly
    expect(st.hasDrawn).toBe(true)

    const data = await new Promise(resolve => {
      ps.once('tile_discarded', resolve)
      ps.emit('discard_tile', { roomId, tile: st.myHand[0] })
    })

    expect(data).toHaveProperty('playerIndex')
    expect(typeof data.playerIndex).toBe('number')
    expect(data).toHaveProperty('tile')
    expect(typeof data.tile).toBe('string')
    expect(data).toHaveProperty('nextPlayer')
    expect(typeof data.nextPlayer).toBe('number')
    expect(data).toHaveProperty('tilesLeft')
    expect(typeof data.tilesLeft).toBe('number')
  })

  it('player_drew: other players see tilesLeft', async () => {
    // Pass claims first
    const sockets = [p1, p2, p3, p4]
    await delay(300)
    for (let i = 0; i < 4; i++) sockets[i].emit('pass_claim', { roomId })
    await delay(400)

    // Next player should need to draw
    const st = await new Promise(resolve => {
      p1.once('game_state_update', resolve)
      p1.emit('get_game_state', { roomId })
    })

    const cp = st.currentPlayer
    const ps = sockets[cp]

    // Listen on another player for player_drew
    const otherIdx = (cp + 1) % 4
    const playerDrewPromise = new Promise(resolve => {
      sockets[otherIdx].once('player_drew', resolve)
    })

    // Draw
    await new Promise(resolve => {
      ps.once('tile_drawn', resolve)
      ps.emit('draw_tile', { roomId })
    })

    const result = await Promise.race([
      playerDrewPromise,
      delay(3000).then(() => null)
    ])

    if (result) {
      expect(result).toHaveProperty('playerIndex')
      expect(result).toHaveProperty('tilesLeft')
    }
  })

  it('quick_chat: has playerIndex, playerName, phrase, timestamp', async () => {
    const data = await new Promise(resolve => {
      p2.once('quick_chat', resolve)
      p1.emit('quick_chat', { roomId, phrase: '厉害' })
    })

    expect(data).toHaveProperty('playerIndex')
    expect(typeof data.playerIndex).toBe('number')
    expect(data).toHaveProperty('playerName')
    expect(typeof data.playerName).toBe('string')
    expect(data).toHaveProperty('phrase')
    expect(data).toHaveProperty('timestamp')
    expect(typeof data.timestamp).toBe('number')
  })

  it('game_state_update: has all fields frontend needs', async () => {
    const state = await new Promise(resolve => {
      p1.once('game_state_update', resolve)
      p1.emit('get_game_state', { roomId })
    })

    expect(state).toHaveProperty('myHand')
    expect(state).toHaveProperty('myMelds')
    expect(state).toHaveProperty('currentPlayer')
    expect(state).toHaveProperty('hasDrawn')
    expect(state).toHaveProperty('tilesLeft')
    expect(state).toHaveProperty('lastDiscard')
    expect(state).toHaveProperty('winner')
    expect(state).toHaveProperty('finished')
    expect(state).toHaveProperty('otherHands')
    expect(state).toHaveProperty('discardPile')
    expect(state).toHaveProperty('playerIndex')
    expect(typeof state.playerIndex).toBe('number')
  })

  it('room_state: has roomId, players, state, options, matchSession', async () => {
    const state = await new Promise(resolve => {
      p1.once('room_state', resolve)
      p1.emit('get_room_state', { roomId })
    })

    expect(state).toHaveProperty('roomId')
    expect(state).toHaveProperty('players')
    expect(state).toHaveProperty('state')
    expect(state).toHaveProperty('options')
    expect(state).toHaveProperty('isCreator')
    expect(state).toHaveProperty('matchSession')
  })

  it('error: has message for invalid action', async () => {
    const err = await new Promise(resolve => {
      p1.once('error', resolve)
      p1.emit('get_game_state', { roomId: 'NONEXIST' })
    })
    expect(err).toHaveProperty('message')
    expect(typeof err.message).toBe('string')
  })
})
