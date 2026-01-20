// Agent Types
export type AgentId = 'atlas' | 'penny' | 'sentinel' | 'nova' | 'sage';

export interface Agent {
  id: AgentId;
  name: string;
  avatar: string;
  color: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
  role: string;
  description: string;
}

// Account Types
export type AccountType = 'checking' | 'savings' | 'credit';

export interface Account {
  id: string;
  type: AccountType;
  name: string;
  balance: number;
  availableBalance: number;
  accountNumber: string;
  lastFourDigits: string;
  interestRate?: number;
  creditLimit?: number;
}

// Transaction Types
export type TransactionCategory =
  | 'groceries'
  | 'dining'
  | 'transport'
  | 'utilities'
  | 'entertainment'
  | 'shopping'
  | 'income'
  | 'transfer'
  | 'healthcare'
  | 'subscriptions';

export type TransactionStatus = 'completed' | 'pending' | 'failed' | 'flagged';

export interface Transaction {
  id: string;
  accountId: string;
  date: string;
  description: string;
  amount: number;
  category: TransactionCategory;
  status: TransactionStatus;
  merchant?: string;
  location?: string;
  isFlagged?: boolean;
}

// Bill Types
export interface Bill {
  id: string;
  payee: string;
  amount: number;
  dueDate: string;
  category: string;
  isAutoPay: boolean;
  accountId: string;
}

// Contact Types
export interface Contact {
  id: string;
  name: string;
  email: string;
  phone?: string;
  accountNumber?: string;
  bank?: string;
  avatar?: string;
  isFavorite: boolean;
}

// Chat Types
export type MessageType = 'user' | 'agent' | 'system' | 'handoff';

export type CardType = 
  | 'transfer-confirm' 
  | 'spending-chart' 
  | 'fraud-alert' 
  | 'account-summary'
  | 'bill-reminder';

export interface ChatCard {
  type: CardType;
  data: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  type: MessageType;
  content: string;
  agentId?: AgentId;
  timestamp: Date;
  card?: ChatCard;
  isThinking?: boolean;
  handoffFrom?: AgentId;
  handoffTo?: AgentId;
}

// Transfer Types
export interface TransferRequest {
  fromAccountId: string;
  toContactId?: string;
  toAccountId?: string;
  amount: number;
  memo?: string;
  scheduledDate?: string;
}

// Agent Insight Types
export interface AgentInsight {
  id: string;
  agentId: AgentId;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  actionLabel?: string;
  timestamp: Date;
}

// Spending Category Summary
export interface SpendingCategory {
  category: TransactionCategory;
  amount: number;
  percentage: number;
  trend: 'up' | 'down' | 'stable';
  changePercent: number;
}

// Chat State
export interface ChatState {
  messages: ChatMessage[];
  currentAgent: AgentId;
  isThinking: boolean;
  isHandingOff: boolean;
  handoffTarget?: AgentId;
  error?: string;
  isSlowResponse: boolean;
}
