import { ZodError } from 'zod';
import {
  AgentAlreadyRegisteredError,
  AgentContractSchema,
  AgentNotFoundError,
  ContractViolationError,
  formatZodError,
  type AgentContract,
} from '@platform/shared';

/** Holds every registered agent, validated against the §5 contract at registration. */
export class AgentRegistry {
  private readonly agents = new Map<string, AgentContract>();

  register(candidate: unknown): AgentContract {
    let contract: AgentContract;
    try {
      contract = AgentContractSchema.parse(candidate);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new ContractViolationError(
          `Agent contract rejected — ${formatZodError(error)}`
        );
      }
      throw error;
    }
    if (this.agents.has(contract.name)) {
      throw new AgentAlreadyRegisteredError(contract.name);
    }
    this.agents.set(contract.name, contract);
    return contract;
  }

  get(name: string): AgentContract {
    const agent = this.agents.get(name);
    if (agent === undefined) throw new AgentNotFoundError(name);
    return agent;
  }

  list(): string[] {
    return [...this.agents.keys()];
  }
}
