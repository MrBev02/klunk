/**
 * The page that explains Klunk to the teacher using it.
 *
 * It is a screen in the app rather than a link to documentation, and it has to
 * be: `connect-src 'none'` forbids fetching anything, and `build:single` is one
 * self-contained HTML file dropped on a shared drive with nothing beside it. A
 * link would work for some teachers and silently fail for the rest.
 *
 * Most of what is written here is not a description of buttons. It is the
 * reasons behind the decisions that look like faults from the outside — no
 * syllabus ships, the AI step is copy-and-paste, a missing picture prints a grey
 * box, the browser asks for the folder again. Every one of those has been read
 * as broken by somebody, and none of the reasons were anywhere a teacher could
 * find them.
 *
 * The troubleshooting section is keyed to the exact words on screen, so it can
 * be scanned for what the teacher is actually looking at rather than for what
 * they would call it.
 */

/** Where the reader is in the page. Plain anchors: no script, no dependency. */
const CONTENTS: { id: string; title: string }[] = [
  { id: 'help-shape', title: 'The shape of the work' },
  { id: 'help-setup', title: 'Setting up a subject folder' },
  { id: 'help-files', title: 'What Klunk puts in your folder' },
  { id: 'help-questions', title: 'Three ways to get questions in' },
  { id: 'help-papers', title: 'Building and printing a paper' },
  { id: 'help-sharing', title: 'Sharing a folder with colleagues' },
  { id: 'help-trouble', title: 'When something looks wrong' },
  { id: 'help-privacy', title: 'What leaves your computer' },
  { id: 'help-limits', title: 'What Klunk does not do' },
]

export function Help({ onClose }: { onClose: () => void }) {
  return (
    <section class="help">
      <div class="help__top">
        <h2 class="help__title">How Klunk works</h2>
        <button class="btn" onClick={onClose}>
          Back to Klunk
        </button>
      </div>

      <p class="help__lede">
        Klunk turns the questions you already have into examination papers. It runs entirely
        in this browser tab — no account, no server, nothing uploaded — and your questions
        and papers are ordinary files in a folder you choose, normally the subject's
        OneDrive or Teams folder. Klunk reads and writes them in place.
      </p>

      <nav class="help__contents" aria-label="On this page">
        <ol>
          {CONTENTS.map((entry) => (
            <li key={entry.id}>
              <a href={`#${entry.id}`}>{entry.title}</a>
            </li>
          ))}
        </ol>
      </nav>

      <section id="help-shape" class="help__sec">
        <h3 class="setup__head">The shape of the work</h3>
        <ol class="help__steps">
          <li>
            <strong>Point Klunk at your subject's folder.</strong> Once per subject, and the
            browser remembers it.
          </li>
          <li>
            <strong>Give that folder two things:</strong> a <em>paper profile</em>, which is
            the shape of the real examination, and a <em>syllabus model</em>, which is the
            outcomes, topics and content points your questions are tagged against.
          </li>
          <li>
            <strong>Fill it with questions</strong> — write them, draft them with your
            school's AI, or read them out of a past paper.
          </li>
          <li>
            <strong>Build a paper</strong> against the profile, check it, and print the
            student paper and the marking guide.
          </li>
        </ol>
        <p class="muted">
          Nothing is ever locked away. Every file Klunk writes is plain text in your own
          folder, which you can copy, back up, or hand to a colleague, with or without
          Klunk.
        </p>
      </section>

      <section id="help-setup" class="help__sec">
        <h3 class="setup__head">Setting up a subject folder</h3>

        <p>
          <strong>Chrome or Edge.</strong> They are the only browsers that can open a folder
          on your computer and write into it. Safari and Firefox cannot, and Klunk says so
          plainly rather than half-working.
        </p>

        <p>
          <strong>One folder per subject.</strong> That way the permission you give covers
          only the subject you are working on, and switching between subjects later is one
          click in the header. A folder on OneDrive or Teams is the usual choice: it is
          backed up already, and colleagues teaching the same course can share it.
        </p>

        <p>
          <strong>A paper profile</strong> is the shape of the real examination: total
          marks, how many sections, what each is worth, which question types belong where,
          how long students get. It is what the checker checks a paper against. Klunk
          supplies the NSW HSC Design and Technology profile; for any other examination,{' '}
          <strong>Describe your own paper</strong> on the Papers tab is a form to fill in,
          not a file to hand-edit. That is an afternoon, once, for a whole faculty.
        </p>

        <p>
          <strong>A syllabus model</strong> is the list of outcomes, topics and content
          points. <strong>Klunk ships none, deliberately.</strong> A syllabus is copyright:
          copying a reasonable portion for your own teaching is fine, and publishing the
          whole content inventory of one, restructured, is not — under anyone's reading. So
          you build your own from your own copy. Save the syllabus <code>.docx</code> into
          the folder and read it on the <strong>From a syllabus</strong> tab; it shows you
          every course, topic and content point it found before anything is written.
        </p>

        <p class="muted">
          Without a profile you cannot build a paper. Without a syllabus model you still can
          — you just cannot tag a question to a topic, and Klunk cannot work out what a
          paper covers.
        </p>
      </section>

      <section id="help-files" class="help__sec">
        <h3 class="setup__head">What Klunk puts in your folder</h3>
        <dl class="help__files">
          <dt>
            <code>bank/questions.json</code>
          </dt>
          <dd>
            Your questions. One bank can hold as many as you like, and you can have as many
            banks as you like — one per year group, or per topic, or per teacher.
          </dd>

          <dt>
            <code>bank/stimulus/</code>
          </dt>
          <dd>
            Pictures a question shows. Kept beside the bank that refers to them, so moving
            or renaming the whole folder breaks nothing.
          </dd>

          <dt>
            <code>papers/</code>
          </dt>
          <dd>
            A paper: which questions, in what order, in which section.{' '}
            <strong>By reference, not by copy.</strong> Correcting a question corrects it
            everywhere it appears, and a paper from last year still prints.
          </dd>

          <dt>
            <code>profiles/</code>
          </dt>
          <dd>The examination shapes described above.</dd>

          <dt>
            <code>syllabus/</code>
          </dt>
          <dd>The syllabus models you have built.</dd>
        </dl>

        <p>
          Two things worth knowing about those files. A question{' '}
          <strong>remembers where it came from</strong> — the year and question number, for
          anything read out of a past paper — which is what lets Klunk warn you before you
          put a public examination question into a school trial. And the folder{' '}
          <strong>can be moved or renamed</strong>: a paper finds its questions again by the
          same file, then the same filename elsewhere, then the question's own id, and tells
          you when it cannot be certain instead of guessing.
        </p>
      </section>

      <section id="help-questions" class="help__sec">
        <h3 class="setup__head">Three ways to get questions in</h3>

        <p>
          <strong>Write one.</strong> Questions tab → <strong>Write a question</strong>. The
          form shows the whole question, laid out as a student would see it, beside the
          fields as you type. Tagging it to a topic is optional, but it is what makes
          filtering and coverage work later.
        </p>

        <p>
          <strong>Draft with AI.</strong> Klunk holds no AI key and contacts no AI service.
          The tab does three steps instead: you choose the topics and content points, Klunk
          writes the prompt — with the exact topic ids, what a mark is worth in this
          subject, and where that question type sits on the real paper already filled in —
          and you copy it into whatever your school licenses. Paste the reply back and Klunk
          reads it, repairs what it safely can and says what it repaired, and refuses what
          it cannot trust. <strong>The whole prompt is on screen before you copy it</strong>
          , which is what makes "you decide what leaves your machine" true rather than a
          promise. Everything that comes back is tagged <code>ai-drafted</code>.
        </p>

        <p>
          <strong>Read a past paper.</strong> Put the examination PDF, and the marking guide
          if you have it, into the folder. The <strong>From a past paper</strong> tab lists
          what it found there, reads the questions out with their marks, takes the outcome
          codes from the marking guide's mapping grid, and offers any pictures it can cut
          out. Nothing is written until you have seen every question, and one with a problem
          goes to the editor rather than into a bank. Built and tested against NSW HSC
          papers from 2015 onwards.
        </p>
      </section>

      <section id="help-papers" class="help__sec">
        <h3 class="setup__head">Building and printing a paper</h3>

        <p>
          On the Papers tab, start a paper against a profile and add questions from your
          library. The rail down the side says which section you are adding to and what that
          section still needs.
        </p>

        <p>
          The <strong>Checks</strong> panel is live. It compares what you have built against
          the profile — marks, section totals, question types — and it also warns about the
          things a teacher means to catch: a question from a public paper students may have
          seen, a question already on a paper they have sat, a question belonging to another
          subject, a question tagged to nothing.
        </p>

        <p>
          <strong>Student paper</strong> and <strong>Marking guide</strong> are previews of
          the real thing, on A4. From either, <strong>Print / Save as PDF</strong> hands it
          to your browser's print dialog; choose "Save as PDF" there for a file. Only the
          paper prints — none of Klunk's own screen goes with it.
        </p>

        <p>
          <strong>Save changes</strong> writes the paper into <code>papers/</code>. Klunk
          says when a paper has changes you have not saved, and everything that would throw
          them away asks first.
        </p>

        <p class="muted">
          A picture that prints as a grey box naming a file is not a glitch to ignore: that
          image is missing from the folder. It prints that way on purpose, so it is caught
          on the proof rather than in the examination room.
        </p>
      </section>

      <section id="help-sharing" class="help__sec">
        <h3 class="setup__head">Sharing a folder with colleagues</h3>
        <p>
          A folder on OneDrive or Teams behaves exactly as you would expect: everyone who
          has the folder has the questions, and each of them opens it in their own browser.
          Two things are worth knowing.
        </p>
        <p>
          Klunk writes whole files. If two people save into the same bank at the same
          moment, the later save can flatten the earlier one. Working in different banks —{' '}
          <code>bank/year11.json</code>, <code>bank/trials.json</code> — removes the problem
          rather than managing it.
        </p>
        <p>
          <strong>Reload</strong> in the header re-reads the folder. Klunk reads it when you
          open it, not continuously, so click Reload when you know somebody else has been
          working in it.
        </p>
      </section>

      <section id="help-trouble" class="help__sec">
        <h3 class="setup__head">When something looks wrong</h3>
        <dl class="help__trouble">
          <dt>"Klunk needs Chrome or Edge"</dt>
          <dd>
            Open the same link in Chrome or Edge. Nothing is lost by switching: your content
            is ordinary files in your own folder, so the other browser reads exactly the
            same ones.
          </dd>

          <dt>"Welcome back … confirm access again"</dt>
          <dd>
            Your browser has let the folder permission lapse, which it does from time to
            time. Nothing has been forgotten and you do not need the file dialog: click the
            folder, and confirm once when the browser asks. One click each, and only once
            that session.
          </dd>

          <dt>"… is no longer on this computer"</dt>
          <dd>
            That folder has been renamed, moved or deleted since Klunk last opened it.{' '}
            <strong>Forget</strong> it — that only stops it being offered here, and deletes
            nothing.
          </dd>

          <dt>The topic list is empty, or a question cannot be tagged</dt>
          <dd>
            This folder has no syllabus model in it. Build one on the{' '}
            <strong>From a syllabus</strong> tab from the syllabus <code>.docx</code>.
          </dd>

          <dt>"No profile in this folder yet"</dt>
          <dd>
            A paper needs an examination shape to be built against. Add the stock profile if
            it is your subject, or describe your own on the Papers tab.
          </dd>

          <dt>"… files could not be read"</dt>
          <dd>
            A file in the folder is not what its name suggests, or has been damaged. Klunk
            names it and carries on with the rest, because one bad file must not hide the
            other forty.
          </dd>

          <dt>A question is missing, or a count looks wrong</dt>
          <dd>
            Click <strong>Reload</strong>. If it is still missing, check the folder name in
            the header — being in last term's folder looks exactly like this.
          </dd>

          <dt>A button seems to do nothing at all</dt>
          <dd>
            Nearly always the folder rather than the button: a permission that has lapsed,
            or the same folder open somewhere else. Click <strong>Reload</strong>, and if
            the browser asks for the folder again, let it. If you are working on more than
            one computer, check you are on the one whose browser holds the folder.
          </dd>

          <dt>A picture prints as a grey box</dt>
          <dd>
            The image file it names is not in the folder — it was moved, renamed, or never
            copied in. Deliberate: an examination with a missing figure should fail loudly
            on the proof.
          </dd>
        </dl>
      </section>

      <section id="help-privacy" class="help__sec">
        <h3 class="setup__head">What leaves your computer</h3>
        <p>
          <strong>Nothing, unless you copy it out yourself.</strong> Klunk makes no network
          requests at all once the page has loaded. That is enforced by the page's own
          security policy rather than promised, so it holds whether or not you take our word
          for it. There is no account, no server and no database.
        </p>
        <p>
          No AI service is contacted from inside Klunk, which is why the AI step is
          copy-and-paste: the only text that ever leaves is text you have read on screen and
          chosen to send, to whichever service your school licenses.
        </p>
        <p class="muted">
          Your folder stays where it is. If it lives on OneDrive it syncs the way it always
          has — that is Microsoft doing what you already asked it to, not Klunk.
        </p>
      </section>

      <section id="help-limits" class="help__sec">
        <h3 class="setup__head">What Klunk does not do</h3>
        <ul>
          <li>
            <strong>No Word export.</strong> Papers print to PDF. Merging into a school's
            own <code>.docx</code> template is possible and deliberately not built until
            teachers say they want it.
          </li>
          <li>
            <strong>Two editions of one syllabus in one folder</strong> — a new syllabus
            starting while the old one finishes — is not handled as well as it will need to
            be.
          </li>
          <li>
            <strong>No past papers for a brand new course.</strong> Where a syllabus has
            just changed there is nothing to read questions out of, so they have to be
            written or drafted.
          </li>
        </ul>
      </section>

      <section class="help__sec">
        <h3 class="setup__head">Something wrong, or missing</h3>
        <p>
          Tell whoever gave you this link. It helps enormously to say what you were looking
          at, what you did, and what you expected instead — Klunk is small enough that most
          faults are fixed the same week they are reported.
        </p>
        <div class="rowbtns">
          <button class="btn btn--primary" onClick={onClose}>
            Back to Klunk
          </button>
        </div>
      </section>
    </section>
  )
}
