# Beth AI Agent System - Flow Overview

## High-Level Architecture

```mermaid
flowchart TB
    subgraph User["👤 User"]
        Request[User Request]
    end

    subgraph Orchestrator["🎯 Beth - The Orchestrator"]
        Beth["@Beth<br/><i>'I don't speak dipshit'</i>"]
        Assess[Assess Request]
        Analyze[Analyze Dependencies]
        Plan[Plan Workflow]
        Route[Route to Specialists]
    end

    subgraph Agents["🧑‍💼 Specialist Agents"]
        PM["@product-manager<br/>WHAT to build"]
        Researcher["@researcher<br/>User/Market Intel"]
        Designer["@ux-designer<br/>HOW it works"]
        Developer["@developer<br/>Implementation"]
        Security["@security-reviewer<br/>Protection"]
        Tester["@tester<br/>Quality Gate"]
    end

    subgraph Skills["📚 Skills (Domain Knowledge)"]
        PRD["PRD Generation"]
        Framer["Framer Components"]
        React["React Best Practices"]
        WebDesign["Web Design Guidelines"]
        SecAnalysis["Security Analysis"]
        ShadcnUI["shadcn/ui"]
    end

    subgraph MCP["🔌 MCP Servers (Optional)"]
        MCPShadcn["shadcn/ui MCP"]
        MCPPlaywright["Playwright MCP"]
        MCPAzure["Azure MCP"]
        MCPWeb["Web Search MCP"]
    end

    subgraph Output["📦 Deliverables"]
        Code[Production Code]
        Tests[Test Suites]
        Docs[Documentation]
        Reports[Security Reports]
    end

    Request --> Beth
    Beth --> Assess --> Analyze --> Plan --> Route
    
    Route --> PM
    Route --> Researcher
    Route --> Designer
    Route --> Developer
    Route --> Security
    Route --> Tester

    PM -.->|loads| PRD
    Designer -.->|loads| Framer
    Designer -.->|loads| WebDesign
    Developer -.->|loads| React
    Developer -.->|loads| ShadcnUI
    Security -.->|loads| SecAnalysis

    Developer -.->|uses| MCPShadcn
    Tester -.->|uses| MCPPlaywright
    Researcher -.->|uses| MCPWeb

    Developer --> Code
    Tester --> Tests
    PM --> Docs
    Security --> Reports
```

## Agent Interaction Patterns

### Handoffs vs Subagents

```mermaid
flowchart LR
    subgraph Handoff["🔄 Handoff Pattern"]
        direction TB
        H1[Beth routes work]
        H2[User reviews context]
        H3[User clicks handoff button]
        H4[Target agent activates]
        H1 --> H2 --> H3 --> H4
    end

    subgraph Subagent["⚡ Subagent Pattern"]
        direction TB
        S1[Beth spawns subagent]
        S2[Agent executes autonomously]
        S3[Results returned to Beth]
        S4[Beth continues workflow]
        S1 --> S2 --> S3 --> S4
    end
```

## Workflow Patterns

### New Feature Development

```mermaid
sequenceDiagram
    participant U as User
    participant B as Beth
    participant PM as Product Manager
    participant R as Researcher
    participant UX as UX Designer
    participant D as Developer
    participant S as Security
    participant T as Tester

    U->>B: "Build me a feature"
    
    B->>B: Assess & Plan
    
    B->>PM: Define requirements
    PM->>PM: Write PRD, user stories
    PM-->>B: Requirements ready
    
    opt Validate assumptions
        B->>R: Research user needs
        R->>R: Interviews, competitive analysis
        R-->>B: Insights synthesized
    end
    
    B->>UX: Design the experience
    UX->>UX: Component specs, tokens, a11y
    UX-->>B: Design specs ready
    
    B->>D: Implement feature
    D->>D: Build React/Next.js code
    D-->>B: Implementation complete
    
    B->>S: Security review
    S->>S: OWASP audit, threat model
    S-->>B: Security approved
    
    B->>T: Test & verify
    T->>T: Unit, integration, e2e, a11y
    T-->>B: Quality verified
    
    B->>U: Feature complete ✅
```

### Bug Hunt Workflow

```mermaid
sequenceDiagram
    participant U as User
    participant B as Beth
    participant T as Tester
    participant D as Developer
    participant S as Security

    U->>B: "Fix this bug"
    
    B->>T: Reproduce & document
    T->>T: Create reproduction steps
    T-->>B: Bug confirmed
    
    B->>D: Find & fix
    D->>D: Debug, implement fix
    D-->>B: Fix ready
    
    B->>S: Verify no vulnerabilities
    S->>S: Check related security
    S-->>B: Security clear
    
    B->>T: Verify fix
    T->>T: Regression testing
    T-->>B: Fix verified
    
    B->>U: Bug squashed ✅
```

### Security Audit Workflow

```mermaid
sequenceDiagram
    participant U as User
    participant B as Beth
    participant S as Security
    participant D as Developer
    participant T as Tester

    U->>B: "Security review needed"
    
    B->>S: Threat model & audit
    S->>S: STRIDE analysis<br/>OWASP Top 10<br/>Azure WAF review
    S-->>B: Findings documented
    
    loop For each finding
        B->>D: Remediate vulnerability
        D->>D: Implement secure fix
        D-->>B: Fix applied
    end
    
    B->>T: Penetration testing
    T->>T: Attack scenarios<br/>Security test plan
    T-->>B: All tests pass
    
    B->>S: Final sign-off
    S-->>B: Security approved
    
    B->>U: Audit complete ✅
```

## Agent Handoff Relationships

```mermaid
flowchart TB
    subgraph Beth["Beth (Orchestrator)"]
        BethCore["Routes all work<br/>Spawns subagents"]
    end

    subgraph PM["Product Manager"]
        PMCore["Requirements<br/>Priorities"]
    end

    subgraph R["Researcher"]
        RCore["User insights<br/>Market intel"]
    end

    subgraph UX["UX Designer"]
        UXCore["Component specs<br/>Design tokens"]
    end

    subgraph D["Developer"]
        DCore["React/TS/Next.js<br/>Implementation"]
    end

    subgraph S["Security"]
        SCore["Threat modeling<br/>Vulnerabilities"]
    end

    subgraph T["Tester"]
        TCore["QA & a11y<br/>Performance"]
    end

    %% Beth's handoffs
    BethCore -->|"Product Strategy"| PMCore
    BethCore -->|"User Research"| RCore
    BethCore -->|"UX Design"| UXCore
    BethCore -->|"Development"| DCore
    BethCore -->|"Security Review"| SCore
    BethCore -->|"Quality Assurance"| TCore

    %% PM handoffs
    PMCore -->|"Validate"| RCore
    PMCore -->|"Design Brief"| UXCore
    PMCore -->|"Feasibility"| DCore

    %% Researcher handoffs
    RCore -->|"Synthesize"| PMCore
    RCore -->|"Design Implications"| UXCore

    %% UX handoffs
    UXCore -->|"Implement"| DCore
    UXCore -->|"Validate"| RCore
    UXCore -->|"Align"| PMCore

    %% Developer handoffs
    DCore -->|"Test"| TCore
    DCore -->|"Design Review"| UXCore
    DCore -->|"Feasibility"| PMCore

    %% Security handoffs
    SCore -->|"Remediate"| DCore
    SCore -->|"Security Tests"| TCore

    %% Tester handoffs
    TCore -->|"Bug Fix"| DCore
    TCore -->|"Quality Report"| PMCore
    TCore -->|"Design Verify"| UXCore
```

## Skills Loading Pattern

```mermaid
flowchart LR
    subgraph Trigger["User Request"]
        T1["'create a PRD'"]
        T2["'framer component'"]
        T3["'security review'"]
        T4["'shadcn button'"]
    end

    subgraph Agent["Agent Activation"]
        A1["Product Manager"]
        A2["UX Designer"]
        A3["Security Reviewer"]
        A4["Developer"]
    end

    subgraph Skill["Skill Loaded"]
        S1["skills/prd/SKILL.md"]
        S2["skills/framer-components/SKILL.md"]
        S3["skills/security-analysis/SKILL.md"]
        S4["skills/shadcn-ui/SKILL.md"]
    end

    T1 --> A1 --> S1
    T2 --> A2 --> S2
    T3 --> A3 --> S3
    T4 --> A4 --> S4
```

## IDEO Design Thinking Integration

```mermaid
flowchart LR
    subgraph Empathize["1. Empathize"]
        E["@researcher<br/>User interviews<br/>Pain points"]
    end

    subgraph Define["2. Define"]
        D["@product-manager<br/>Problem framing<br/>Requirements"]
    end

    subgraph Ideate["3. Ideate"]
        I["@ux-designer<br/>Component specs<br/>Patterns"]
    end

    subgraph Prototype["4. Prototype"]
        P["@developer<br/>Build to learn<br/>Feature spikes"]
    end

    subgraph Test["5. Test"]
        T["@tester<br/>Validate<br/>Accessibility"]
    end

    E --> D --> I --> P --> T
    T -.->|iterate| E
    T -.->|iterate| D
    T -.->|iterate| I
```

## Quality Gates

```mermaid
flowchart TB
    subgraph Standards["Quality Standards"]
        A11y["WCAG 2.1 AA<br/>Accessibility"]
        Perf["Core Web Vitals<br/>LCP < 2.5s"]
        Sec["OWASP Compliant<br/>Zero vulnerabilities"]
        Type["Full TypeScript<br/>No any"]
        Coverage["Test Coverage<br/>Unit + Integration + E2E"]
    end

    subgraph Gates["Enforcement"]
        Designer["UX Designer<br/>reviews a11y specs"]
        Developer["Developer<br/>implements patterns"]
        Security["Security Reviewer<br/>audits code"]
        Tester["Tester<br/>verifies all gates"]
    end

    A11y --> Designer
    Perf --> Developer
    Sec --> Security
    Type --> Developer
    Coverage --> Tester

    Designer --> Ship{Ship?}
    Developer --> Ship
    Security --> Ship
    Tester --> Ship

    Ship -->|All Pass| Deploy["🚀 Deploy"]
    Ship -->|Fail| Fix["🔧 Fix & Retry"]
    Fix --> Gates
```

## File Structure

```mermaid
flowchart TB
    subgraph Root[".github/"]
        subgraph Agents["agents/"]
            Beth["beth.agent.md"]
            PM["product-manager.agent.md"]
            Researcher["researcher.agent.md"]
            UX["ux-designer.agent.md"]
            Dev["developer.agent.md"]
            Tester["tester.agent.md"]
            Sec["security-reviewer.agent.md"]
        end
        
        subgraph Skills["skills/"]
            PRD["prd/SKILL.md"]
            Framer["framer-components/SKILL.md"]
            React["vercel-react-best-practices/SKILL.md"]
            Web["web-design-guidelines/SKILL.md"]
            SecSkill["security-analysis/SKILL.md"]
            Shadcn["shadcn-ui/SKILL.md"]
        end
        
        Instructions["copilot-instructions.md"]
    end
    
    Beth --> Instructions
    PM --> PRD
    UX --> Framer
    UX --> Web
    Dev --> React
    Dev --> Shadcn
    Sec --> SecSkill
```

---

## Summary

**Beth** is the ruthless orchestrator who:
1. **Receives** user requests
2. **Assesses** what's really needed (not just what was asked)
3. **Plans** the optimal workflow
4. **Delegates** to specialist agents
5. **Delivers** results without excuses

The system follows **IDEO Design Thinking** principles:
- **Empathize** → Researcher
- **Define** → Product Manager  
- **Ideate** → UX Designer
- **Prototype** → Developer
- **Test** → Tester + Security

All work passes through **quality gates** enforcing accessibility, performance, security, type safety, and test coverage.

> *"I made two decisions in my life based on fear, and they almost ruined me. I'll never make another."* — Beth
