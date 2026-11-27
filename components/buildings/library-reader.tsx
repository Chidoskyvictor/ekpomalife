'use client'

import { ArrowLeft, Check, ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { BOOKS, readMinutes, SHELVES, type Book, type BookShelf } from '@/lib/game/library-books'
import styles from './library-reader.module.css'

const READ_KEY = 'ekpoma.library.read'

function loadRead(): string[] {
  try {
    return JSON.parse(localStorage.getItem(READ_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

function Cover({ book, big = false }: { book: Book; big?: boolean }) {
  return (
    <div className={`${styles.cover} ${big ? styles.coverBig : ''}`} style={{ background: `linear-gradient(150deg, ${book.cover[0]}, ${book.cover[1]})` }} aria-hidden="true">
      <span className={styles.coverSpine} />
      <span className={styles.coverEmoji}>{book.emoji}</span>
    </div>
  )
}

/**
 * The Library: a shelf of books (search + shelf chips), then a paged reader. Finishing a book calls
 * `onFinish`, which runs the study action on the server (the knowledge boost).
 */
export function LibraryReader({ onClose, onFinish, busy }: { onClose: () => void; onFinish: (book: Book) => Promise<boolean>; busy: boolean }) {
  const [shelf, setShelf] = useState<BookShelf | 'all'>('all')
  const [query, setQuery] = useState('')
  const [book, setBook] = useState<Book | null>(null)
  const [page, setPage] = useState(0)
  const [read, setRead] = useState<string[]>([])

  useEffect(() => setRead(loadRead()), [])

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return BOOKS.filter((b) => (shelf === 'all' || b.shelf === shelf) && (!q || `${b.title} ${b.author} ${b.blurb}`.toLowerCase().includes(q)))
  }, [shelf, query])

  const open = (b: Book) => {
    setBook(b)
    setPage(0)
  }

  const finish = async () => {
    if (!book) return
    const ok = await onFinish(book)
    if (!ok) return
    const next = [...new Set([...read, book.id])]
    setRead(next)
    try {
      localStorage.setItem(READ_KEY, JSON.stringify(next))
    } catch {
      /* private mode: the tick just won't stick */
    }
    setBook(null)
  }

  if (book) {
    const last = page === book.pages.length - 1
    return (
      <div className={styles.root} role="dialog" aria-modal="true" aria-label={book.title}>
        <header className={styles.bar}>
          <button type="button" className={styles.round} aria-label="Back to the shelf" onClick={() => setBook(null)}>
            <ArrowLeft size={18} aria-hidden="true" />
          </button>
          <div className={styles.barText}>
            <strong>{book.title}</strong>
            <small>
              Page {page + 1} of {book.pages.length}
            </small>
          </div>
          <button type="button" className={styles.round} aria-label="Close the library" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className={styles.progress} aria-hidden="true">
          <span style={{ width: `${((page + 1) / book.pages.length) * 100}%` }} />
        </div>
        <article className={styles.page} key={page}>
          {page === 0 ? (
            <div className={styles.titlePage}>
              <Cover book={book} big />
              <p className={styles.byline}>{book.author}</p>
            </div>
          ) : null}
          {book.pages[page]!.map((para, i) => (
            <p key={i}>{para}</p>
          ))}
          {last ? <p className={styles.theEnd}>— The end —</p> : null}
        </article>
        <footer className={styles.nav}>
          <button type="button" className={styles.navBtn} disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft size={18} aria-hidden="true" />
            Back
          </button>
          {last ? (
            <button type="button" className={`${styles.navBtn} ${styles.finish}`} disabled={busy} onClick={() => void finish()}>
              <Check size={18} aria-hidden="true" />
              {busy ? 'Saving…' : 'Finish'}
            </button>
          ) : (
            <button type="button" className={`${styles.navBtn} ${styles.next}`} onClick={() => setPage((p) => p + 1)}>
              Next
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          )}
        </footer>
      </div>
    )
  }

  return (
    <div className={styles.root} role="dialog" aria-modal="true" aria-label="Library shelf">
      <header className={styles.bar}>
        <span className={styles.badge} aria-hidden="true">
          📖
        </span>
        <div className={styles.barText}>
          <strong>Library</strong>
          <small>Open 24/7 · {read.length ? `${read.length} of ${BOOKS.length} read` : `${BOOKS.length} books on the shelf`}</small>
        </div>
        <button type="button" className={styles.round} aria-label="Close the library" onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      <label className={styles.search}>
        <Search size={16} aria-hidden="true" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search books, novels, tales" aria-label="Search books" />
      </label>
      <div className={styles.chips} role="tablist" aria-label="Shelves">
        {SHELVES.map((s) => (
          <button key={s.id} type="button" role="tab" aria-selected={shelf === s.id} className={`${styles.chip} ${shelf === s.id ? styles.chipOn : ''}`} onClick={() => setShelf(s.id)}>
            <span aria-hidden="true">{s.emoji}</span>
            {s.label}
          </button>
        ))}
      </div>
      <div className={styles.grid}>
        {list.map((b) => {
          const done = read.includes(b.id)
          return (
            <button key={b.id} type="button" className={styles.card} onClick={() => open(b)}>
              <Cover book={b} />
              <span className={styles.cardText}>
                <strong>{b.title}</strong>
                <small>{b.author}</small>
                <span className={styles.blurb}>{b.blurb}</span>
                <span className={styles.meta}>
                  <span>⏱ {readMinutes(b)} min</span>
                  {done ? <span className={styles.done}>✓ Read</span> : <span className={styles.readBtn}>Read</span>}
                </span>
              </span>
            </button>
          )
        })}
        {list.length === 0 ? (
          <div className={styles.empty}>
            <span aria-hidden="true">🔎</span>
            <p>No book by that name on the shelf yet.</p>
            <button type="button" className={styles.navBtn} onClick={() => { setQuery(''); setShelf('all') }}>
              Show all books
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
