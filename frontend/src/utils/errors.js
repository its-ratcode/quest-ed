/** Plain-language messages for failed requests. */
export function getErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  if (!error) return fallback
  if (!error.response) return "We couldn't reach the server. Check your connection and try again."
  if (error.response.status >= 500) return 'The server had a problem. Please try again in a moment.'
  return error.response.data?.message || fallback
}

/** The API's per-field messages, e.g. { email: 'Enter a valid email address.' }. */
export function getFieldErrors(error) {
  return error?.response?.data?.errors || {}
}
