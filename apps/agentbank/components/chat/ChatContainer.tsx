'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { useAgentChat } from '@/hooks/useAgentChat';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { AgentThinkingIndicator } from '../agents/AgentThinkingIndicator';
import { AgentBadge } from '../agents/AgentBadge';
import { agents } from '@/lib/agents';
import { RotateCcw, AlertTriangle, Square, X, Loader2 } from 'lucide-react';

export function ChatContainer() {
  const {
    messages,
    currentAgent,
    isThinking,
    isHandingOff,
    handoffTarget,
    isSlowResponse,
    sendMessage,
    triggerFraudAlert,
    resetChat,
    stopGeneration,
  } = useAgentChat();

  const [showDebugPanel, setShowDebugPanel] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  // Keyboard shortcut for debug panel (Ctrl+Shift+D)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        setShowDebugPanel((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Chat Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <AgentBadge agentId={currentAgent} size="lg" showRole isActive />
            <div className="h-8 w-px bg-gray-200" />
            <div>
              <p className="text-sm text-gray-500">Current Agent</p>
              <p className="text-sm font-medium text-gray-900">
                {agents[currentAgent].description}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Stop Generating Button - P0 */}
            {isThinking && (
              <button
                onClick={stopGeneration}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                aria-label="Stop generating response"
              >
                <Square className="w-4 h-4 fill-current" />
                Stop
              </button>
            )}
          </div>
        </div>

        {/* Agent Roster Mini */}
        <div className="flex items-center gap-4 mt-4">
          <span className="text-xs text-gray-500">Available agents:</span>
          <div className="flex items-center gap-2">
            {Object.values(agents).map((agent) => (
              <div
                key={agent.id}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all ${
                  agent.id === currentAgent
                    ? `${agent.bgColor} ring-2 ring-offset-1 ring-indigo-500`
                    : `${agent.bgColor} opacity-50 hover:opacity-100`
                }`}
                title={`${agent.name} - ${agent.role}`}
              >
                {agent.avatar}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Messages Area with aria-live for screen readers - P1 */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-6 space-y-4"
        aria-live="polite"
        aria-atomic="false"
      >
        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} />
        ))}
        
        {/* Handoff Indicator - P1 */}
        {isHandingOff && handoffTarget && (
          <div className="flex items-center gap-3 p-4 bg-indigo-50 rounded-lg border border-indigo-100 animate-pulse">
            <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
            <span className="text-sm font-medium text-indigo-700">
              Connecting to {agents[handoffTarget].name}...
            </span>
          </div>
        )}

        {isThinking && !isHandingOff && (
          <div className="space-y-2">
            <AgentThinkingIndicator agentId={currentAgent} />
            {/* Slow Response Indicator - P1 */}
            {isSlowResponse && (
              <p className="text-sm text-amber-600 ml-12">
                Taking longer than expected...
              </p>
            )}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Suggestions */}
      <div className="bg-white border-t px-6 py-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          <span className="text-xs text-gray-500 flex-shrink-0">Try:</span>
          {[
            'Send $100 to Sarah',
            'Show my spending',
            'Check for fraud',
            'How can I save more?',
          ].map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => sendMessage(suggestion)}
              className="flex-shrink-0 px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-indigo-100 hover:text-indigo-700 transition-colors"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>

      {/* Chat Input */}
      <ChatInput onSend={sendMessage} disabled={isThinking || isHandingOff} />

      {/* Debug Panel - P0: Slides in from right on Ctrl+Shift+D */}
      <div
        className={`fixed top-0 right-0 h-full w-72 bg-white shadow-2xl border-l transform transition-transform duration-300 ease-in-out z-50 ${
          showDebugPanel ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Debug Controls</h3>
          <button
            onClick={() => setShowDebugPanel(false)}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
            aria-label="Close debug panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs text-gray-500">Press Ctrl+Shift+D to toggle</p>
          <button
            onClick={() => {
              triggerFraudAlert();
              setShowDebugPanel(false);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
          >
            <AlertTriangle className="w-4 h-4" />
            Trigger Fraud Alert
          </button>
          <button
            onClick={() => {
              resetChat();
              setShowDebugPanel(false);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reset Chat
          </button>
          <div className="pt-4 border-t">
            <p className="text-xs text-gray-500 mb-2">Current State:</p>
            <div className="text-xs font-mono bg-gray-50 p-2 rounded space-y-1">
              <p>Agent: {currentAgent}</p>
              <p>Thinking: {isThinking ? 'Yes' : 'No'}</p>
              <p>Handoff: {isHandingOff ? 'Yes' : 'No'}</p>
              <p>Messages: {messages.length}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
