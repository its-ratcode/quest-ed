/** This device's time zone by its IANA name, e.g. "Europe/Berlin" (null if the browser can't tell). */
export function deviceTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null
  } catch {
    return null
  }
}
