<template>
  <div class="home">
    <div class="logo-section">
      <div class="logo-tiles">
        <span class="tile-emoji">🀄</span>
      </div>
      <h1 class="title">好友麻将</h1>
      <p class="subtitle">好友约战，随时随地来一局</p>
    </div>

    <div class="actions">
      <div class="name-input">
        <input
          v-model="playerName"
          placeholder="输入你的昵称"
          class="input"
          maxlength="10"
        />
      </div>

      <div class="round-select">
        <span class="round-label">局数：</span>
        <button @click="totalRounds = 4" class="round-btn" :class="{ active: totalRounds === 4 }">4局</button>
        <button @click="totalRounds = 8" class="round-btn" :class="{ active: totalRounds === 8 }">8局</button>
      </div>

      <button @click="createRoom" class="btn btn-primary">
        创建房间
      </button>

      <div class="divider">
        <span>或</span>
      </div>

      <div class="join-section">
        <input
          v-model="joinRoomId"
          placeholder="输入房间号"
          class="input input-room"
          maxlength="6"
        />
        <button @click="joinRoom" class="btn btn-secondary" :disabled="!joinRoomId">
          加入
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { connectSocket } from '@/utils/socket'
import { useToast } from '@/composables/useToast'
import { useGameStore } from '@/store/game'

const DEFAULT_ROOM_PASSWORD = '8888'

const router = useRouter()
const toast = useToast()
const gameStore = useGameStore()
const playerName = ref('')
const joinRoomId = ref('')
const totalRounds = ref(4)
const socket = connectSocket()

function saveLobbyState(data) {
  localStorage.setItem('mahjong_player_name', playerName.value.trim())
  gameStore.roomId = data.roomId
  gameStore.players = data.players || []
  gameStore.isCreator = data.isCreator || false
  gameStore.roomPassword = data.options?.roomPassword || DEFAULT_ROOM_PASSWORD
  gameStore.playerName = playerName.value.trim()
}

function handleRoomCreated(data) {
  saveLobbyState(data)
  router.push(`/room/${data.roomId}`)
}

function handleJoinSuccess(data) {
  saveLobbyState(data)
  router.push(`/room/${data.roomId}`)
}

function handleJoinFailed(data) {
  toast.show(joinFailedReason(data.reason))
}

onMounted(() => {
  const savedName = localStorage.getItem('mahjong_player_name')
  if (savedName) playerName.value = savedName

  socket.on('room_created', handleRoomCreated)
  socket.on('join_success', handleJoinSuccess)
  socket.on('join_failed', handleJoinFailed)
})

onUnmounted(() => {
  socket.off('room_created', handleRoomCreated)
  socket.off('join_success', handleJoinSuccess)
  socket.off('join_failed', handleJoinFailed)
})

function createRoom() {
  if (!playerName.value.trim()) {
    toast.show('请输入昵称')
    return
  }

  socket.emit('create_room', {
    name: playerName.value.trim(),
    totalRounds: totalRounds.value,
    roomPassword: DEFAULT_ROOM_PASSWORD
  })
}

function joinRoom() {
  if (!playerName.value.trim()) {
    toast.show('请输入昵称')
    return
  }

  if (!joinRoomId.value.trim()) return

  socket.emit('join_room', {
    roomId: joinRoomId.value.trim().toUpperCase(),
    name: playerName.value.trim(),
    roomPassword: DEFAULT_ROOM_PASSWORD
  })
}

function joinFailedReason(reason) {
  const map = {
    ROOM_NOT_FOUND: '房间不存在',
    ROOM_FULL: '房间已满',
    GAME_IN_PROGRESS: '游戏正在进行中',
    ALREADY_JOINED: '你已经在这个房间里了',
    INVALID_ROOM_PASSWORD: '房间口令错误'
  }

  return map[reason] || '加入失败'
}
</script>

<style scoped>
.home {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: linear-gradient(135deg, #1a472a 0%, #0d2818 100%);
}

.logo-section {
  text-align: center;
  margin-bottom: 40px;
}

.tile-emoji {
  font-size: 64px;
}

.title {
  font-size: 36px;
  font-weight: bold;
  color: #f0d060;
  margin: 10px 0;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
}

.subtitle {
  color: #a0c0a0;
  font-size: 16px;
}

.actions {
  width: 100%;
  max-width: 360px;
}

.name-input {
  margin-bottom: 16px;
}

.input {
  width: 100%;
  padding: 14px 16px;
  border: 2px solid #3a6b3a;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.08);
  color: #e0e0e0;
  font-size: 16px;
  outline: none;
  transition: border-color 0.2s;
}

.input:focus {
  border-color: #5a9b5a;
}

.input::placeholder {
  color: #7a9a7a;
}

.btn {
  width: 100%;
  padding: 16px;
  border: none;
  border-radius: 12px;
  font-size: 18px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: linear-gradient(135deg, #4caf50, #2e7d32);
  color: white;
  box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);
}

.btn-primary:active {
  transform: scale(0.98);
}

.round-select {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  justify-content: center;
}

.round-label {
  color: #7a9a7a;
  font-size: 14px;
}

.round-btn {
  padding: 8px 20px;
  border: 2px solid #3a6b3a;
  border-radius: 10px;
  background: transparent;
  color: #a0c0a0;
  font-size: 15px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
}

.round-btn.active {
  background: #4caf50;
  color: white;
  border-color: #4caf50;
}

.divider {
  text-align: center;
  margin: 20px 0;
  color: #5a7a5a;
  font-size: 14px;
}

.join-section {
  display: flex;
  gap: 10px;
}

.input-room {
  flex: 1;
  text-transform: uppercase;
  letter-spacing: 2px;
}

.btn-secondary {
  width: auto;
  padding: 14px 28px;
  background: rgba(255, 255, 255, 0.12);
  color: #b0d0b0;
  border: 2px solid #3a6b3a;
}

.btn-secondary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
