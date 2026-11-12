/** Feature flags with no app/component imports (avoids circular deps). */
export const PHONE_FREE_FOR_ALL = true

/**
 * Street outside your home ("Go inside" / "Go outside") and "Where to?" travel. Built but
 * hidden until launch: flip to true to show the buttons again.
 */
export const STREET_AND_TRAVEL = false

/** The street outside your home ("Go outside" / "Go inside"), your car parked at the kerb with "Get in",
 *  and the street boy. On without the old "Where to?" travel menu (that stays behind STREET_AND_TRAVEL). */
export const HOME_STREET = true
