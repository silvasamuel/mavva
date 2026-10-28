import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminAnnouncement } from './types'
import { AnnouncementsPanel } from './AnnouncementsPanel'

const get = vi.fn()
const post = vi.fn()
const patch = vi.fn()
const del = vi.fn()

vi.mock('@/lib/api', () => ({
  api: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
    patch: (...args: unknown[]) => patch(...args),
    delete: (...args: unknown[]) => del(...args),
  },
  ApiError: class ApiError extends Error {},
}))

const published: AdminAnnouncement = {
  id: 'a1',
  title: 'Ranking de precisão',
  body: 'Nova aba no ranking.',
  kind: 'feature',
  published_at: '2026-10-20T12:00:00Z',
  created_at: '2026-10-20T11:00:00Z',
  updated_at: '2026-10-20T12:00:00Z',
}
const draft: AdminAnnouncement = { ...published, id: 'a2', title: 'Rascunho de aviso', published_at: null }

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <AnnouncementsPanel />
    </QueryClientProvider>
  )
}

describe('AnnouncementsPanel', () => {
  beforeEach(() => {
    get.mockReset().mockResolvedValue([draft, published])
    post.mockReset().mockResolvedValue({ ...published, id: 'a3' })
    patch.mockReset().mockResolvedValue(published)
    del.mockReset().mockResolvedValue(undefined)
  })

  it('lists drafts and published news', async () => {
    renderPanel()
    const items = await screen.findAllByRole('listitem')
    expect(within(items[0]).getByText('Rascunho')).toBeInTheDocument()
    expect(within(items[0]).getByRole('button', { name: 'Publicar' })).toBeInTheDocument()
    expect(within(items[1]).getByText('Publicada')).toBeInTheDocument()
    expect(within(items[1]).getByRole('button', { name: 'Despublicar' })).toBeInTheDocument()
  })

  it('publishes a new announcement', async () => {
    const user = userEvent.setup()
    renderPanel()
    await screen.findAllByRole('listitem')

    await user.selectOptions(screen.getByLabelText('Tipo'), 'fix')
    await user.type(screen.getByLabelText('Título'), 'Bug do timer corrigido')
    await user.type(screen.getByLabelText(/Texto/), 'O tempo não trava mais.')
    // the form comes first, so its "Publicar" is the first one on the page
    await user.click(screen.getAllByRole('button', { name: 'Publicar' })[0])

    expect(post).toHaveBeenCalledWith('/admin/announcements', {
      title: 'Bug do timer corrigido',
      body: 'O tempo não trava mais.',
      kind: 'fix',
      published: true,
    })
    expect(await screen.findByText('Publicada para todos os jogadores.')).toBeInTheDocument()
  })

  it('unpublishes and deletes after confirming', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderPanel()
    const items = await screen.findAllByRole('listitem')

    await user.click(within(items[1]).getByRole('button', { name: 'Despublicar' }))
    expect(patch).toHaveBeenCalledWith('/admin/announcements/a1', { published: false })

    await user.click(within(items[0]).getByRole('button', { name: 'Apagar' }))
    expect(del).toHaveBeenCalledWith('/admin/announcements/a2')
  })
})
