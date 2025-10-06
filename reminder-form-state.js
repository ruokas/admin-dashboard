const REMINDER_FORM_DEFAULTS = Object.freeze({
  editingId: null,
  values: null,
  error: '',
});

let reminderFormState = { ...REMINDER_FORM_DEFAULTS };

/**
 * Returns the current reminder form state reference.
 * @returns {{editingId: string|null, values: object|null, error: string}}
 */
export function getReminderFormState() {
  return reminderFormState;
}

/**
 * Replaces the reminder form state with provided partial data.
 * @param {Partial<{editingId: string|null, values: object|null, error: string}>} [partial]
 * @returns {{editingId: string|null, values: object|null, error: string}}
 */
export function updateReminderFormState(partial = {}) {
  reminderFormState = { ...reminderFormState, ...partial };
  return reminderFormState;
}

/**
 * Resets the reminder form state to defaults.
 * @returns {{editingId: string|null, values: object|null, error: string}}
 */
export function resetReminderFormState() {
  reminderFormState = { ...REMINDER_FORM_DEFAULTS };
  return reminderFormState;
}

/**
 * Sets the reminder form state to the provided snapshot.
 * @param {{editingId?: string|null, values?: object|null, error?: string}|undefined} nextState
 * @returns {{editingId: string|null, values: object|null, error: string}}
 */
export function setReminderFormState(nextState) {
  if (nextState == null || typeof nextState !== 'object') {
    return resetReminderFormState();
  }
  reminderFormState = {
    ...REMINDER_FORM_DEFAULTS,
    ...nextState,
  };
  return reminderFormState;
}

export function reminderFormDefaults() {
  return REMINDER_FORM_DEFAULTS;
}
