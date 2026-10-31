import { render } from 'preact'
import { App } from './app'
// Before Klunk's own, so a rule in styles.css or print.css can override it.
// Its fonts are bundled with it, which the CSP's `font-src 'self' data:` allows.
import 'katex/dist/katex.min.css'
import './styles.css'
import '../papers/print.css'

const root = document.getElementById('app')
if (!root) throw new Error('#app missing from index.html')

render(<App />, root)
