/**
 * **The rig, as a checklist — deliberately not a data model.**
 *
 * Camera, projector, second display, audio. Nothing here is stored and none of it reaches
 * `gig.json`: a hardware field rots the first time the gig is reused for another room, and a stored
 * tick is a claim about a room that has since been packed away.
 *
 * It is shown twice, and both times it is the same four lines read by a person: on **step 5**, the
 * readiness check at the venue, and **again at arm**, on the control screen, which is the last
 * moment before the room sees anything.
 */
export const RIG_CHECKLIST: readonly string[] = [
  'Camera, if the room is being re-mapped',
  'Projector on, and aimed where the room was mapped',
  'Second display recognised, projection window on it',
  'Audio: the sound the animation is driven against',
]
