# PRD: Agentic Banking Demo App

## App Identity

**Name:** AgentBank  
**Tagline:** "Your AI-powered financial command center"

---

## Introduction

AgentBank is a demo application showcasing the "art of the possible" with AI agents in banking. Built as a prototype to demonstrate agentic patterns—multi-agent collaboration, proactive assistance, natural language understanding, and autonomous task execution—all using mock data and simulated AI responses.

**Purpose:** Wow stakeholders with the potential of AI agents in financial services without real integrations.

---

## Goals

- Demonstrate 5 distinct agentic patterns in a cohesive banking experience
- Create visually impressive, interactive demos that executives can click through
- Show multi-agent orchestration with visible agent "thinking" and handoffs
- Highlight both reactive (user-initiated) and proactive (agent-initiated) capabilities
- Build with production-quality React/TypeScript patterns (even with mock data)

---

## Mock Agents & Roles

| Agent | Role | Trigger Patterns |
|-------|------|------------------|
| **Atlas** (Orchestrator) | Routes requests to specialists, maintains conversation context | All conversations start here |
| **Penny** (Spending Analyst) | Analyzes spending, provides insights, budget recommendations | "spending", "budget", "where did my money go" |
| **Sentinel** (Fraud Monitor) | Detects anomalies, flags suspicious activity, explains alerts | Proactive alerts, "is this fraud", "unusual activity" |
| **Nova** (Transfer Agent) | Handles money movement via natural language | "send", "transfer", "pay", "move money" |
| **Sage** (Financial Advisor) | Proactive tips, savings opportunities, financial health | "save money", "advice", "how am I doing" |

---

## Key Demo Scenarios (6 Features)

### DS-001: Conversational Banking Assistant
**Wow Factor:** Natural language banking with visible agent orchestration

**Description:** User types natural requests; Atlas routes to specialist agents with visible handoff animations showing which agent is "thinking."

**Demo Script:**
1. User: "How much did I spend on food this month?"
2. Atlas acknowledges → handoff animation → Penny responds with chart
3. User: "That seems high, help me budget better"
4. Penny provides actionable budget with savings target

**Acceptance Criteria:**
- [ ] Chat interface with typing indicators per agent
- [ ] Agent avatar + name shown for each response
- [ ] Visible "routing to specialist" animation
- [ ] Responses include rich cards (charts, action buttons)

---

### DS-002: Real-Time Fraud Detection Alert
**Wow Factor:** Proactive agent interrupts with urgent, contextual alert

**Description:** Sentinel proactively pushes a fraud alert as a modal/toast during the demo. Shows anomaly reasoning and one-click resolution.

**Demo Script:**
1. Alert slides in: "🚨 Sentinel detected unusual activity"
2. Shows: Transaction details, location mismatch, risk score
3. User can: "This was me" / "Block card" / "Talk to Sentinel"
4. If blocked, Sentinel confirms + offers replacement card

**Acceptance Criteria:**
- [ ] Triggerable demo alert (button or timer)
- [ ] Animated alert with urgency styling
- [ ] Shows agent's reasoning ("Transaction in NYC, you're usually in Seattle")
- [ ] Quick-action buttons with confirmation states

---

### DS-003: Spending Insights Dashboard
**Wow Factor:** AI-generated narrative insights, not just charts

**Description:** Penny presents a spending dashboard with natural language summaries explaining the "why" behind the numbers.

**Demo Script:**
1. Dashboard loads with animated charts
2. Penny's insight card: "You spent 23% more on dining this month—looks like those 4 Friday dinners added up. Want me to set a dining budget?"
3. Comparison to previous months with trend callouts
4. Anomaly highlighting with explanations

**Acceptance Criteria:**
- [ ] Spending by category donut chart
- [ ] Month-over-month trend line
- [ ] AI-generated insight card with conversational tone
- [ ] Click-through to chat with Penny for details

---

### DS-004: Natural Language Transfers
**Wow Factor:** "Venmo-style" simplicity via conversation

**Description:** Nova handles transfer requests from natural language, confirms with smart parsing, and shows real-time status.

**Demo Script:**
1. User: "Send $50 to Mom for dinner"
2. Nova parses: Shows card with recipient (from contacts), amount, memo
3. Nova: "I'll send $50 to Sarah (Mom) with memo 'dinner'. Confirm?"
4. User confirms → animated success with receipt

**Acceptance Criteria:**
- [ ] Natural language parsing display (show extracted entities)
- [ ] Contact matching with confidence indicator
- [ ] Confirmation card with edit capability
- [ ] Animated transfer success state

---

### DS-005: Proactive Financial Advice
**Wow Factor:** Sage notices things you didn't ask about

**Description:** Sage surfaces unsolicited but valuable insights based on account analysis—demonstrating proactive agency.

**Demo Scenarios:**
- "You have $2,400 sitting idle—want me to move $1,000 to your high-yield savings?"
- "Your phone bill increased $15 last month. I found 3 cheaper plans."
- "You're on track to hit your vacation savings goal 2 weeks early!"

**Acceptance Criteria:**
- [ ] Proactive insight cards on dashboard
- [ ] Dismiss / "Tell me more" / "Do it" actions
- [ ] Agent explains reasoning when expanded
- [ ] Tracks dismissed vs. accepted suggestions (mock state)

---

### DS-006: Bill Payment Automation
**Wow Factor:** Agent manages bills autonomously with transparency

**Description:** Nova shows upcoming bills, offers to automate, and demonstrates handling a payment with natural confirmation.

**Demo Script:**
1. User: "What bills are due this week?"
2. Nova: Shows bill cards with due dates, amounts, autopay status
3. User: "Pay my electric bill"
4. Nova: Confirms amount, account, shows scheduled → "Done, paid $127.43"

**Acceptance Criteria:**
- [ ] Bill summary cards with status indicators
- [ ] Natural language bill payment
- [ ] Autopay toggle with confirmation
- [ ] Payment history timeline

---

## Key Screens

| Screen | Purpose | Primary Agents |
|--------|---------|----------------|
| **Dashboard** | Overview with proactive insights | Penny, Sage, Sentinel (alerts) |
| **Chat Interface** | Conversational banking hub | Atlas (orchestrator) + all specialists |
| **Accounts** | Balance display, transaction list | Penny (insights on transactions) |
| **Transfers** | Send money flow | Nova |
| **Bills** | Upcoming bills, payment history | Nova |
| **Agent Activity** | Demo-specific: shows agent logs/handoffs | All (transparency view) |

---

## Mock Data Structure

```typescript
// Core Types
interface Account {
  id: string;
  name: string; // "Checking", "Savings", "Credit Card"
  balance: number;
  accountNumber: string; // masked: "****1234"
  type: 'checking' | 'savings' | 'credit';
}

interface Transaction {
  id: string;
  accountId: string;
  amount: number;
  merchant: string;
  category: 'dining' | 'groceries' | 'transport' | 'shopping' | 'bills' | 'entertainment' | 'other';
  date: string; // ISO date
  location?: string;
  isAnomalous?: boolean; // for fraud demo
}

interface Contact {
  id: string;
  name: string;
  nickname?: string; // "Mom", "Landlord"
  accountInfo: string; // masked
  avatar?: string;
}

interface Bill {
  id: string;
  payee: string;
  amount: number;
  dueDate: string;
  isAutoPay: boolean;
  category: 'utilities' | 'subscriptions' | 'rent' | 'insurance' | 'other';
  status: 'upcoming' | 'paid' | 'overdue';
}

interface AgentMessage {
  id: string;
  agentId: 'atlas' | 'penny' | 'sentinel' | 'nova' | 'sage';
  content: string;
  richContent?: {
    type: 'chart' | 'card' | 'confirmation' | 'alert';
    data: unknown;
  };
  timestamp: string;
  isProactive: boolean;
}

interface AgentHandoff {
  from: string;
  to: string;
  reason: string;
  timestamp: string;
}

// Mock Data Seeds
const MOCK_ACCOUNTS: Account[] = [...];
const MOCK_TRANSACTIONS: Transaction[] = [...]; // ~50 transactions, last 30 days
const MOCK_CONTACTS: Contact[] = [...]; // 5-10 contacts with nicknames
const MOCK_BILLS: Bill[] = [...]; // 5-8 recurring bills
```

---

## Non-Goals (Out of Scope)

- Real banking API integration
- Authentication/security implementation
- Real AI model calls (use scripted responses)
- Mobile-responsive design (desktop demo only)
- Accessibility compliance (demo focus)
- Data persistence beyond session
- Multiple user accounts

---

## Technical Considerations

- **Framework:** Next.js 14+ App Router with Server Components
- **State:** React Context for conversation + Zustand for global state
- **Styling:** Tailwind CSS + shadcn/ui components
- **Charts:** Recharts for spending visualizations
- **Animations:** Framer Motion for agent handoffs, alerts
- **Mock AI:** Scripted response trees with realistic delays (300-800ms)

---

## Success Metrics (Demo Success)

- Stakeholder can complete all 6 demo scenarios without guidance
- "Wow" reaction to proactive agent behaviors
- Clear understanding of agent specialization and handoffs
- Request for "when can we build this for real?"

---

## Open Questions

1. Should we include a "demo mode" toggle that reveals agent decision-making?
2. Do we want voice input for extra wow factor?
3. Should the Agent Activity screen be always-visible or a debug panel?
