import { cn } from '@/lib/utils';
import { agents } from '@/lib/agents';
import type { AgentId } from '@/lib/types';

interface AgentBadgeProps {
  agentId: AgentId;
  size?: 'sm' | 'md' | 'lg';
  showRole?: boolean;
  isActive?: boolean;
}

export function AgentBadge({ agentId, size = 'md', showRole = false, isActive = false }: AgentBadgeProps) {
  const agent = agents[agentId];

  const sizeClasses = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-10 h-10 text-base',
    lg: 'w-14 h-14 text-xl',
  };

  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          'rounded-full flex items-center justify-center flex-shrink-0 transition-all',
          sizeClasses[size],
          agent.bgColor,
          isActive && 'ring-2 ring-offset-2 ring-indigo-500 agent-avatar-active'
        )}
        title={`${agent.name} - ${agent.role}`}
        aria-label={agent.name}
        role="img"
      >
        {agent.avatar}
      </div>
      {showRole && (
        <div className="min-w-0">
          <p className={cn(
            'font-semibold text-gray-900',
            size === 'sm' ? 'text-xs' : size === 'md' ? 'text-sm' : 'text-base'
          )}>
            {agent.name}
          </p>
          <p className={cn(
            'text-gray-500',
            size === 'sm' ? 'text-[10px]' : size === 'md' ? 'text-xs' : 'text-sm'
          )}>
            {agent.role}
          </p>
        </div>
      )}
    </div>
  );
}
