import { render } from 'preact'
import { App } from './app'
import './styles.css'
import './print.css'

const root = document.getElementById('app')
if (!root) throw new Error('#app missing from index.html')

render(<App />, root)
