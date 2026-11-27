import { Link } from 'react-router'

// What a kid's list looks like, so visitors see the idea before signing up.
const SAMPLE = [
  { title: 'Feed the cat', note: 'Every day', points: 5, done: true },
  { title: 'Pack your school bag', note: 'School days', points: 5, done: true },
  { title: 'Practice spelling words', note: 'Due Thursday', points: 20, done: false },
  { title: 'Help set the table', note: 'Waiting for a parent', points: 10, done: false },
]

const QUESTIONS = [
  ['Can my kids give themselves points?',
    'No. Only a parent can approve a task or change a balance, and every change is written to a history your kids can see.'],
  ['What happens if a routine is missed?',
    "Nothing dramatic. At the end of the day it drops off the list, and tomorrow starts fresh. Missed days don't pile up."],
  ['Is there a leaderboard?',
    "Only if you want one. It's off until a parent turns it on, because some families prefer not to compare siblings."],
  ["Who sees our family's data?",
    'Only your family. There are no ads and no tracking, photos have their location removed, and you can export or '
    + "delete everything at any time. It's open source, so you can host it yourself."],
  ['Does it work on a phone?',
    'Yes. It runs in the browser, so it works on phones, tablets and computers without installing anything.'],
]

/** The welcome page for visitors: what the app does, how it works, and a few answers. */
export default function HomePage() {
  return (
    <>
      <section className="intro">
        <div>
          <h1>Chores, routines and rewards for your kids, in one place.</h1>
          <p className="lead-text">
            You set the tasks and decide what they're worth. Your kids tick them off, you approve them,
            and the points go towards rewards you've agreed on together, like extra screen time or
            picking Friday's movie.
          </p>
          <div className="d-flex gap-2 flex-wrap mt-4">
            <Link to="/register" className="btn primary">Create a family account</Link>
            <Link to="/login" className="btn secondary">Sign in</Link>
          </div>
          <p className="small-text text-3 mt-3">Kids don't need an email address. You make their sign-in for them.</p>
        </div>

        <figure className="card-soft intro-sample" aria-label="Example of a kid's task list">
          <div className="d-flex justify-content-between align-items-baseline mb-3">
            <span className="fw-600">Leo's tasks · Tuesday</span>
            <span className="small-text text-2">45 points saved</span>
          </div>
          <ul className="list-plain">
            {SAMPLE.map((item) => (
              <li key={item.title} className="list-row">
                <span className={`sample-check${item.done ? ' is-done' : ''}`} aria-hidden="true" />
                <span className="flex-grow-1">
                  <span className={item.done ? 'sample-done' : undefined}>{item.title}</span>
                  <span className="d-block tiny-text text-3">{item.note}</span>
                </span>
                <span className="small-text text-2">{item.points} pts</span>
              </li>
            ))}
          </ul>
          <figcaption className="tiny-text text-3 mt-3">Next reward: stay up 30 minutes later (60 points).</figcaption>
        </figure>
      </section>

      <section className="section-plain" aria-labelledby="how-title">
        <h2 id="how-title">How it works</h2>
        <ol className="steps">
          <li>
            <strong>Add your kids.</strong> Each kid gets a simple username and password. A second
            parent can join with an invite code.
          </li>
          <li>
            <strong>Set up tasks and routines.</strong> One-off jobs like "clean your room", or routines
            that come back on the days you pick, like brushing teeth every night.
          </li>
          <li>
            <strong>Approve what's done.</strong> When your kid marks something as done, you get to
            check it. Points are only added once you approve.
          </li>
          <li>
            <strong>Let them spend their points.</strong> You fill the reward list and set the prices.
            When they redeem something, you hand it over and mark it as given.
          </li>
        </ol>
      </section>

      <section className="section-plain" aria-labelledby="faq-title">
        <h2 id="faq-title">A few questions</h2>
        <div className="two-col">
          {QUESTIONS.map(([question, answer]) => (
            <div key={question}>
              <h3>{question}</h3>
              <p className="text-2 small-text">{answer}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
