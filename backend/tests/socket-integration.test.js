import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { io as ioClient } from 'socket.io-client'

const SERVER_URL = 'http://localhost:3001'

// Helper: create a client with a promise-based interface
function createClient() {
  return new Promise((resolve, reject) => {
    const socket = ioClient(SERVER_URL, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false
    })

    socket.on('connect', () => resolve(socket))
    socket.on('connect_error', reject)

    setTimeout(() => reject(new Error('Connection timeout')), 5000)
  })
}

function waitForEvent(socket, event, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${event}`)), timeout)
    socket.once(event, (data) => {
      clearTimeout(timer)
      resolve(data)
    })
  })
}

describe('Socket.IO Integration Tests', () => {
  let client1, client2, client3, client4

  beforeAll(async () => {
    client1 = await createClient()
    client2 = await createClient()
    client3 = await createClient()
    client4 = await createClient()
  })

  afterAll(() => {
    [client1, client2, client3, client4].forEach(c => {
      if (c && c.connected) c.disconnect()
    })
  })

  describe('Room creation', () => {
    it('should create a room', async () => {
      const roomCreated = waitForEvent(client1, 'room_created')
      client1.emit('create_room', { name: 'Player1' })
      const data = await roomCreated

      expect(data).toHaveProperty('roomId')
      expect(data.roomId).toBeTruthy()
      expect(data).toHaveProperty('players')
      expect(data.isCreator).toBe(true)
    })
  })

  describe('Joining rooms', () => {
    it('should allow another player to join', async () => {
      // First create room
      const roomCreated = waitForEvent(client1, 'room_created')
      client1.emit('create_room', { name: 'HostPlayer' })
      const roomData = await roomCreated
      const roomId = roomData.roomId

      // Second player joins
      const joinSuccess = waitForEvent(client2, 'join_success')
      const playerJoined = waitForEvent(client1, 'player_joined')

      client2.emit('join_room', { roomId, name: 'GuestPlayer' })

      const joinData = await joinSuccess
      expect(joinData).toHaveProperty('roomId')
      expect(joinData.players).toHaveLength(2)

      const joinedData = await playerJoined
      expect(joinedData.players).toHaveLength(2)
    })

    it('should fail to join non-existent room', async () => {
      const failEvent = waitForEvent(client3, 'join_failed')
      client3.emit('join_room', { roomId: 'ZZZZZZ', name: 'Nobody' })
      const err = await failEvent
      expect(err).toHaveProperty('reason')
      expect(err.reason).toBe('ROOM_NOT_FOUND')
    })
  })

  describe('Full game flow (4 players)', () => {
    let roomId

    it('should create room and add 4 players', async () => {
      // Create room
      const roomCreated = waitForEvent(client1, 'room_created')
      client1.emit('create_room', { name: 'P1' })
      const roomData = await roomCreated
      roomId = roomData.roomId

      // Join 3 more players
      const joinPromises = []
      for (const [client, name] of [[client2, 'P2'], [client3, 'P3'], [client4, 'P4']]) {
        joinPromises.push(waitForEvent(client, 'join_success'))
        client.emit('join_room', { roomId, name })
      }

      const results = await Promise.all(joinPromises)
      for (const r of results) {
        expect(r.success === undefined || r.roomId).toBeTruthy()
      }
    })

    it('should start the game', async () => {
      const gameStarted = waitForEvent(client1, 'game_started')
      client1.emit('start_game', { roomId })
      const data = await gameStarted

      expect(data).toHaveProperty('playerIndex')
      expect(data).toHaveProperty('myHand')
      expect(data.myHand.length).toBeGreaterThanOrEqual(13)
      expect(data).toHaveProperty('currentPlayer')
      expect(data).toHaveProperty('tilesLeft')
    })
  })

  describe('Error handling', () => {
    it('should receive error for invalid actions', async () => {
      const errorEvent = waitForEvent(client1, 'error')
      client1.emit('start_game', { roomId: 'NONEXIST' })
      const err = await errorEvent
      expect(err.message).toBeTruthy()
    })
  })
})
