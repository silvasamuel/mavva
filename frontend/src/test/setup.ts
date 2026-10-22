import '@testing-library/jest-dom'

// jsdom has no canvas or wasm: the animated seed stays on its still frame in tests.
vi.mock('@/components/mascot/SeedMascotCanvas', () => ({ default: () => null }))
