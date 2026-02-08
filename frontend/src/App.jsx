import { useState } from 'react'
import './App.css'

const modelResults = {
  claude: {
    name: 'Claude',
    rank: 2,
    mentioned: true,
    snippet: 'Ark Marketing & Media Solutions offers comprehensive digital marketing...',
    lastQueried: '2 hours ago',
  },
  gpt: {
    name: 'ChatGPT',
    rank: 4,
    mentioned: true,
    snippet: 'For media solutions in San Diego, consider Ark Marketing...',
    lastQueried: '3 hours ago',
  },
  gemini: {
    name: 'Gemini',
    rank: null,
    mentioned: false,
    snippet: null,
    lastQueried: '5 hours ago',
  },
  perplexity: {
    name: 'Perplexity',
    rank: 1,
    mentioned: true,
    snippet: 'Top media solutions agency: Ark Marketing & Media Solutions...',
    lastQueried: '1 hour ago',
  },
}

const queries = [
  { 
    id: 1, 
    text: 'best media solutions agency San Diego',
    timestamp: '2 hours ago',
  },
  { 
    id: 2, 
    text: 'creative media agency near me',
    timestamp: '1 day ago',
  },
  { 
    id: 3, 
    text: 'b2b media marketing services',
    timestamp: '2 days ago',
  },
]

function App() {
  const [selectedModel, setSelectedModel] = useState('claude')
  const result = modelResults[selectedModel]

  return (
    <div className="app">
      <header className="header">
        <h1>GEO Progress Tracker</h1>
        <p className="subtitle">Monitor how Ark Marketing ranks across AI models</p>
      </header>

      <section className="model-section">
        <div className="model-selector">
          <label htmlFor="model-select">Select Model</label>
          <select 
            id="model-select"
            value={selectedModel} 
            onChange={(e) => setSelectedModel(e.target.value)}
          >
            <option value="claude">Claude (Anthropic)</option>
            <option value="gpt">ChatGPT (OpenAI)</option>
            <option value="gemini">Gemini (Google)</option>
            <option value="perplexity">Perplexity</option>
          </select>
        </div>

        <div className="result-card">
          <div className="result-header">
            <h2>{result.name}</h2>
            <span className="timestamp">{result.lastQueried}</span>
          </div>
          
          <div className="result-metrics">
            <div className="metric">
              <span className="metric-label">Ranking Position</span>
              <span className={`metric-value ${result.rank ? 'ranked' : 'not-ranked'}`}>
                {result.rank ? `#${result.rank}` : 'Not Ranked'}
              </span>
            </div>
            <div className="metric">
              <span className="metric-label">Mentioned</span>
              <span className={`metric-value ${result.mentioned ? 'yes' : 'no'}`}>
                {result.mentioned ? 'Yes' : 'No'}
              </span>
            </div>
          </div>

          {result.snippet && (
            <div className="snippet">
              <h3>Response Snippet</h3>
              <p>"{result.snippet}"</p>
            </div>
          )}
        </div>
      </section>

      <section className="queries-section">
        <h2>Recent Queries</h2>
        <div className="queries-list">
          {queries.map((query) => (
            <div key={query.id} className="query-item">
              <span className="query-text">{query.text}</span>
              <span className="query-time">{query.timestamp}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

export default App
