import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'

export interface Provider {
  id: string
  userId: string
  profile: {
    firstName: string
    lastName: string
    avatar?: string
    bio: string
    specialties: string[]
    languages: string[]
    education: string[]
    experience: number
  }
  credentials: {
    licenseNumber?: string
    certifications: string[]
    verified: boolean
    verificationDate?: string
  }
  services: {
    type: 'therapy' | 'counseling'
    pricePerSession: number
    currency: string
    sessionDuration: number
  }
  availability: {
    timezone: string
    schedule: {
      day: string
      startTime: string
      endTime: string
    }[]
  }
  reputation: {
    rating: number
    totalSessions: number
    reviews: {
      id: string
      rating: number
      comment: string
      anonymous: boolean
      createdAt: string
    }[]
  }
  isOnline: boolean
}

export interface ProviderState {
  providers: Provider[]
  selectedProvider: Provider | null
  isLoading: boolean
  error: string | null
  filters: {
    specialties: string[]
    priceRange: [number, number]
    languages: string[]
    availability: string[]
  }
}

const initialState: ProviderState = {
  providers: [],
  selectedProvider: null,
  isLoading: false,
  error: null,
  filters: {
    specialties: [],
    priceRange: [0, 500],
    languages: [],
    availability: [],
  },
}

// Async thunks
export const fetchProviders = createAsyncThunk(
  'providers/fetchProviders',
  async (filters?: Partial<ProviderState['filters']>) => {
    const queryParams = new URLSearchParams()
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          value.forEach(v => queryParams.append(key, v.toString()))
        } else if (value !== undefined) {
          queryParams.append(key, value.toString())
        }
      })
    }
    
    const response = await fetch(`/api/providers?${queryParams}`)
    const data = await response.json()
    return data.providers
  }
)

export const fetchProviderById = createAsyncThunk(
  'providers/fetchProviderById',
  async (providerId: string) => {
    const response = await fetch(`/api/providers/${providerId}`)
    const data = await response.json()
    return data.provider
  }
)

export const searchProviders = createAsyncThunk(
  'providers/searchProviders',
  async (query: { search: string; filters?: Partial<ProviderState['filters']> }) => {
    const response = await fetch('/api/providers/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(query),
    })
    const data = await response.json()
    return data.providers
  }
)

const providerSlice = createSlice({
  name: 'providers',
  initialState,
  reducers: {
    setFilters: (state, action: PayloadAction<Partial<ProviderState['filters']>>) => {
      state.filters = { ...state.filters, ...action.payload }
    },
    clearFilters: (state) => {
      state.filters = {
        specialties: [],
        priceRange: [0, 500],
        languages: [],
        availability: [],
      }
    },
    setSelectedProvider: (state, action: PayloadAction<Provider | null>) => {
      state.selectedProvider = action.payload
    },
    clearError: (state) => {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch providers
      .addCase(fetchProviders.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(fetchProviders.fulfilled, (state, action) => {
        state.isLoading = false
        state.providers = action.payload
      })
      .addCase(fetchProviders.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.error.message || 'Failed to fetch providers'
      })
      // Fetch provider by ID
      .addCase(fetchProviderById.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(fetchProviderById.fulfilled, (state, action) => {
        state.isLoading = false
        state.selectedProvider = action.payload
      })
      .addCase(fetchProviderById.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.error.message || 'Failed to fetch provider'
      })
      // Search providers
      .addCase(searchProviders.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(searchProviders.fulfilled, (state, action) => {
        state.isLoading = false
        state.providers = action.payload
      })
      .addCase(searchProviders.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.error.message || 'Failed to search providers'
      })
  },
})

export const { setFilters, clearFilters, setSelectedProvider, clearError } = providerSlice.actions
export default providerSlice.reducer
