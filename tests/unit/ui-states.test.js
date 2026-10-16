import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { apiError, isRecoverableError } from '../../src/api/client.js'
import { DuplicateWarningDialog } from '../../src/components/DuplicateWarningDialog.jsx'
import { EmptyState, PageLoading, RequestError, StatusNotice } from '../../src/components/AsyncState.jsx'
import { errorPresentation } from '../../src/lib/errors.js'
import { validatePetValues } from '../../src/lib/validation.js'

function render(component) {
  return renderToStaticMarkup(React.createElement(MemoryRouter, null, component))
}

describe('PBI-14 UI states and error handling', () => {
  it('announces page loading without showing an empty state', () => {
    const html = render(React.createElement(PageLoading, { label: 'Loading pets…' }))
    expect(html).toContain('role="status"')
    expect(html).toContain('Loading pets…')
    expect(html).not.toContain('No pets yet')
  })

  it('renders accessible success feedback', () => {
    const html = render(React.createElement(StatusNotice, null, 'Pet added successfully.'))
    expect(html).toContain('role="status"')
    expect(html).toContain('Pet added successfully.')
  })

  it('returns field-specific client validation errors', () => {
    const errors = validatePetValues(
      { name: ' ', species: '', weightKg: '-1', birthDate: '2026-10-16' },
      new Date('2026-10-15T12:00:00+07:00'),
    )
    expect(errors).toEqual({
      name: 'is required',
      species: 'is required',
      weightKg: 'must be greater than 0',
      birthDate: 'must be today or earlier',
    })
  })

  it('distinguishes an expired session from forbidden access', () => {
    expect(errorPresentation({ status: 401 }).title).toBe('Your session has expired.')
    expect(errorPresentation({ status: 403 }).title).toContain("don't have permission")
  })

  it('does not display protected content for forbidden access', () => {
    const html = render(React.createElement(RequestError, {
      error: { status: 403 },
      resourceName: 'Household',
      backTo: '/dashboard',
    }))
    expect(html).toContain('don&#x27;t have permission')
    expect(html).not.toContain('Mochi')
    expect(html).not.toContain('Try again')
  })

  it('shows a domain-specific duplicate care warning', () => {
    const html = render(React.createElement(DuplicateWarningDialog, {
      warning: { message: 'Mochi was fed 6 minutes ago by Ryuu.' },
      busy: false,
      onCancel: vi.fn(),
      onConfirm: vi.fn(),
    }))
    expect(html).toContain('Possible duplicate care')
    expect(html).toContain('Mochi was fed 6 minutes ago by Ryuu.')
    expect(html).toContain('Continue anyway')
  })

  it('sanitizes server failures and keeps recoverable errors retryable', () => {
    const serverError = apiError({
      response: { status: 500, data: { error: { message: 'SQL password leaked' } } },
    })
    const networkError = apiError({ request: {}, message: 'socket details' })
    expect(serverError.message).not.toContain('SQL')
    expect(networkError.code).toBe('NETWORK_ERROR')
    expect(isRecoverableError(serverError)).toBe(true)
    expect(isRecoverableError(networkError)).toBe(true)

    const html = render(React.createElement(RequestError, {
      error: networkError,
      resourceName: 'Dashboard',
      onRetry: vi.fn(),
    }))
    expect(html).toContain('Unable to connect to PawOps.')
    expect(html).toContain('Try again')
  })

  it('renders empty data as guidance rather than an error', () => {
    const html = render(React.createElement(EmptyState, {
      title: 'No pets yet.',
      message: 'Add your first pet to start managing its care.',
      actionLabel: 'Add pet',
      actionTo: '/pets/new',
    }))
    expect(html).toContain('No pets yet.')
    expect(html).toContain('Add pet')
    expect(html).not.toContain('role="alert"')
  })
})
