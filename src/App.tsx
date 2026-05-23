import { useState } from 'react'
import { Terminal, Settings, GitBranch, MessageSquare } from 'lucide-react'

function App() {
  const [activeTab, setActiveTab] = useState('chat')

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100 font-sans">
      {/* Sidebar */}
      <aside className="w-16 flex flex-col items-center py-4 bg-gray-950 border-r border-gray-800">
        <button 
          onClick={() => setActiveTab('chat')}
          className={`p-3 mb-2 rounded-lg transition-colors ${activeTab === 'chat' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}
        >
          <MessageSquare size={24} />
        </button>
        <button 
          onClick={() => setActiveTab('terminal')}
          className={`p-3 mb-2 rounded-lg transition-colors ${activeTab === 'terminal' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}
        >
          <Terminal size={24} />
        </button>
        <button 
          onClick={() => setActiveTab('git')}
          className={`p-3 mb-2 rounded-lg transition-colors ${activeTab === 'git' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}
        >
          <GitBranch size={24} />
        </button>
        <div className="mt-auto">
          <button 
            onClick={() => setActiveTab('settings')}
            className={`p-3 rounded-lg transition-colors ${activeTab === 'settings' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}
          >
            <Settings size={24} />
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        <header className="h-12 border-b border-gray-800 flex items-center px-4 bg-gray-900">
          <h1 className="text-lg font-semibold tracking-tight">Aider Vision</h1>
        </header>
        
        <div className="flex-1 p-6 overflow-auto">
          {activeTab === 'chat' && (
            <div className="max-w-3xl mx-auto space-y-4">
              <div className="bg-gray-800 p-4 rounded-lg shadow-sm">
                <p className="text-gray-300">Welcome to Aider Vision. Start a conversation to begin coding.</p>
              </div>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="Ask Aider to modify your code..." 
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors">
                  Send
                </button>
              </div>
            </div>
          )}
          {activeTab === 'terminal' && (
            <div className="bg-gray-950 p-4 rounded-lg font-mono text-sm h-full flex items-center justify-center text-gray-500">
              Terminal Output Placeholder
            </div>
          )}
          {activeTab === 'git' && (
            <div className="bg-gray-950 p-4 rounded-lg h-full flex items-center justify-center text-gray-500">
              Git History & Diff Viewer Placeholder
            </div>
          )}
          {activeTab === 'settings' && (
            <div className="max-w-xl mx-auto space-y-4">
              <h2 className="text-xl font-bold">Settings</h2>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-400">Aider Binary Path</label>
                <input type="text" className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2" defaultValue="/usr/local/bin/aider" />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-400">Default LLM Model</label>
                <select className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2">
                  <option>gpt-4o</option>
                  <option>claude-3-opus</option>
                  <option>llama-3-70b</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default App
