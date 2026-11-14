import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Field } from '../components/ui/Field.jsx'
import { fieldProps } from '../components/ui/fieldProps.js'

function EmailField({ error, hint }) {
  return (
    <Field id="email" label="Email" error={error} hint={hint}>
      <input {...fieldProps('email', error, hint)} type="email" />
    </Field>
  )
}

describe('form field', () => {
  it('labels the input and links the hint for screen readers', () => {
    render(<EmailField hint="We never share it." />)
    const input = screen.getByLabelText('Email')
    expect(input).toHaveClass('form-control')
    expect(input).toHaveAccessibleDescription('We never share it.')
    expect(input).not.toHaveAttribute('aria-invalid')
  })

  it('shows the error instead of the hint and marks the input invalid', () => {
    render(<EmailField hint="We never share it." error="Enter a valid email address." />)
    const input = screen.getByLabelText('Email')
    expect(input).toHaveClass('form-control', 'is-invalid')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Enter a valid email address.')
    expect(screen.queryByText('We never share it.')).not.toBeInTheDocument()
  })
})
