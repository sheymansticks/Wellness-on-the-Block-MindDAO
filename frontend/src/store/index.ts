import { configureStore } from '@reduxjs/toolkit'
import authSlice from './authSlice'
import providerSlice from './providerSlice'
import sessionSlice from './sessionSlice'

export const store = configureStore({
  reducer: {
    auth: authSlice,
    providers: providerSlice,
    sessions: sessionSlice,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST'],
      },
    }),
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
