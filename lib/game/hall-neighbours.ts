/**
 * The two signs on the blocks around a class (class-hall.glb SignBoard0 / SignBoard1): the places
 * next to it in real life. A draft from the campus map; edit freely, the signs just read these.
 */
export const HALL_NEIGHBOURS: Record<string, [string, string]> = {
  'hall-100': ['200 Level Hall', 'ETF Hall'],
  'hall-200': ['100 Level Hall', 'MLS Hall'],
  'etf-hall': ['MLS Hall', '100 Level Hall'],
  'mls-hall': ['200 Level Hall', 'College of Medicine'],
  'twin-hall': ['Cordelia Hall', 'Engineering'],
  'cordelia-hall': ['Twin Hall', 'Student Conference'],
  education: ['Mass Communication', 'ICT'],
  'mass-comm': ['Student Conference', 'Education'],
  'law-campus': ['Mass Communication', 'Management Science'],
  'physical-science': ['Social Science', 'Life Science'],
  'social-science': ['Physical Science', 'Life Science'],
  'life-science': ['Social Science', 'Management Science'],
  'management-science': ['Law', 'Engineering'],
  engineering: ['Management Science', 'Twin Hall'],
}

export const hallNeighbours = (hallId: string): [string, string] => HALL_NEIGHBOURS[hallId] ?? ['Faculty Block', 'Lecture Theatre']
