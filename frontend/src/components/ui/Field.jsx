/**
 * A labelled form field with an optional hint and error message:
 *
 *   <Field id="email" label="Email" error={errors.email}>
 *     <input {...fieldProps('email', errors.email)} type="email" />
 *   </Field>
 *
 * `fieldProps` lives in ./fieldProps.js.
 */
export function Field({ id, label, error, hint, children }) {
  return (
    <div className="mb-3">
      <label htmlFor={id} className="form-label">{label}</label>
      {children}
      {hint && !error && <div className="form-text" id={`${id}-hint`}>{hint}</div>}
      {error && <div className="invalid-feedback d-block" id={`${id}-error`}>{error}</div>}
    </div>
  )
}
