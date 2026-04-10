/**
 * User Flow Simulation Test
 * Simulates a complete game session with 4 players
 */
import { io as ioClient } from 'socket.io-client'

const URL = 'http://localhost:3001'
const results = { passed: 0, failed: 0, failures: [] }

function assert(condition, msg) {
  if (condition) {
    results.passed++
    console.log(`  PASS: ${msg}`)
  } else {
    results.failed++
    results.failures.push(msg)
    console.log(`  FAIL: ${msg}`)
  }
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)) }

function waitFor(socket, event, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout: ${event}`)), timeout)
    socket.once(event, data => { clearTimeout(timer); resolve(data) })
  })
}

async function runTests() {
  console.log('\n=== User Flow Simulation ===\n')

  // Create 4 clients
  console.log('Step 1: Connect 4 players')
  const [p1, p2, p3, p4] = await Promise.all([
    ioClient(URL, { transports: ['websocket'], forceNew: true, reconnection: false }),
    ioClient(URL, { transports: ['websocket'], forceNew: true, reconnection: false }),
    ioClient(URL, { transports: ['websocket'], forceNew: true, reconnection: false }),
    ioClient(URL, { transports: ['websocket'], forceNew: true, reconnection: false })
  ])

  await Promise.all([
    waitFor(p1, 'connect'),
    waitFor(p2, 'connect'),
    waitFor(p3, 'connect'),
    waitFor(p4, 'connect')
  ])
  assert(p1.connected && p2.connected && p3.connected && p4.connected, 'All 4 players connected')

  // Player 1 creates room
  console.log('\nStep 2: Player 1 creates room')
  const roomCreated = waitFor(p1, 'room_created')
  p1.emit('create_room', { name: 'Alice' })
  const roomData = await roomCreated

  assert(roomData.roomId, 'Room ID received')
  assert(roomData.roomId.length === 6, 'Room ID is 6 chars')
  assert(roomData.isCreator === true, 'Player 1 is creator')
  assert(Array.isArray(roomData.players), 'Players array exists')
  console.log(`  Room created: ${roomData.roomId}`)
  const roomId = roomData.roomId

  // Players 2-4 join
  console.log('\nStep 3: Players 2-4 join room')
  const joinPromises = [
    waitFor(p2, 'join_success'),
    waitFor(p3, 'join_success'),
    waitFor(p4, 'join_success')
  ]

  // Also listen on p1 for player_joined events
  const joinedEvents = []
  p1.on('player_joined', (d) => joinedEvents.push(d))

  p2.emit('join_room', { roomId, name: 'Bob' })
  await wait(100)
  p3.emit('join_room', { roomId, name: 'Charlie' })
  await wait(100)
  p4.emit('join_room', { roomId, name: 'Dave' })

  const joinResults = await Promise.all(joinPromises)
  assert(joinResults.every(r => r.roomId === roomId), 'All players joined same room')
  assert(joinResults[2].players.length === 4, 'Room has 4 players after all joined')

  await wait(200)
  assert(joinedEvents.length >= 2, 'Player 1 received player_joined events')

  // Try joining full room
  console.log('\nStep 4: Verify room is full')
  const p5 = ioClient(URL, { transports: ['websocket'], forceNew: true, reconnection: false })
  await waitFor(p5, 'connect')
  const failEvent = waitFor(p5, 'join_failed')
  p5.emit('join_room', { roomId, name: 'Eve' })
  const failData = await failEvent
  assert(failData.reason === 'ROOM_FULL', '5th player gets ROOM_FULL')
  p5.disconnect()

  // Start game
  console.log('\nStep 5: Start game')
  const gameStartedPromises = [
    waitFor(p1, 'game_started'),
    waitFor(p2, 'game_started'),
    waitFor(p3, 'game_started'),
    waitFor(p4, 'game_started')
  ]
  p1.emit('start_game', { roomId })
  const gameDatas = await Promise.all(gameStartedPromises)

  assert(gameDatas.every(d => Array.isArray(d.myHand)), 'All players received hand')
  assert(gameDatas.every(d => d.myHand.length >= 13), 'All hands have at least 13 tiles')
  assert(gameDatas.every(d => d.currentPlayer === 0), 'Current player is dealer (0)')
  assert(gameDatas[0].playerIndex === 0, 'Player 1 is index 0')
  assert(gameDatas[1].playerIndex === 1, 'Player 2 is index 1')
  assert(gameDatas[2].playerIndex === 2, 'Player 3 is index 2')
  assert(gameDatas[3].playerIndex === 3, 'Player 4 is index 3')

  // Game play: dealer discards
  console.log('\nStep 6: Dealer (P1) discards first tile')
  const dealerHand = gameDatas[0].myHand
  const discardTile = dealerHand[0]
  const tileDiscarded = Promise.all([
    waitFor(p1, 'tile_discarded'),
    waitFor(p2, 'tile_discarded'),
    waitFor(p3, 'tile_discarded'),
    waitFor(p4, 'tile_discarded')
  ])
  p1.emit('discard_tile', { roomId, tile: discardTile })
  const discardResults = await tileDiscarded

  assert(discardResults.every(d => d.tile === discardTile), 'All players received discard event')
  assert(discardResults[0].nextPlayer === 1, 'Next player is 1')

  // Player 2 draws
  console.log('\nStep 7: Player 2 draws tile')
  const tileDrawn = waitFor(p2, 'tile_drawn')
  const playerDrew = Promise.all([
    waitFor(p1, 'player_drew'),
    waitFor(p3, 'player_drew'),
    waitFor(p4, 'player_drew')
  ])
  p2.emit('draw_tile', { roomId })
  const drawnData = await tileDrawn
  assert(drawnData.tile, 'Player 2 drew a tile')
  assert(drawnData.myHand.length === 14, 'Player 2 has 14 tiles after draw')

  const drewOthers = await playerDrew
  assert(drewOthers.every(d => d.playerIndex === 1), 'Others know player 1 drew')

  // Player 2 discards
  console.log('\nStep 8: Player 2 discards')
  const discard2 = Promise.all([
    waitFor(p1, 'tile_discarded'),
    waitFor(p2, 'tile_discarded'),
    waitFor(p3, 'tile_discarded'),
    waitFor(p4, 'tile_discarded')
  ])
  const p2Tile = drawnData.myHand[0]
  p2.emit('discard_tile', { roomId, tile: p2Tile })
  const d2 = await discard2
  assert(d2[0].nextPlayer === 2, 'Next player is 2')

  // Get game state
  console.log('\nStep 9: Get game state')
  const stateUpdate = waitFor(p3, 'game_state_update')
  p3.emit('get_game_state', { roomId })
  const state = await stateUpdate
  assert(Array.isArray(state.myHand), 'State includes myHand')
  assert(typeof state.currentPlayer === 'number', 'State includes currentPlayer')
  assert(typeof state.tilesLeft === 'number', 'State includes tilesLeft')

  // Invalid action: player 1 tries to draw when it's player 2's turn
  console.log('\nStep 10: Invalid action test')
  const errEvent = waitFor(p1, 'error')
  p1.emit('draw_tile', { roomId }) // Not player 1's turn (current is 2)
  const err = await errEvent
  assert(err.message === 'NOT_YOUR_TURN', 'Error for wrong turn is NOT_YOUR_TURN')

  // Test leave room during game
  console.log('\nStep 11: Player requests game state after reconnect scenario')
  const stateUpdate2 = waitFor(p1, 'game_state_update')
  p1.emit('get_game_state', { roomId })
  const state2 = await stateUpdate2
  assert(state2.myHand.length >= 12, 'Player 1 hand intact after reconnection check')

  // Cleanup
  console.log('\nStep 12: Cleanup')
  p1.disconnect()
  p2.disconnect()
  p3.disconnect()
  p4.disconnect()
  assert(!p1.connected, 'Player 1 disconnected')

  // Summary
  console.log('\n' + '='.repeat(50))
  console.log(`Results: ${results.passed} passed, ${results.failed} failed`)
  if (results.failures.length) {
    console.log('Failures:')
    results.failures.forEach(f => console.log(`  - ${f}`))
  }
  console.log('='.repeat(50))

  process.exit(results.failed > 0 ? 1 : 0)
}

runTests().catch(err => {
  console.error('Test runner error:', err)
  process.exit(1)
})
