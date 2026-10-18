'use client'

import { useEffect, useMemo, useState } from 'react'
import { fetchQuizPrompt } from '@/lib/game/game-api'
import styles from './building-panel.module.css'

type Question = {
  id: string
  prompt: string
  choices: [string, string, string, string]
}

export function QuizFlow({
  mode,
  bankId,
  placeId,
  version,
  onCancel,
  onSubmit,
}: {
  mode: 'quiz' | 'exam'
  bankId: string
  placeId: string
  version: number
  onCancel: () => void
  onSubmit: (payload: { answers: number[]; questionIds: string[] }) => void
}) {
  const [questions, setQuestions] = useState<Question[]>([])
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<number[]>([])
  const [picked, setPicked] = useState<number | null>(null)
  const [seconds, setSeconds] = useState(mode === 'exam' ? 600 : 180)
  const [error, setError] = useState<string | null>(null)
  const actionId = mode === 'exam' ? 'write-exam' : 'take-quiz'

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await fetchQuizPrompt({
        actionId,
        placeId,
        bankId,
        version,
      })
      if (cancelled) return
      if (!result.ok) {
        setError(result.error || 'Could not load questions.')
        return
      }
      setQuestions(result.questions)
    })()
    return () => {
      cancelled = true
    }
  }, [actionId, bankId, placeId, version])

  useEffect(() => {
    if (mode !== 'exam' || questions.length === 0) return
    const timer = window.setInterval(() => {
      setSeconds((value) => Math.max(0, value - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [mode, questions.length])

  useEffect(() => {
    if (mode === 'exam' && seconds === 0 && questions.length > 0) {
      onSubmit({
        answers: padAnswers(answers, questions.length),
        questionIds: questions.map((q) => q.id),
      })
    }
  }, [seconds, mode, answers, questions, onSubmit])

  const current = questions[index]
  const mm = Math.floor(seconds / 60)
  const ss = (seconds % 60).toString().padStart(2, '0')

  const dots = useMemo(
    () =>
      questions.map((_, i) => {
        if (i < index) return 'done'
        if (i === index) return 'on'
        return 'idle'
      }),
    [questions, index],
  )

  if (error) {
    return (
      <div className={styles.modal} role="dialog" aria-modal="true">
        <div className={styles.modalCard}>
          <p className={styles.modalTitle}>{mode === 'exam' ? 'CBT' : 'Quiz'}</p>
          <p className={styles.modalMeta}>{error}</p>
          <button type="button" className={styles.btn} onClick={onCancel}>
            Close
          </button>
        </div>
      </div>
    )
  }

  if (!current) {
    return (
      <div className={styles.modal} role="dialog" aria-modal="true">
        <div className={styles.modalCard}>
          <p className={styles.modalTitle}>{mode === 'exam' ? 'Loading CBT…' : 'Loading quiz…'}</p>
        </div>
      </div>
    )
  }

  const advance = (choice: number) => {
    const nextAnswers = [...answers]
    nextAnswers[index] = choice
    setAnswers(nextAnswers)
    setPicked(choice)
    window.setTimeout(() => {
      if (index + 1 >= questions.length) {
        onSubmit({
          answers: padAnswers(nextAnswers, questions.length),
          questionIds: questions.map((q) => q.id),
        })
        return
      }
      setIndex((value) => value + 1)
      setPicked(null)
    }, 180)
  }

  return (
    <div className={styles.modal} role="dialog" aria-modal="true" aria-label={mode === 'exam' ? 'Exam' : 'Quiz'}>
      <div className={styles.modalCard}>
        <p className={styles.modalTitle}>{mode === 'exam' ? 'CBT exam' : 'Quick quiz'}</p>
        <p className={styles.modalMeta}>
          Question {index + 1} of {questions.length}
          {mode === 'exam' ? ` · ${mm}:${ss}` : null}
        </p>
        <div className={styles.progressDots} aria-hidden="true">
          {dots.map((state, i) => (
            <span
              key={questions[i]?.id ?? i}
              className={`${styles.dot} ${state === 'on' ? styles.dotOn : ''} ${state === 'done' ? styles.dotDone : ''}`}
            />
          ))}
        </div>
        <p className={styles.actionTitle}>{current.prompt}</p>
        <div style={{ marginTop: 12 }}>
          {current.choices.map((choice, i) => (
            <button
              key={choice}
              type="button"
              className={`${styles.choice} ${picked === i ? styles.choiceOn : ''}`}
              onClick={() => advance(i)}
            >
              {choice}
            </button>
          ))}
        </div>
        <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={onCancel}>
          Leave
        </button>
      </div>
    </div>
  )
}

function padAnswers(answers: number[], length: number) {
  const next = [...answers]
  while (next.length < length) next.push(-1)
  return next.slice(0, length)
}
