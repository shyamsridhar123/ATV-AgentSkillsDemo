'use client';

import { useState, useCallback, useRef } from 'react';
import type { ChatMessage, ChatState, AgentId, ChatCard } from '@/lib/types';
import { routeToAgent, getHandoffMessage } from '@/lib/agent-router';
import { getMockAgentResponse, getAgentGreeting } from '@/lib/agents';

const THINKING_DELAY = 1500;
const HANDOFF_DELAY = 1000;
const SLOW_RESPONSE_THRESHOLD = 5000;

function generateId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function useAgentChat() {
  const [state, setState] = useState<ChatState>({
    messages: [
      {
        id: generateId(),
        type: 'agent',
        content: getAgentGreeting('atlas'),
        agentId: 'atlas',
        timestamp: new Date(),
      },
    ],
    currentAgent: 'atlas',
    isThinking: false,
    isHandingOff: false,
    handoffTarget: undefined,
    error: undefined,
    isSlowResponse: false,
  });

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const slowTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const handoffTimeoutRefs = useRef<NodeJS.Timeout[]>([]);

  const addMessage = useCallback((
    type: ChatMessage['type'],
    content: string,
    options?: {
      agentId?: AgentId;
      card?: ChatCard;
      handoffFrom?: AgentId;
      handoffTo?: AgentId;
    }
  ) => {
    const newMessage: ChatMessage = {
      id: generateId(),
      type,
      content,
      timestamp: new Date(),
      ...options,
    };

    setState((prev) => ({
      ...prev,
      messages: [...prev.messages, newMessage],
    }));

    return newMessage;
  }, []);

  const setThinking = useCallback((isThinking: boolean, agentId?: AgentId) => {
    setState((prev) => ({
      ...prev,
      isThinking,
      currentAgent: agentId ?? prev.currentAgent,
    }));
  }, []);

  const setHandingOff = useCallback((isHandingOff: boolean, targetAgent?: AgentId) => {
    setState((prev) => ({
      ...prev,
      isHandingOff,
      handoffTarget: isHandingOff ? targetAgent : undefined,
    }));
  }, []);

  const setError = useCallback((error: string | undefined) => {
    setState((prev) => ({
      ...prev,
      error,
    }));
  }, []);

  const setSlowResponse = useCallback((isSlowResponse: boolean) => {
    setState((prev) => ({
      ...prev,
      isSlowResponse,
    }));
  }, []);

  const clearAllTimeouts = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (slowTimeoutRef.current) {
      clearTimeout(slowTimeoutRef.current);
      slowTimeoutRef.current = null;
    }
    handoffTimeoutRefs.current.forEach(clearTimeout);
    handoffTimeoutRefs.current = [];
  }, []);

  const stopGeneration = useCallback(() => {
    clearAllTimeouts();
    setState((prev) => ({
      ...prev,
      isThinking: false,
      isHandingOff: false,
      handoffTarget: undefined,
      isSlowResponse: false,
    }));
  }, [clearAllTimeouts]);

  const sendMessage = useCallback(async (content: string) => {
    // Clear any previous error
    setError(undefined);
    setSlowResponse(false);

    // Add user message
    addMessage('user', content);

    // Check if we need to route to a different agent
    const routeResult = routeToAgent(content, state.currentAgent);

    if (routeResult.shouldHandoff) {
      // Start handoff process with target agent
      setHandingOff(true, routeResult.targetAgent);
      
      // Show handoff message from current agent
      const handoffMsgTimeout = setTimeout(() => {
        const handoffMessage = getHandoffMessage(state.currentAgent, routeResult.targetAgent);
        addMessage('handoff', handoffMessage, {
          agentId: state.currentAgent,
          handoffFrom: state.currentAgent,
          handoffTo: routeResult.targetAgent,
        });
      }, 500);
      handoffTimeoutRefs.current.push(handoffMsgTimeout);

      // Complete handoff and show new agent response
      const handoffCompleteTimeout = setTimeout(() => {
        setHandingOff(false);
        setThinking(true, routeResult.targetAgent);

        // Start slow response timer
        slowTimeoutRef.current = setTimeout(() => {
          setSlowResponse(true);
        }, SLOW_RESPONSE_THRESHOLD);

        // Add new agent greeting
        timeoutRef.current = setTimeout(() => {
          if (slowTimeoutRef.current) {
            clearTimeout(slowTimeoutRef.current);
            slowTimeoutRef.current = null;
          }
          setSlowResponse(false);
          const response = getMockAgentResponse(routeResult.targetAgent, content);
          addMessage('agent', response.message, {
            agentId: routeResult.targetAgent,
            card: response.card as ChatCard | undefined,
          });
          setThinking(false);
        }, THINKING_DELAY);
      }, HANDOFF_DELAY);
      handoffTimeoutRefs.current.push(handoffCompleteTimeout);
    } else {
      // No handoff needed, just respond from current agent
      setThinking(true);

      // Start slow response timer
      slowTimeoutRef.current = setTimeout(() => {
        setSlowResponse(true);
      }, SLOW_RESPONSE_THRESHOLD);

      timeoutRef.current = setTimeout(() => {
        if (slowTimeoutRef.current) {
          clearTimeout(slowTimeoutRef.current);
          slowTimeoutRef.current = null;
        }
        setSlowResponse(false);
        const response = getMockAgentResponse(state.currentAgent, content);
        addMessage('agent', response.message, {
          agentId: state.currentAgent,
          card: response.card as ChatCard | undefined,
        });
        setThinking(false);
      }, THINKING_DELAY);
    }
  }, [state.currentAgent, addMessage, setThinking, setHandingOff, setError, setSlowResponse]);

  const triggerFraudAlert = useCallback(() => {
    // Proactive fraud alert interruption with target tracking
    setHandingOff(true, 'sentinel');
    
    const alertMsgTimeout = setTimeout(() => {
      addMessage('handoff', "⚠️ Urgent: I'm routing you to Sentinel. We've detected suspicious activity on your account.", {
        agentId: 'atlas',
        handoffFrom: 'atlas',
        handoffTo: 'sentinel',
      });
    }, 300);
    handoffTimeoutRefs.current.push(alertMsgTimeout);

    const alertCompleteTimeout = setTimeout(() => {
      setHandingOff(false);
      setThinking(true, 'sentinel');

      timeoutRef.current = setTimeout(() => {
        addMessage('agent', "🚨 ALERT: I've detected a suspicious transaction that requires your immediate attention.", {
          agentId: 'sentinel',
          card: {
            type: 'fraud-alert',
            data: {
              transactionId: 'txn-014',
              type: 'ATM Withdrawal',
              amount: 500,
              location: 'New York, NY',
              date: '2026-01-13',
              riskLevel: 'high',
              reason: 'Unusual location - you were in San Francisco on this date',
              actions: ['Block Card', 'Report as Fraud', 'This Was Me'],
            },
          },
        });
        setThinking(false);
      }, THINKING_DELAY);
    }, HANDOFF_DELAY);
    handoffTimeoutRefs.current.push(alertCompleteTimeout);
  }, [addMessage, setThinking, setHandingOff]);

  const resetChat = useCallback(() => {
    clearAllTimeouts();
    setState({
      messages: [
        {
          id: generateId(),
          type: 'agent',
          content: getAgentGreeting('atlas'),
          agentId: 'atlas',
          timestamp: new Date(),
        },
      ],
      currentAgent: 'atlas',
      isThinking: false,
      isHandingOff: false,
      handoffTarget: undefined,
      error: undefined,
      isSlowResponse: false,
    });
  }, [clearAllTimeouts]);

  return {
    messages: state.messages,
    currentAgent: state.currentAgent,
    isThinking: state.isThinking,
    isHandingOff: state.isHandingOff,
    handoffTarget: state.handoffTarget,
    error: state.error,
    isSlowResponse: state.isSlowResponse,
    sendMessage,
    triggerFraudAlert,
    resetChat,
    stopGeneration,
    setError,
  };
}
