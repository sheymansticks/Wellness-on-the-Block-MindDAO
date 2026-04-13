import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'

export interface Session {
  id: string
  patientId: string
  providerId: string
  type: 'therapy' | 'counseling'
  status: 'scheduled' | 'in-progress' | 'completed' | 'cancelled' | 'disputed'
  scheduledAt: string
  duration: number
  price: {
    amount: number
    currency: string
  }
  payment: {
    escrowTxId?: string
    releaseTxId?: string
    status: 'pending' | 'paid' | 'refunded' | 'disputed'
  }
  metadata: {
    notes?: string
    anonymous: boolean
    zkProofHash?: string
  }
  createdAt: string
  updatedAt: string
}

export interface SessionState {
  sessions: Session[]
  currentSession: Session | null
  isLoading: boolean
  error: string | null
  upcomingSessions: Session[]
  pastSessions: Session[]
}

const initialState: SessionState = {
  sessions: [],
  currentSession: null,
  isLoading: false,
  error: null,
  upcomingSessions: [],
  pastSessions: [],
}

// Async thunks
export const createSession = createAsyncThunk(
  'sessions/createSession',
  async (sessionData: {
    providerId: string
    type: 'therapy' | 'counseling'
    scheduledAt: string
    duration: number
    anonymous: boolean
    notes?: string
  }) => {
    const response = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sessionData),
    })
    const data = await response.json()
    return data.session
  }
)

export const fetchSessions = createAsyncThunk(
  'sessions/fetchSessions',
  async (filters?: { status?: string; limit?: number; offset?: number }) => {
    const queryParams = new URLSearchParams()
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) {
          queryParams.append(key, value.toString())
        }
      })
    }
    
    const response = await fetch(`/api/sessions?${queryParams}`)
    const data = await response.json()
    return data.sessions
  }
)

export const fetchSessionById = createAsyncThunk(
  'sessions/fetchSessionById',
  async (sessionId: string) => {
    const response = await fetch(`/api/sessions/${sessionId}`)
    const data = await response.json()
    return data.session
  }
)

export const startSession = createAsyncThunk(
  'sessions/startSession',
  async (sessionId: string) => {
    const response = await fetch(`/api/sessions/${sessionId}/start`, {
      method: 'POST',
    })
    const data = await response.json()
    return data.session
  }
)

export const completeSession = createAsyncThunk(
  'sessions/completeSession',
  async ({ sessionId, proofData }: { sessionId: string; proofData?: any }) => {
    const response = await fetch(`/api/sessions/${sessionId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proofData }),
    })
    const data = await response.json()
    return data.session
  }
)

export const cancelSession = createAsyncThunk(
  'sessions/cancelSession',
  async ({ sessionId, reason }: { sessionId: string; reason?: string }) => {
    const response = await fetch(`/api/sessions/${sessionId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
    const data = await response.json()
    return data.session
  }
)

export const disputeSession = createAsyncThunk(
  'sessions/disputeSession',
  async ({ sessionId, reason }: { sessionId: string; reason: string }) => {
    const response = await fetch(`/api/sessions/${sessionId}/dispute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
    const data = await response.json()
    return data.session
  }
)

const sessionSlice = createSlice({
  name: 'sessions',
  initialState,
  reducers: {
    setCurrentSession: (state, action: PayloadAction<Session | null>) => {
      state.currentSession = action.payload
    },
    clearError: (state) => {
      state.error = null
    },
    updateSessionStatus: (state, action: PayloadAction<{ sessionId: string; status: Session['status'] }>) => {
      const session = state.sessions.find(s => s.id === action.payload.sessionId)
      if (session) {
        session.status = action.payload.status
      }
      if (state.currentSession?.id === action.payload.sessionId) {
        state.currentSession.status = action.payload.status
      }
    },
  },
  extraReducers: (builder) => {
    builder
      // Create session
      .addCase(createSession.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(createSession.fulfilled, (state, action) => {
        state.isLoading = false
        state.sessions.push(action.payload)
      })
      .addCase(createSession.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.error.message || 'Failed to create session'
      })
      // Fetch sessions
      .addCase(fetchSessions.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(fetchSessions.fulfilled, (state, action) => {
        state.isLoading = false
        state.sessions = action.payload
        
        // Categorize sessions
        const now = new Date()
        state.upcomingSessions = action.payload.filter((session: Session) => 
          new Date(session.scheduledAt) > now && session.status === 'scheduled'
        )
        state.pastSessions = action.payload.filter((session: Session) => 
          ['completed', 'cancelled'].includes(session.status)
        )
      })
      .addCase(fetchSessions.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.error.message || 'Failed to fetch sessions'
      })
      // Fetch session by ID
      .addCase(fetchSessionById.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(fetchSessionById.fulfilled, (state, action) => {
        state.isLoading = false
        state.currentSession = action.payload
      })
      .addCase(fetchSessionById.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.error.message || 'Failed to fetch session'
      })
      // Start session
      .addCase(startSession.fulfilled, (state, action) => {
        const index = state.sessions.findIndex(s => s.id === action.payload.id)
        if (index !== -1) {
          state.sessions[index] = action.payload
        }
        if (state.currentSession?.id === action.payload.id) {
          state.currentSession = action.payload
        }
      })
      // Complete session
      .addCase(completeSession.fulfilled, (state, action) => {
        const index = state.sessions.findIndex(s => s.id === action.payload.id)
        if (index !== -1) {
          state.sessions[index] = action.payload
        }
        if (state.currentSession?.id === action.payload.id) {
          state.currentSession = action.payload
        }
      })
      // Cancel session
      .addCase(cancelSession.fulfilled, (state, action) => {
        const index = state.sessions.findIndex(s => s.id === action.payload.id)
        if (index !== -1) {
          state.sessions[index] = action.payload
        }
        if (state.currentSession?.id === action.payload.id) {
          state.currentSession = action.payload
        }
      })
      // Dispute session
      .addCase(disputeSession.fulfilled, (state, action) => {
        const index = state.sessions.findIndex(s => s.id === action.payload.id)
        if (index !== -1) {
          state.sessions[index] = action.payload
        }
        if (state.currentSession?.id === action.payload.id) {
          state.currentSession = action.payload
        }
      })
  },
})

export const { setCurrentSession, clearError, updateSessionStatus } = sessionSlice.actions
export default sessionSlice.reducer
