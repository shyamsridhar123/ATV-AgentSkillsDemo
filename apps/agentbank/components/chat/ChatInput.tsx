'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Mic, Paperclip } from 'lucide-react';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [message, setMessage] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    if (message.trim() && !disabled) {
      onSend(message.trim());
      setMessage('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  useEffect(() => {
    if (!disabled && inputRef.current) {
      inputRef.current.focus();
    }
  }, [disabled]);

  return (
    <div className="bg-white border-t px-4 py-4">
      <div className="flex items-end gap-3">
        {/* Attachment Button */}
        <button
          className="p-2.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          title="Attach file"
          aria-label="Attach file"
        >
          <Paperclip className="w-5 h-5" />
        </button>

        {/* Input Area */}
        <div className="flex-1 relative">
          <textarea
            ref={inputRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={disabled ? 'Agent is responding...' : 'Ask your AI agents anything...'}
            disabled={disabled}
            rows={1}
            className="w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none disabled:bg-gray-50 disabled:text-gray-400"
            style={{ minHeight: '48px', maxHeight: '120px' }}
          />
        </div>

        {/* Voice Button */}
        <button
          className="p-2.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          title="Voice input"
        >
          <Mic className="w-5 h-5" />
        </button>

        {/* Send Button */}
        <button
          onClick={handleSubmit}
          disabled={!message.trim() || disabled}
          className="p-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
          aria-label="Send message"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>

      <p className="text-xs text-gray-400 text-center mt-2">
        AI agents may make mistakes. Review important information before acting.
      </p>
    </div>
  );
}
