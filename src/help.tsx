/**
 * The page that explains Klunk to the teacher using it.
 *
 * It is a screen in the app rather than a link to documentation, and it has to
 * be: `connect-src 'none'` forbids fetching anything, and `build:single` is one
 * self-contained HTML file dropped on a shared drive with nothing beside it. A
 * link would work for some teachers and silently fail for the rest.
 *
 * Most of what is written here is not a description of buttons. It is the
 * reasons behind the decisions that look like faults from the outside: no
 * syllabus ships, the AI step is copy-and-paste, a missing picture prints a grey
 * box, the browser asks for the folder again. Every one of those has been read
 * as broken by somebody, and none of the reasons were anywhere a teacher could
 * find them.
 *
 * The prose here is governed by `.claude/skills/teacher-material-voice`, which
 * is deliberately terser than the rest of this codebase: the action first, no
 * arguing for an instruction, no reassurance nobody asked for, nothing
 * figurative. A teacher reading this is stuck and wants an answer.
 *
 * The troubleshooting section is the one place on screen where a long answer
 * beats a short one, because each entry has to answer a whole question. It is
 * keyed to the exact words on screen, so it can be scanned for what the teacher
 * is actually looking at rather than for what they would call it.
 */

/**
 * The one address in the app that points off this computer.
 *
 * It is a link and not a request, so `connect-src 'none'` is untouched and the
 * no-network claim still holds: nothing happens until a teacher clicks it. It
 * earns its place because "tell whoever gave you this link" is a dead end for
 * the teacher two schools along whose colleague has left, and a fault nobody can
 * report is a fault nobody fixes.
 */
const ISSUES_URL = 'https://github.com/MrBev02/klunk/issues'

/** Where the reader is in the page. Plain anchors: no script, no dependency. */
const CONTENTS: { id: string; title: string }[] = [
  { id: 'help-shape', title: 'How it works, in four steps' },
  { id: 'help-setup', title: 'Setting up a subject folder' },
  { id: 'help-files', title: 'What Klunk puts in your folder' },
  { id: 'help-questions', title: 'Three ways to get questions in' },
  { id: 'help-papers', title: 'Building and printing a paper' },
  { id: 'help-sharing', title: 'Sharing a folder with colleagues' },
  { id: 'help-trouble', title: 'When something looks wrong' },
  { id: 'help-privacy', title: 'What leaves your computer' },
  { id: 'help-limits', title: 'What Klunk does not do' },
  { id: 'help-report', title: 'Reporting something wrong' },
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
        Klunk builds exam papers out of questions you already have. Everything runs locally. No
        server, nothing uploaded, no account required. Your questions and papers are ordinary files
        in a folder you choose, usually the subject's OneDrive or Teams folder.
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
        <h3 class="setup__head">How it works, in four steps</h3>
        <ol class="help__steps">
          <li>
            <strong>Point Klunk at your subject's folder.</strong> You do this once, and your
            browser remembers it.
          </li>
          <li>
            <strong>Put two things in that folder.</strong> A <em>paper profile</em>, which is the
            exam structure, and a <em>syllabus model</em>, which is the outcomes, topics and content
            points you tag questions against.
          </li>
          <li>
            <strong>Add your questions.</strong> Write them yourself, draft them with your school's
            AI, or read them out of a past paper.
          </li>
          <li>
            <strong>Build a paper</strong> against the profile, check it, then print the student
            paper and the marking guide.
          </li>
        </ol>
        <p class="muted">
          Everything Klunk writes is plain text in your own folder. You can copy it, back it up, or
          send it to a colleague, with or without Klunk.
        </p>
      </section>

      <section id="help-setup" class="help__sec">
        <h3 class="setup__head">Setting up a subject folder</h3>

        <p>
          <strong>Use Chrome or Edge.</strong> They are the only browsers that can open a folder on
          your computer and write to it. Safari and Firefox cannot.
        </p>

        <p>
          <strong>Use one folder per subject.</strong> Swapping to another one takes a single click
          in the header. Most people use a folder on OneDrive or Teams: it is already backed up, and
          colleagues teaching the same course can share it.
        </p>

        <p>
          <strong>A paper profile</strong> is the exam structure: total marks, how many sections,
          what each section is worth, which question types go where, and how long students get. The
          checker compares your paper against it. Klunk comes with the profile for NSW HSC Design
          and Technology. For any other exam, use <strong>Describe your own paper</strong> on the
          Papers tab.
        </p>

        <p>
          <strong>A syllabus model</strong> is the list of outcomes, topics and content points.{' '}
          <strong>Klunk comes with none, because a syllabus is copyright.</strong> Build your own
          from your own copy: open the <strong>Syllabus</strong> tab and choose the syllabus
          document, either from your folder or straight off this computer. It shows you every
          course, topic and content point it found before it writes anything. The same tab lists the
          models you already have, and opens each one to be read.
        </p>

        <p class="muted">
          <strong>Which document to use.</strong> For a NESA syllabus, Klunk reads a Word{' '}
          <code>.docx</code>. That covers the Stage 6 syllabuses, which set their content out in a
          table, and the newer Year 11 and 12 ones, which use headings and bullet points. On{' '}
          <code>curriculum.nsw.edu.au</code> the Download button offers Word and PDF. Choose Word:
          Klunk cannot read a NESA syllabus as a PDF.
        </p>

        <p class="muted">
          For IB Design Technology, use the <strong>subject guide</strong>, the PDF from the
          Programme Resource Centre. Klunk also reads the old-to-new syllabus map, the spreadsheet
          from ManageBac. Where the two disagree, the map is the one that is wrong.
        </p>

        <p class="muted">
          You need a profile before you can build a paper. You do not need a syllabus model to write
          questions or build papers, but without one you cannot tag a question to a topic, and Klunk
          cannot tell you what a paper covers.
        </p>
      </section>

      <section id="help-files" class="help__sec">
        <h3 class="setup__head">What Klunk puts in your folder</h3>
        <dl class="help__files">
          <dt>
            <code>bank/questions.json</code>
          </dt>
          <dd>
            Your questions. One bank can hold as many as you like, and you can have as many banks as
            you like. One per year group, or per topic, or per teacher.
          </dd>

          <dt>
            <code>bank/stimulus/</code>
          </dt>
          <dd>
            Pictures your questions show. They sit next to the bank that uses them, so you can move
            or rename the whole folder and nothing breaks.
          </dd>

          <dt>
            <code>papers/</code>
          </dt>
          <dd>
            A paper: which questions, in what order, in which section. A paper points at questions
            instead of copying them, so fixing a question fixes it everywhere it appears, and last
            year's paper still prints.
          </dd>

          <dt>
            <code>profiles/</code>
          </dt>
          <dd>The exam structures described above.</dd>

          <dt>
            <code>school.json</code>
          </dt>
          <dd>
            Your cover sheet: your school's name, your logo, and the boxes a student fills in. One
            for the whole folder, so every paper you print from it looks the same.
          </dd>

          <dt>
            <code>syllabus/</code>
          </dt>
          <dd>The syllabus models you have built.</dd>

          <dt>
            <code>source/</code>
          </dt>
          <dd>
            Past papers. Klunk puts one here when you choose it from this computer on the From a
            past paper tab, and you can put your own here too. Nothing else in Klunk depends on this
            folder, so you can tidy it whenever you like.
          </dd>
        </dl>

        <p>
          Every question remembers where it came from. For anything read out of a past paper that
          means the year and the question number, so Klunk can warn you before you put a public exam
          question into a school trial.
        </p>

        <p>
          You can move or rename the folder. When a paper goes looking for its questions it tries
          the same file first, then the same filename somewhere else, then the question's own id. If
          it cannot be sure, it tells you instead of guessing.
        </p>
      </section>

      <section id="help-questions" class="help__sec">
        <h3 class="setup__head">Three ways to get questions in</h3>

        <p>
          <strong>Write one.</strong> Go to the Questions tab and click{' '}
          <strong>Write a question</strong>. As you type, the form shows the finished question next
          to the fields, laid out the way a student will see it. Tagging it to a topic is optional,
          but it is what makes filtering and coverage work later.
        </p>

        <p>
          <strong>Bold, italics and tables.</strong> Type <code>**bold**</code>,{' '}
          <code>*italic*</code> and <code>&lt;u&gt;underline&lt;/u&gt;</code> straight into the
          question text. A blank line starts a new paragraph. A table of data goes in as pipe rows,
          and the dashed row under the headings is what makes it a table:
        </p>

        <pre class="help__sample">{`| Time | Temperature (°C) |
| --- | --- |
| 8 am | 18.8 |
| 12 noon | 27.1 |`}</pre>

        <p>
          Write <code>\*</code>, <code>\|</code> or <code>\&lt;</code> for one of those characters
          where you do not mean markup. The same markup works in a part, an option and a marking
          criterion, and the AI prompts ask for it too.
        </p>

        <p>
          <strong>Pictures and passages.</strong> Click <strong>Attach an image</strong> or{' '}
          <strong>Add a text stimulus</strong> in the <strong>Stimulus</strong> panel. An image is
          copied into <code>bank/stimulus/</code> when you save the question. Fill in a description
          for a screen reader, a caption if it needs one, and choose <strong>Left</strong>,{' '}
          <strong>Centre</strong> or <strong>Right</strong> for where it sits across the page. It is{' '}
          <strong>Centre</strong> unless you change it. The millimetre box beside that caps how tall
          it prints. A text stimulus prints as a block quote with a rule down it.
        </p>

        <p>
          Choose the part a picture belongs to under <strong>Belongs to</strong>, which appears once
          a question has parts. A part's picture prints between what that part asks and its answer
          space. Leave it on <strong>The whole question</strong> for anything the question asks as a
          whole. The <strong>From a past paper</strong> tab offers the same choice over every
          picture it keeps, but not the alignment, so a picture read out of a past paper prints
          centred until you open the question and change it.
        </p>

        <p>
          <strong>Draft with AI.</strong> Klunk has no AI key and never contacts an AI service, so
          the tab works in three steps instead. You choose the topics and content points. Klunk
          writes a prompt with the topic ids, what a mark is worth in this subject, and where that
          question type sits on the real paper already filled in. You copy it into whatever your
          school pays for, then paste the reply back. Klunk repairs what it safely can, tells you
          what it repaired, and refuses anything it cannot trust. Read the whole prompt before you
          copy it: nothing else is sent. Everything that comes back is tagged{' '}
          <code>ai-drafted</code>.
        </p>

        <p>
          <strong>Read a past paper.</strong> Open the <strong>From a past paper</strong> tab and
          choose the exam PDF, either from your folder or straight off this computer, along with the
          marking guide if you have it. A paper you choose from this computer is copied into{' '}
          <code>source/</code> in your folder, so it is there the next time you want it. It reads
          out the questions and their marks, takes the outcome codes from the marking guide's
          mapping grid, and offers you any pictures it can cut out. Nothing is written until you
          have looked at every question, and anything with a problem goes to the editor instead of
          into a bank.
        </p>

        <p class="muted">
          Klunk reads two shapes of paper: a NSW HSC examination, tested on the papers from 2015
          onwards, and a paper of numbered multiple-choice questions. It reads two shapes of marking
          guide to go with them: a NSW HSC marking guide, and a markscheme listing each question
          number against its answer. It says which it read, and says so plainly when a document is
          neither.
        </p>

        <p>
          <strong>A paper Klunk cannot read.</strong> A scan or a photograph has no text in it, and
          a school's own paper may be a shape Klunk does not know. Either way it offers you a prompt
          to transcribe the paper with an AI, and a second one for the marking guide once the
          questions are on screen. You attach the file yourself, so all of it leaves your computer:
          the guide prompt lists only the question numbers and marks. Questions that come back this
          way are tagged <code>ai-transcribed</code>, and any question whose answers or criteria
          came from an AI reading of a guide is tagged <code>ai-marked</code>. Check every answer
          against the guide before you save.
        </p>
      </section>

      <section id="help-papers" class="help__sec">
        <h3 class="setup__head">Building and printing a paper</h3>

        <p>
          Open the Papers tab and start a paper against a profile, then add questions from your
          library. The rail down the side shows which section you are adding to and what that
          section still needs.
        </p>

        <p>
          The <strong>Checks</strong> panel updates as you build. It compares your paper against the
          profile: marks, section totals and question types. It also warns you about the things you
          would want to catch anyway. A question from a public paper your students may have seen. A
          question that is already on a paper they have sat. A question belonging to another
          subject. A question tagged to nothing.
        </p>

        <p>
          <strong>Student paper</strong> and <strong>Marking guide</strong> show you the real thing,
          on A4. From either one, <strong>Print / Save as PDF</strong> opens your browser's print
          dialog. Choose "Save as PDF" there if you want a file. Only the paper prints.
        </p>

        <p>
          <strong>Save changes</strong> writes the paper into <code>papers/</code>. Klunk tells you
          when a paper has changes you have not saved, and asks first before anything throws them
          away.
        </p>

        <p>
          Click the <strong>✕</strong> at the right of a row in{' '}
          <strong>Papers in this folder</strong> to delete that paper. Klunk names the file and asks
          first, and the questions stay in your banks.
        </p>

        <h3 class="setup__head">The cover sheet</h3>

        <p>
          Every paper prints a full front page: your school's logo, the title, the subject, reading
          and working time, the general instructions, what each section is worth, and somewhere for
          a student to write who they are. Section I starts overleaf.
        </p>

        <p>
          Set it up once. On the Papers tab click <strong>Set up your cover sheet</strong> and fill
          in your school's name, choose your logo, and add what a student fills in, such as a name,
          a class and a teacher. Klunk copies the logo into your folder and saves the rest as{' '}
          <code>school.json</code>, so every paper in the folder gets the same front page. If your
          school number goes on every sheet rather than only the first, tick{' '}
          <strong>Print this at the top of every page</strong>.
        </p>

        <p>
          The things that change paper by paper are on the paper itself, under{' '}
          <strong>Cover</strong>: the subject, the year group and the date. Klunk fills in the first
          two when you create the paper, from the syllabus your profile names, so usually you only
          add the date.
        </p>

        <p>
          Reading and working time come from your profile and print on their own, so you do not need
          a line for them in the instructions. If one kind of paper needs a different set of boxes,
          such as a trial that prints a student number grid where your other exams print a name, set
          that on the profile rather than on the folder.
        </p>

        <p class="muted">
          If a picture prints as a grey box with a filename in it, that image is missing from your
          folder. Klunk prints the box on purpose, so a missing picture shows up on the proof.
        </p>
      </section>

      <section id="help-sharing" class="help__sec">
        <h3 class="setup__head">Sharing a folder with colleagues</h3>
        <p>
          A folder on OneDrive or Teams works the way you would expect. Everyone who has the folder
          has the questions, and each person opens it in their own browser. Two things are worth
          knowing.
        </p>
        <p>
          Klunk writes whole files. If two people save into the same bank at the same moment, the
          second save can wipe out the first. Work in separate banks, such as{' '}
          <code>bank/year11.json</code> and <code>bank/trials.json</code>, and it cannot happen.
        </p>
        <p>
          <strong>Reload</strong> in the header re-reads the folder. Klunk reads it when you open
          it, not all the time, so click Reload when you know somebody else has been working in it.
        </p>
      </section>

      <section id="help-trouble" class="help__sec">
        <h3 class="setup__head">When something looks wrong</h3>
        <dl class="help__trouble">
          <dt>"Klunk needs Chrome or Edge"</dt>
          <dd>
            Open the same link in Chrome or Edge. Your content is ordinary files in your own folder,
            so the other browser reads exactly the same ones.
          </dd>

          <dt>"Welcome back", and it asks you to confirm access again</dt>
          <dd>
            Your browser is asking you to confirm access to your folder again, which it does from
            time to time. Click the folder you want, then confirm once when the browser asks. It is
            one click per folder, once a session.
          </dd>

          <dt>The date, the page title and a web address print on every page</dt>
          <dd>
            That is your browser, not the paper. In the print dialog open{' '}
            <strong>More settings</strong> and untick <strong>Headers and footers</strong>. Your
            browser remembers it, so you only do it once.
          </dd>

          <dt>The student number box prints on top of the questions</dt>
          <dd>
            Check the print dialog is set to A4 and that <strong>Margins</strong> is on{' '}
            <strong>Default</strong> rather than <strong>None</strong>. Klunk asks for a deeper top
            margin on any paper that repeats something on every page, and setting margins to None
            throws that away.
          </dd>

          <dt>Everything prints too small, inside a wide white border</dt>
          <dd>
            Open <strong>More settings</strong> in the print dialog and set <strong>Scale</strong>{' '}
            back to 100%. <strong>Fit to printable area</strong> shrinks the whole paper, including
            the ruled lines and the drawing space.
          </dd>

          <dt>"… is no longer on this computer"</dt>
          <dd>
            That folder has been renamed, moved or deleted since Klunk last opened it. Click{' '}
            <strong>Forget</strong> to stop offering it.
          </dd>

          <dt>"Klunk could not read any questions in this document"</dt>
          <dd>
            Klunk reads a NSW HSC examination and a paper of numbered multiple-choice questions, and
            this document is neither. Check you chose the paper rather than the marking guide. If
            the paper really is a different shape, write the questions on the Questions tab or draft
            them on the Draft with AI tab.
          </dd>

          <dt>Every question came back with the wrong answer marked</dt>
          <dd>
            Klunk could not read your marking guide, and says so under{' '}
            <strong>About the paper as a whole</strong>. Without it there is no answer key, so the
            first option is marked correct on every question. Set them in the editor, or check you
            chose the marking guide rather than another file.
          </dd>

          <dt>The topic list is empty, or you cannot tag a question</dt>
          <dd>
            This folder has no syllabus model in it. Build one from your syllabus <code>.docx</code>{' '}
            on the <strong>Syllabus</strong> tab.
          </dd>

          <dt>"No profile in this folder yet"</dt>
          <dd>
            A paper needs an exam structure to be built against. Add the stock profile if it matches
            your subject, or describe your own on the Papers tab.
          </dd>

          <dt>"… files could not be read"</dt>
          <dd>
            A file in your folder is not what its name suggests, or it has been damaged. Klunk names
            the file and carries on with the rest, so one bad file does not hide the other forty.
          </dd>

          <dt>A question is missing, or a count looks wrong</dt>
          <dd>
            Click <strong>Reload</strong>. If it is still missing, check the folder name in the
            header. Being in last term's folder looks exactly like this.
          </dd>

          <dt>A button seems to do nothing at all</dt>
          <dd>
            Check the folder first, because that is nearly always the cause. Click{' '}
            <strong>Reload</strong>, and if the browser asks for access again, say yes. If you work
            on more than one computer, check you are on the one whose browser has the folder.
          </dd>

          <dt>A picture prints as a grey box</dt>
          <dd>
            The image file it names is not in your folder. It was moved, renamed, or never copied
            in. Put it back and print the proof again.
          </dd>
        </dl>
      </section>

      <section id="help-privacy" class="help__sec">
        <h3 class="setup__head">What leaves your computer</h3>
        <p>
          <strong>Nothing, unless you copy it out yourself.</strong> Klunk makes no network requests
          once the page has loaded, and the page's own security policy blocks them, so it cannot
          make one by accident. No account, no server, no database.
        </p>
        <p>
          Klunk never contacts an AI service. That is why the AI step is copy and paste. The only
          text that leaves is text you have read on screen and chosen to send, to whichever service
          your school pays for.
        </p>
        <p class="muted">
          Your folder stays where it is. If it lives on OneDrive it syncs the way it always has. The
          one address in Klunk that points anywhere else is the link for reporting a fault at the
          end of this page, and it does nothing until you click it.
        </p>
      </section>

      <section id="help-limits" class="help__sec">
        <h3 class="setup__head">What Klunk does not do</h3>
        <ul>
          <li>
            <strong>No Word export.</strong> Papers print to PDF. Merging them into a school's own{' '}
            <code>.docx</code> template is not built yet.
          </li>
          <li>
            <strong>Two editions of one syllabus in the same folder</strong> is not handled well
            yet. This comes up when a new syllabus starts while the old one finishes.
          </li>
          <li>
            <strong>No past papers for a brand new course.</strong> If a syllabus has just changed
            there is nothing to read questions out of, so you write or draft them instead.
          </li>
        </ul>
      </section>

      <section id="help-report" class="help__sec">
        <h3 class="setup__head">Reporting something wrong</h3>
        <p>
          Tell whoever gave you this link first. Say what you were looking at, what you did, and
          what you expected to happen instead.
        </p>
        <p>
          If there is nobody to ask, or it looks like a fault in Klunk rather than something you can
          fix, report it at{' '}
          <a href={ISSUES_URL} target="_blank" rel="noreferrer">
            github.com/MrBev02/klunk/issues
          </a>
          . That is where faults in Klunk are tracked and fixed.
        </p>
        <p class="muted">
          That link is the one thing on this page that leaves Klunk, and it opens in a new tab.
          Everything posted there is public and stays public, so write what happened in your own
          words and keep your questions and papers out of it.
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
