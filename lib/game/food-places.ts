import { BUKKA_PLACE } from './bukka'
import { CONFERENCE_PLACE } from './conference'
import { DUBLOUS_PLACE } from './dublous'
import { PLAY_CHILL_PLACE } from './play-chill'
import type { FoodPlace } from './food-room'
import { SPOT_RITE_PLACE } from './spot-rite'

/** Food places with their own 3D room and counter ordering, by place id. */
export const FOOD_PLACES: Record<string, FoodPlace> = {
  'spot-rite': SPOT_RITE_PLACE,
  bukka: BUKKA_PLACE,
  dubious: DUBLOUS_PLACE,
  'playchill-climax': PLAY_CHILL_PLACE,
  'students-centre': CONFERENCE_PLACE,
}
