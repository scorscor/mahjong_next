import { io } from 'socket.io-client'

let socket = null

const DEFAULT_SERVER_URL =
  typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001'

const SERVER_URL = import.meta.env.VITE_SOCKET_URL || DEFAULT_SERVER_URL

export function connectSocket() {
  if (socket && socket.connected) {
    return socket
  }

  socket = io(SERVER_URL, {
    transports: ['websocket', 'polling'],
    autoConnect: true
  })

  socket.on('connect', () => {
    console.log('Socket connected:', socket.id)
  })

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason)
  })

  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error.message)
  })

  return socket
}

export function getSocket() {
  if (!socket) {
    return connectSocket()
  }
  return socket
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}
