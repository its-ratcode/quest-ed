import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'bootstrap/dist/css/bootstrap.min.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/components/brand.css'
import './styles/components/buttons.css'
import './styles/components/forms.css'
import './styles/components/cards.css'
import './styles/components/alerts.css'
import './styles/components/tabs.css'
import './styles/components/text.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
