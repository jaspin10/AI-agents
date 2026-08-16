import { z } from 'zod';

/**
 * M1 stub input for the analyst agent. `attemptTool` makes the stub deliberately
 * attempt an unauthorized tool call so the demo can prove §5 enforcement.
 */
export const EchoTaskPayloadSchema = z.object({
  message: z.string().min(1),
  attemptTool: z.string().min(1).optional(),
});
export type EchoTaskPayload = z.infer<typeof EchoTaskPayloadSchema>;
