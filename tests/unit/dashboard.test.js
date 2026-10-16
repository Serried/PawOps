import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { DashboardErrorState, DashboardView } from '../../src/pages/dashboard/DashboardPage.jsx'

const event = (overrides = {}) => ({
  id: 10,
  petId: 1,
  petName: 'Mochi',
  type: 'feeding',
  title: 'Breakfast',
  scheduledAt: '2026-10-15T01:00:00.000Z',
  status: 'upcoming',
  completedAt: null,
  completedBy: null,
  ...overrides,
})

function renderDashboard(data) {
  return renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(DashboardView, {
        data,
        user: { name: 'Tanakrit' },
        household: { name: 'Serried Household' },
      }),
    ),
  )
}

describe('PBI-13 dashboard', () => {
  it('renders pets, today care, recent activity, and active alerts', () => {
    const completed = event({
      id: 11,
      title: 'Morning walk',
      type: 'walk',
      status: 'done',
      completedAt: '2026-10-15T02:04:00.000Z',
      completedBy: { id: 2, name: 'Ryuu' },
    })
    const overdue = event({ id: 12, title: 'Medication', type: 'medication', status: 'overdue' })
    const html = renderDashboard({
      pets: [{ id: 1, name: 'Mochi', species: 'Cat', photoUrl: null }],
      today: [completed, overdue],
      recentActivity: [completed],
      activeAlerts: [overdue],
    })

    expect(html).toContain('Serried Household')
    expect(html).toContain('Mochi')
    expect(html).toContain('Morning walk')
    expect(html).toContain('Recent activity')
    expect(html).toContain('Medication overdue')
  })

  it('renders safe empty states when there are no pets or care records', () => {
    const html = renderDashboard({ pets: [], today: [], recentActivity: [], activeAlerts: [] })
    expect(html).toContain('No pets yet')
    expect(html).toContain('No care scheduled today')
    expect(html).toContain('No care activity yet')
    expect(html).toContain('No active alerts')
  })

  it('renders a recoverable API failure instead of a blank page', () => {
    const html = renderToStaticMarkup(
      React.createElement(DashboardErrorState, { error: { status: 500 } }),
    )
    expect(html).toContain('Unable to load your dashboard.')
    expect(html).toContain('Try again')
  })

  it('represents completed, upcoming, and overdue routines distinctly', () => {
    const html = renderDashboard({
      pets: [{ id: 1, name: 'Mochi', species: 'Cat' }],
      today: [
        event({ id: 20, status: 'done', completedAt: '2026-10-15T01:01:00.000Z' }),
        event({ id: 21, title: 'Dinner', status: 'upcoming' }),
        event({ id: 22, title: 'Pill', status: 'overdue' }),
      ],
      recentActivity: [],
      activeAlerts: [],
    })
    expect(html).toContain('badge--done')
    expect(html).toContain('Completed')
    expect(html).toContain('badge--upcoming')
    expect(html).toContain('Upcoming')
    expect(html).toContain('badge--overdue')
    expect(html).toContain('Overdue')
  })
})
