# Beth Demo: Building a Task Management Dashboard

> *"You want a demo? Fine. But pay attention—I'm only showing this once."*

This guide walks through how **I** run a dev team. You'll see agents, subagents, handoffs, and skills working together. More importantly, you'll see how work actually gets done when someone competent is in charge.

## Prerequisites

Before we start:
- VS Code with GitHub Copilot extension
- The `.github/agents/` folder with all 7 agent files
- The `.github/skills/` folder populated
- beads installed (`bd doctor` to verify)

Don't have these? Run `npx beth-copilot init` and stop wasting my time.

## What We're Building

**Use Case**: Task Management Dashboard

| Feature | Why It Matters |
|---------|----------------|
| Drag-and-drop task lists | Users live in their task boards |
| Priority tagging | Critical vs. "whenever" matters |
| Due date calendar | Deadlines drive behavior |
| Real-time collaboration | Teams don't work in silos |

**My Team**:

| Agent | Role | What I Use Them For |
|-------|------|---------------------|
| **Beth** | Orchestrator | That's me. I run everything. |
| **Product Manager** | Strategy | WHAT to build and WHY |
| **Researcher** | Intelligence | User insights, competitive dirt |
| **UX Designer** | Architecture | HOW it works and feels |
| **Developer** | Builder | React/TypeScript implementation |
| **Security Reviewer** | Bodyguard | Vulnerabilities and compliance |
| **Tester** | Enforcer | Quality and accessibility |

---

## Phase 1: You Come to Me

**Open Copilot Chat and select `@Beth`**

```
User: I want to build a task management dashboard for our team. 
      It should have task lists, priorities, due dates, and real-time updates.
```

**What I'm thinking**:

Let me be clear about what's happening here. You're asking for:
1. A complex UI with drag-and-drop—that's non-trivial
2. Real-time sync—WebSocket infrastructure
3. Calendar integration—date handling is always fun
4. Priority system—simple but gets it wrong constantly

**What I actually say**:

> "Good. Now let's talk about what you're really asking for.
>
> **What I'm hearing:** A collaborative task board with the usual suspects—Kanban, priorities, dates, live updates.
>
> **What this actually needs:**
> - Product Manager to nail down requirements before anyone writes code
> - Researcher to validate we're not building another Trello clone nobody wants
> - UX Designer for the interaction patterns (drag-and-drop accessibility is a minefield)
> - Developer to implement it right
> - Security Reviewer because real-time + user data = attack surface
> - Tester to make sure it actually works
>
> **The play:** I'm creating an epic. Watch."

Then I run:
```bash
bd create "Task management dashboard" --type epic -p 1
```

---

## Phase 2: I Set Up the Work

This is where most orchestrators fail. They just throw tasks at people without thinking about dependencies. I don't make that mistake.

```bash
# Create subtasks with dependencies
bd create "Define dashboard requirements" --parent beth-xyz123 -a product-manager
bd create "Validate user needs" --parent beth-xyz123 --deps "beth-xyz123.1"
bd create "Design task board UX" --parent beth-xyz123 --deps "beth-xyz123.2"
bd create "Implement dashboard" --parent beth-xyz123 --deps "beth-xyz123.3"
bd create "Security audit" --parent beth-xyz123 --deps "beth-xyz123.4"
bd create "QA and accessibility" --parent beth-xyz123 --deps "beth-xyz123.4"
```

Now I can see what's ready:
```bash
bd ready
# → beth-xyz123.1: Define dashboard requirements (no blockers)
```

**Only one thing is unblocked.** That's requirements. So that's where we start. Anyone who wants to skip to coding can find another team.

---

## Phase 3: Product Requirements

I spawn the Product Manager as a subagent:

```typescript
runSubagent({
  agentName: "product-manager",
  prompt: `Work on beth-xyz123.1: Define requirements for task management dashboard.

    Context: Team wants task lists with drag-and-drop, priority tagging,
    due date calendar, and real-time collaboration.

    Deliverables:
    - User personas (who are we building for?)
    - Functional requirements (what does it do?)
    - Non-functional requirements (performance, accessibility)
    - Success metrics (how do we know it worked?)

    When complete: bd close beth-xyz123.1
    Return: PRD summary and any risks you've identified.`,
  description: "Dashboard PRD"
})
```

**Product Manager comes back with**:

```markdown
# PRD: Task Management Dashboard

## User Personas
- **Project Manager**: Needs bird's-eye view of all tasks
- **Team Member**: Needs personal queue management
- **Stakeholder**: Needs progress visibility without noise

## Functional Requirements
| ID | Requirement | Priority |
|----|-------------|----------|
| F1 | Create/edit/delete tasks | Must Have |
| F2 | Drag-and-drop between columns | Must Have |
| F3 | Priority levels (Critical/High/Medium/Low) | Must Have |
| F4 | Due date picker with calendar view | Must Have |
| F5 | Real-time sync across users | Must Have |
| F6 | Keyboard shortcuts for power users | Should Have |
| F7 | Offline mode with sync | Could Have |

## Non-Functional Requirements
- LCP < 2.5s (Core Web Vitals)
- WCAG 2.1 AA accessibility
- Works on mobile viewports

## Success Metrics
- Task completion rate +20%
- Time-to-find-task -50%

## Risks Identified
1. **Real-time complexity**: WebSocket infrastructure is non-trivial
2. **Drag-and-drop accessibility**: Most implementations fail WCAG
3. **Offline sync**: Conflict resolution is hard

Issue beth-xyz123.1 closed.
```

Good. Now I check what's unblocked:
```bash
bd ready
# → beth-xyz123.2: Validate user needs (blocker closed)
```

---

## Phase 4: Research Validation

I could skip this. Most people do. That's why most products fail.

```typescript
runSubagent({
  agentName: "researcher",
  prompt: `Work on beth-xyz123.2: Validate requirements for task dashboard.

    PM identified these requirements. Your job:
    1. Competitive analysis - What do Asana, Trello, Linear, Monday do?
    2. Differentiation - What makes us worth using?
    3. Risk validation - Are the PM's concerns valid?

    Be honest. If we're building something nobody wants, say so now.

    When complete: bd close beth-xyz123.2
    Return: Competitive matrix, key insights, recommendations.`,
  description: "Dashboard research"
})
```

**Researcher returns**:

```markdown
## Competitive Analysis

| Feature | Us | Asana | Trello | Linear |
|---------|-----|-------|--------|--------|
| Drag-drop | ✅ | ✅ | ✅ | ✅ |
| Real-time | ✅ | ✅ | ❌ | ✅ |
| Keyboard nav | ❓ | ⭐⭐⭐ | ⭐ | ⭐⭐⭐⭐ |
| Offline | ✅ | ❌ | ❌ | ❌ |
| Price | ? | $$$ | $$ | $$$ |

## Key Insights

1. **Keyboard shortcuts are the differentiator** 
   - Linear users cite this as #1 reason for switching
   - Most competitors are mouse-first
   - **Recommendation**: Promote to Must Have

2. **Offline is genuinely unique**
   - No major competitor has robust offline
   - But: Conflict resolution is R&D-heavy
   - **Recommendation**: Validate with users before committing

3. **Real-time is table stakes**
   - Not a differentiator, but absence is a dealbreaker

## Validation of PM Risks

| Risk | Valid? | Notes |
|------|--------|-------|
| Real-time complexity | ✅ Yes | But well-understood problem |
| DnD accessibility | ✅ Yes | @dnd-kit solves this |
| Offline sync | ✅ Yes | Consider phasing this |

Issue beth-xyz123.2 closed.
```

See that? Keyboard shortcuts just got promoted. That's why we research. Now:

```bash
bd ready
# → beth-xyz123.3: Design task board UX
```

---

## Phase 5: UX Design

The designer gets the PRD and research context:

```typescript
runSubagent({
  agentName: "ux-designer",
  prompt: `Work on beth-xyz123.3: Design task board UX.

    Context:
    - PRD requires drag-drop, priorities, dates, real-time
    - Research says keyboard nav is key differentiator
    - WCAG 2.1 AA is non-negotiable

    Deliverables:
    - Component specifications for TaskCard and TaskBoard
    - Interaction patterns (drag, keyboard, touch)
    - Design tokens
    - Accessibility requirements

    When complete: bd close beth-xyz123.3
    Return: Specs the developer can actually implement.`,
  description: "Dashboard UX"
})
```

**Designer returns**:

```markdown
## Component: TaskCard

### Visual Anatomy
┌─────────────────────────────────────┐
│ ● Priority  │  Task Title          │
│ [tag] [tag] │  Due: Jan 25         │
│             │  @assignee           │
└─────────────────────────────────────┘

### States
| State | Visual |
|-------|--------|
| Default | White background, subtle border |
| Hover | Shadow elevation (0 2px 8px) |
| Dragging | Opacity 0.8, rotate 2deg |
| Drop Target | Blue border highlight |
| Focused | 2px blue ring (keyboard) |

### Keyboard Interaction
| Key | Action |
|-----|--------|
| Tab | Navigate between cards |
| Space | Grab/release card |
| Arrow keys | Move grabbed card |
| Escape | Cancel drag |
| Enter | Open card detail |

### Accessibility
- Role: `listitem` within `list`
- `aria-grabbed`: true/false during drag
- `aria-dropeffect`: move
- Screen reader announcement: "Task: [title], Priority: [level], Due: [date]"

### React Interface
```typescript
interface TaskCardProps {
  id: string;
  title: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  dueDate?: Date;
  assignee?: User;
  tags?: string[];
  isDragging?: boolean;
  isFocused?: boolean;
}
```

### Design Tokens
```css
--task-card-bg: #ffffff;
--task-card-border: #e5e7eb;
--task-card-shadow-hover: 0 2px 8px rgba(0,0,0,0.1);
--priority-critical: #ef4444;
--priority-high: #f97316;
--priority-medium: #eab308;
--priority-low: #22c55e;
```

Issue beth-xyz123.3 closed.
```

That's a spec. Not a "vibe" or a "direction"—actual implementation specs.

---

## Phase 6: Implementation

Now we build:

```typescript
runSubagent({
  agentName: "developer",
  prompt: `Work on beth-xyz123.4: Implement task dashboard.

    UX specs attached. Key requirements:
    - Use @dnd-kit for drag-and-drop (not react-beautiful-dnd—it's dead)
    - TypeScript strict mode, no any
    - Full keyboard support per spec
    - WCAG 2.1 AA accessibility

    Implement:
    1. TaskCard component with all states
    2. TaskBoard with columns
    3. useDragAndDrop hook for keyboard support

    When complete: bd close beth-xyz123.4
    Return: Implementation summary, any deviations from spec.`,
  description: "Dashboard impl"
})
```

**Developer returns**:

```typescript
// components/TaskCard/TaskCard.tsx
'use client';

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { cva } from 'class-variance-authority';
import { forwardRef } from 'react';

const cardStyles = cva(
  'bg-white rounded-lg p-4 border transition-all focus:outline-none focus:ring-2 focus:ring-blue-500',
  {
    variants: {
      isDragging: {
        true: 'opacity-80 rotate-2 shadow-lg',
        false: 'hover:shadow-md',
      },
    },
  }
);

const priorityStyles = cva('rounded-full w-2 h-2', {
  variants: {
    priority: {
      critical: 'bg-red-500',
      high: 'bg-orange-500',
      medium: 'bg-yellow-500',
      low: 'bg-green-500',
    },
  },
});

interface TaskCardProps {
  id: string;
  title: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  dueDate?: Date;
  assignee?: { name: string; avatar: string };
}

export const TaskCard = forwardRef<HTMLDivElement, TaskCardProps>(
  function TaskCard({ id, title, priority, dueDate, assignee }, ref) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = 
      useDraggable({ id });

    const style = {
      transform: CSS.Transform.toString(transform),
    };

    return (
      <div
        ref={setNodeRef}
        style={style}
        {...listeners}
        {...attributes}
        role="listitem"
        aria-grabbed={isDragging}
        aria-label={`Task: ${title}, Priority: ${priority}${
          dueDate ? `, Due: ${dueDate.toLocaleDateString()}` : ''
        }`}
        className={cardStyles({ isDragging })}
      >
        <div className="flex items-center gap-2 mb-2">
          <span 
            className={priorityStyles({ priority })} 
            aria-label={`Priority: ${priority}`}
          />
          <span className="font-medium">{title}</span>
        </div>
        {dueDate && (
          <p className="text-sm text-gray-500">
            Due: {dueDate.toLocaleDateString()}
          </p>
        )}
        {assignee && (
          <div className="flex items-center gap-2 mt-2">
            <img 
              src={assignee.avatar} 
              alt="" 
              className="w-6 h-6 rounded-full" 
            />
            <span className="text-sm">{assignee.name}</span>
          </div>
        )}
      </div>
    );
  }
);
```

Implementation follows spec. No "creative interpretations." Issue closed.

---

## Phase 7: Parallel Security & Testing

Here's where I show off. Security and testing have the same dependency—they both need implementation done. So I run them **in parallel**:

```typescript
const [securityResult, testResult] = await Promise.all([
  runSubagent({
    agentName: "security-reviewer",
    prompt: `Work on beth-xyz123.5: Security audit of task dashboard.

      Check:
      - Real-time WebSocket authentication
      - XSS in user-generated content (tasks, tags)
      - CSRF protection on task mutations
      - Rate limiting on task operations

      When complete: bd close beth-xyz123.5
      Return: Findings with severity and remediation.`,
    description: "Security audit"
  }),
  runSubagent({
    agentName: "tester",
    prompt: `Work on beth-xyz123.6: QA task dashboard.

      Test:
      - Functional: CRUD, drag-drop, real-time sync
      - Accessibility: Keyboard nav, screen readers
      - Performance: Bundle size, render time

      When complete: bd close beth-xyz123.6
      Return: Test report with pass/fail and any blockers.`,
    description: "Dashboard QA"
  })
]);
```

Both run simultaneously. Both close their issues. Both report back. That's efficiency.

**Security Reviewer returns**:
```markdown
## Security Audit: Task Dashboard

| Finding | Severity | Status |
|---------|----------|--------|
| WebSocket auth | Medium | JWT validation required |
| XSS in task titles | High | Needs sanitization |
| CSRF tokens | Pass | Next.js handles this |
| Rate limiting | Low | Recommend 100 req/min |

## Required Fixes
1. Add DOMPurify for task title/description
2. Validate JWT on WebSocket handshake

Issue beth-xyz123.5 closed.
```

**Tester returns**:
```markdown
## Test Report: Task Dashboard

| Category | Result |
|----------|--------|
| Functional (12 tests) | ✅ Pass |
| Accessibility (axe) | ✅ 0 violations |
| Keyboard nav | ✅ All paths work |
| Performance | ✅ LCP 1.8s |

Issue beth-xyz123.6 closed.
```

---

## Phase 8: Landing the Plane

All subtasks are closed. Time to close the epic:

```bash
bd epic status beth-xyz123
# → 6/6 tasks complete (100%)

bd epic close-eligible
# → Closed beth-xyz123

# Update the human-readable backlog
```

Then I update Backlog.md with a summary of what shipped. Because work isn't done until it's documented.

---

## Quick Demo Commands

Want to see each agent in action? Copy-paste these:

### Beth (that's me)
```
@Beth Plan a feature for adding Slack notifications when tasks are overdue.
```

### Product Manager
```
@product-manager Create a PRD for a mobile-responsive task view.
```

### Researcher
```
@researcher What are the top 3 task management apps and their key differentiators?
```

### UX Designer
```
@ux-designer Design a priority selector dropdown with 4 levels and full accessibility.
```

### Developer
```
@developer Implement a useTaskSubscription hook for real-time WebSocket updates.
```

### Security Reviewer
```
@security-reviewer Audit this WebSocket implementation for authentication vulnerabilities.
```

### Tester
```
@tester Write Playwright E2E tests for drag-and-drop task reordering.
```

---

## The Workflow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        USER REQUEST                                  │
│            "Build a task management dashboard"                       │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           @Beth                                      │
│  "Let me be clear about what's happening here..."                   │
│  • Creates epic with bd                                              │
│  • Maps dependencies                                                 │
│  • Spawns subagents                                                  │
└─────────────────────────────────────────────────────────────────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        │                         │                         │
        ▼                         ▼                         ▼
┌───────────────┐        ┌───────────────┐        ┌───────────────┐
│ @product-     │        │ @researcher   │        │ @ux-designer  │
│  manager      │───────▶│               │───────▶│               │
│               │ deps   │               │ deps   │               │
│ PRD skill     │        │ Analysis      │        │ Component     │
│ loaded        │        │               │        │ specs         │
└───────────────┘        └───────────────┘        └───────────────┘
                                                          │
                                                          ▼
                                                 ┌───────────────┐
                                                 │ @developer    │
                                                 │               │
                                                 │ Implementation│
                                                 └───────────────┘
                                                          │
                              ┌────────────────────────────┼────────────────────────────┐
                              ▼                                                         ▼
                     ┌───────────────┐                                         ┌───────────────┐
                     │ @security-    │          (parallel)                     │ @tester       │
                     │  reviewer     │                                         │               │
                     │               │                                         │ QA +          │
                     │ Audit         │                                         │ Accessibility │
                     └───────────────┘                                         └───────────────┘
                              │                                                         │
                              └────────────────────────────┬────────────────────────────┘
                                                          ▼
                                                 ┌───────────────┐
                                                 │ Beth closes   │
                                                 │ epic, updates │
                                                 │ Backlog.md    │
                                                 └───────────────┘
                                                          │
                                                          ▼
                                                  ✅ SHIPPED
```

---

## Troubleshooting

### Beth not responding with her personality
- Make sure you're using `@Beth`, not generic Copilot
- Check `.github/agents/Beth.agent.md` exists
- Reload VS Code window

### Beads commands failing
- Run `bd doctor` to verify installation
- Run `bd init` if not initialized
- Check you're in the right directory

### Subagent not returning results
- Verify `infer: true` in target agent's frontmatter
- Check agent name matches exactly (case-sensitive)
- Ensure target agent has required tools

### Skills not loading
- Verify skill exists at `.github/skills/<name>/SKILL.md`
- Check trigger words in your prompt
- Read the skill file to see what triggers it expects

---

## Files Reference

```
.github/
├── agents/
│   ├── Beth.agent.md            # The boss (orchestrator)
│   ├── product-manager.agent.md # PRD skill, requirements
│   ├── researcher.agent.md      # User/market research
│   ├── ux-designer.agent.md     # Design specs, tokens
│   ├── developer.agent.md       # React/TS implementation
│   ├── security-reviewer.agent.md # Security audits
│   └── tester.agent.md          # QA and accessibility
└── skills/
    ├── prd/SKILL.md             # PRD generation workflow
    ├── framer-components/SKILL.md
    ├── vercel-react-best-practices/SKILL.md
    ├── web-design-guidelines/SKILL.md
    ├── shadcn-ui/SKILL.md
    ├── security-analysis/SKILL.md
    ├── web-search/SKILL.md
    └── azure-operations/SKILL.md
```

---

> *"Now you've seen how I work. Questions? I'll answer them. Complaints? Keep them to yourself."*
