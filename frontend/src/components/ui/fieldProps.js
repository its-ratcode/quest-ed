/** Props for the input inside <Field>: its id, styling, and links to the hint or error for screen readers. */
export function fieldProps(id, error, hint) {
  return {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : hint ? `${id}-hint` : undefined,
    className: `form-control${error ? ' is-invalid' : ''}`,
  }
}
