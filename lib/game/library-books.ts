/*
 * The Library's shelf. Everything here is free to share: our own stories set in Ekpoma, and old
 * folk tales and Aesop's fables (public domain) retold in our own words. Never paste in modern
 * books (they are under copyright); add new titles as data below.
 */

export type BookShelf = 'story' | 'novel' | 'folk' | 'classic'

export type Book = {
  id: string
  title: string
  author: string
  shelf: BookShelf
  /** Cover colours (light, dark) and a sticker. */
  cover: [string, string]
  emoji: string
  blurb: string
  /** Each page is a few short paragraphs. */
  pages: string[][]
}

export const SHELVES: { id: BookShelf | 'all'; label: string; emoji: string }[] = [
  { id: 'all', label: 'All', emoji: '📚' },
  { id: 'story', label: 'Stories', emoji: '✍️' },
  { id: 'novel', label: 'Novels', emoji: '📖' },
  { id: 'folk', label: 'Folk tales', emoji: '🐢' },
  { id: 'classic', label: 'Classics', emoji: '🏛️' },
]

export const BOOKS: Book[] = [
  {
    id: 'harmattan-semester-1',
    title: 'Harmattan Semester · Ch. 1',
    author: 'Ekpoma Life',
    shelf: 'novel',
    cover: ['#f4c27a', '#b5651d'],
    emoji: '🌫️',
    blurb: 'Osas arrives at AAU with one bag, one plan and no idea how loud a hostel can be.',
    pages: [
      [
        'The bus from Benin dropped Osas at the AAU gate just as the harmattan haze swallowed the sun. Everything was the colour of old paper: the road, the trees, even the keke men waiting in a lazy line.',
        'He held his admission letter like a passport. His mother had folded it four times and told him not to lose it, because "this paper is your future."',
      ],
      [
        'The hostel was three floors of noise. Somebody was frying plantain. Somebody else was playing the same song for the fifth time. A boy in a red singlet leaned over the railing and shouted, "Fresher! Welcome to the jungle!"',
        'Osas smiled because he did not know what else to do.',
      ],
      [
        'His roommate was called Ifeanyi, and he had already covered one wall with timetables. "Mass Comm," Ifeanyi said, shaking his hand. "You?"',
        '"Accounting."',
        '"Ah. Numbers man. You will help me with my money then."',
        'For the first time since the bus, Osas laughed.',
      ],
      [
        'That night the light went off at nine. The whole hostel groaned at once, like one big animal. Then, slowly, phones came on, one by one, little blue stars in the dark corridor.',
        'Osas lay on his thin mattress and listened. Somewhere a guitar started. Somewhere a girl was laughing. He thought: maybe this jungle is not so bad.',
      ],
    ],
  },
  {
    id: 'harmattan-semester-2',
    title: 'Harmattan Semester · Ch. 2',
    author: 'Ekpoma Life',
    shelf: 'novel',
    cover: ['#9fd3c7', '#1f6f63'],
    emoji: '📝',
    blurb: 'First lecture, first crush, first time Osas realises the course outline is not a joke.',
    pages: [
      [
        'Lecture started at eight. Osas arrived at seven-thirty and still had to stand at the back, because half the class had slept in the hall to hold seats.',
        'The lecturer, Dr Okoh, did not greet anyone. He wrote one sentence on the board: "Attendance is not participation."',
      ],
      [
        'Beside Osas stood a girl with braids tied up in a yellow scarf. She was writing faster than the lecturer was talking. When he dropped his pen, she picked it up without looking and handed it back.',
        '"Thank you," he whispered.',
        '"Write," she whispered back. "He will ask this in the test."',
      ],
      [
        'After class Osas found her at the bukka, arguing with Mama Amina about the size of the meat. Her name was Ese. She studied Law and she believed, very seriously, that every argument could be won.',
        '"Even with Mama Amina?" he asked.',
        '"Especially with Mama Amina," she said, and the meat got bigger.',
      ],
      [
        'That evening Osas opened his course outline properly for the first time. Twelve topics. Two tests. One exam. He counted the weeks and felt his stomach drop.',
        'Then he took out a fresh notebook, wrote "Harmattan Semester" on the cover, and began.',
      ],
    ],
  },
  {
    id: 'keke-promise',
    title: "The Keke Driver's Promise",
    author: 'Ekpoma Life',
    shelf: 'story',
    cover: ['#ffe066', '#e09f00'],
    emoji: '🛺',
    blurb: 'A keke driver, a forgotten phone, and a ride that pays more than money.',
    pages: [
      [
        'Baba Tunde had driven a keke in Ekpoma for eleven years. He knew every pothole by name and every student by face, even the ones who pretended not to know him after they graduated.',
        'On a rainy Thursday a student left a phone on his back seat. It rang all afternoon. Mum. Mum. Mum.',
      ],
      [
        'Baba Tunde could have sold it. A phone like that would pay his keke rent for a month. Instead he answered.',
        '"Madam, your child forgot this phone in my keke. Tell them to wait at the school gate by six. I will bring it."',
      ],
      [
        'At six the student was there, soaked and shaking with relief. She tried to give him two thousand naira. He refused. "Just greet me when you become a big lawyer," he said.',
        'Four years later, at the gate, a young woman in a black gown stopped his keke and paid for every seat so he could take the afternoon off. "I am greeting you," she said.',
      ],
    ],
  },
  {
    id: 'night-before-cbt',
    title: 'The Night Before the CBT',
    author: 'Ekpoma Life',
    shelf: 'story',
    cover: ['#b8c0ff', '#3a47c9'],
    emoji: '💻',
    blurb: 'Three friends, one generator, and the longest night of the semester.',
    pages: [
      [
        'The CBT was at nine in the morning. At nine the night before, Kelvin, Joy and Daniel had covered exactly two topics out of seven.',
        '"We are finished," Daniel announced, lying flat on the floor.',
        '"We are not finished," said Joy. "We are just starting late."',
      ],
      [
        'They made a plan. Joy explained a topic, Kelvin asked the stupid questions everyone was too proud to ask, and Daniel turned the answers into songs so they would stick.',
        'By two in the morning the hostel was asleep and they were singing about balance sheets.',
      ],
      [
        'The next day, question fourteen was about exactly the topic Daniel had turned into a terrible afrobeats chorus. All three of them hummed it under their breath in the ICT hall.',
        'They all passed. Daniel still says it was the song. Joy still says it was the plan. Kelvin says it was the stupid questions, and he is probably right.',
      ],
    ],
  },
  {
    id: 'tortoise-shell',
    title: 'How Tortoise Got His Cracked Shell',
    author: 'Nigerian folk tale, retold',
    shelf: 'folk',
    cover: ['#c9e4a5', '#4f7a28'],
    emoji: '🐢',
    blurb: 'Tortoise talks his way into a feast in the sky. Getting home is another matter.',
    pages: [
      [
        'Long ago the birds were invited to a great feast in the sky. Tortoise, who could not fly, begged each bird for one feather until he had a pair of patchwork wings.',
        'On the way up he told them, "At feasts in the sky, everyone takes a new name. Mine is All of You."',
      ],
      [
        'When the hosts brought out the food they said, "This is for all of you." Tortoise stepped forward. "That is me," he said, and he ate the best of everything while the birds watched.',
        'The birds were so angry that each one took back its feather. Tortoise was left alone at the edge of the sky with no way down.',
      ],
      [
        'He shouted to his wife to bring out every soft thing in the house so he could jump. But the birds told her to bring out the hard things instead.',
        'Tortoise jumped and landed on hoes and pots, and his smooth shell cracked into pieces. A healer glued it back together, and that is why a tortoise shell is still patched today. Greed is sweet only until you have to come down.',
      ],
    ],
  },
  {
    id: 'anansi-wisdom',
    title: 'Anansi and the Pot of Wisdom',
    author: 'West African folk tale, retold',
    shelf: 'folk',
    cover: ['#ffc6a8', '#c0502a'],
    emoji: '🕷️',
    blurb: 'Anansi wants to keep all the wisdom in the world to himself.',
    pages: [
      [
        'Anansi the spider once gathered all the wisdom in the world into a single clay pot. "If I keep it all," he thought, "everyone will have to come to me."',
        'He decided to hide the pot at the top of the tallest tree.',
      ],
      [
        'He tied the pot to his belly and tried to climb, but the pot kept knocking against the trunk and he kept sliding down. His little son watched for a while.',
        '"Father," the boy said, "why not tie it to your back? Then you can hold the tree."',
      ],
      [
        'Anansi realised that even with all the wisdom in the world in his pot, a child had just taught him something. In his anger he dropped the pot, and it smashed on the ground.',
        'The wind carried the wisdom everywhere, and that is why nobody has all of it. Everyone has a little, and we learn the rest from each other.',
      ],
    ],
  },
  {
    id: 'tortoise-hare',
    title: 'The Tortoise and the Hare',
    author: "Aesop's fables, retold",
    shelf: 'classic',
    cover: ['#d7e8ff', '#3f74c4'],
    emoji: '🏁',
    blurb: 'The fastest runner in the forest takes a nap in the middle of a race.',
    pages: [
      [
        'Hare loved to boast about his speed. One day Tortoise, tired of hearing it, said, "Race me." All the animals laughed.',
        'The race began. Hare shot off and was soon so far ahead that he could not even see Tortoise behind him.',
      ],
      [
        '"I have time for a nap," Hare decided, and he lay down under a tree. Tortoise kept walking, slow and steady, never stopping.',
        'When Hare woke up, the sun was low. He ran as fast as he could, but Tortoise was already crossing the finish line. Slow and steady wins the race.',
      ],
    ],
  },
  {
    id: 'ant-grasshopper',
    title: 'The Ant and the Grasshopper',
    author: "Aesop's fables, retold",
    shelf: 'classic',
    cover: ['#ffe3b3', '#a86b00'],
    emoji: '🐜',
    blurb: 'One works through the dry season, one sings through it. Then the rains end.',
    pages: [
      [
        'All through the warm months, Ant carried grain to her store while Grasshopper sang in the grass. "Why work so hard?" he laughed. "There is food everywhere."',
        'Ant kept carrying.',
      ],
      [
        'When the cold season came, the fields were empty. Hungry, Grasshopper knocked on Ant\'s door and asked for food.',
        '"You sang all summer," said Ant, sharing a little grain, "so this year, learn to plan as well as you sing." Prepare today for the needs of tomorrow.',
      ],
    ],
  },
  {
    id: 'boy-cried-wolf',
    title: 'The Boy Who Cried Wolf',
    author: "Aesop's fables, retold",
    shelf: 'classic',
    cover: ['#e2d4ff', '#5b3fb0'],
    emoji: '🐺',
    blurb: 'A bored shepherd boy finds a way to make the village run. It works, for a while.',
    pages: [
      [
        'A shepherd boy was bored watching sheep, so he shouted, "Wolf! Wolf!" The villagers ran up the hill with sticks, and found only the boy, laughing.',
        'He did it again the next week. Again they came. Again there was no wolf.',
      ],
      [
        'Then one evening a real wolf crept out of the trees. "Wolf! Wolf!" the boy screamed. Nobody came, because nobody believed him any more.',
        'Nobody believes a liar, even when he tells the truth.',
      ],
    ],
  },
]

/** Rough reading time for a book (minutes), from its word count. */
export function readMinutes(book: Book): number {
  const words = book.pages.flat().join(' ').split(/\s+/).length
  return Math.max(1, Math.round(words / 200))
}
