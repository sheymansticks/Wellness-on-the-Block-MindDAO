import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'

export interface User {
  id: string
  email: string
  publicKey: string
  role: 'patient' | 'provider'
  profile: {
    firstName: string
    lastName: string
    avatar?: string
  }
  isVerified: boolean
  zkProofHash?: string
}

export interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
}

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
}

// Async thunks
export const loginUser = createAsyncThunk(
  'auth/login',
  async (credentials: { publicKey: string; signature: string }) => {
    // This will connect to the backend API
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    })
    const data = await response.json()
    return data.user
  }
)

export const registerUser = createAsyncThunk(
  'auth/register',
  async (userData: {
    email: string
    publicKey: string
    role: 'patient' | 'provider'
    profile: {
      firstName: string
      lastName: string
    }
  }) => {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    })
    const data = await response.json()
    return data.user
  }
)

export const generateZKProof = createAsyncThunk(
  'auth/generateZKProof',
  async (proofData: { identityCommitment: string; nullifier: string }) => {
    // This will generate a zero-knowledge proof for identity verification
    const response = await fetch('/api/zk/generate-proof', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(proofData),
    })
    const data = await response.json()
    return data.proofHash
  }
)

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout: (state) => {
      state.user = null
      state.isAuthenticated = false
      state.error = null
    },
    clearError: (state) => {
      state.error = null
    },
    updateUser: (state, action: PayloadAction<Partial<User>>) => {
      if (state.user) {
        state.user = { ...state.user, ...action.payload }
      }
    },
  },
  extraReducers: (builder) => {
    builder
      // Login
      .addCase(loginUser.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.isLoading = false
        state.user = action.payload
        state.isAuthenticated = true
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.error.message || 'Login failed'
      })
      // Register
      .addCase(registerUser.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(registerUser.fulfilled, (state, action) => {
        state.isLoading = false
        state.user = action.payload
        state.isAuthenticated = true
      })
      .addCase(registerUser.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.error.message || 'Registration failed'
      })
      // ZK Proof
      .addCase(generateZKProof.pending, (state) => {
        state.isLoading = true
      })
      .addCase(generateZKProof.fulfilled, (state, action) => {
        state.isLoading = false
        if (state.user) {
          state.user.zkProofHash = action.payload
        }
      })
      .addCase(generateZKProof.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.error.message || 'ZK Proof generation failed'
      })
  },
})

export const { logout, clearError, updateUser } = authSlice.actions
export default authSlice.reducer
