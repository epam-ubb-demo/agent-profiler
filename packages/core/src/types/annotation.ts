/**
 * Annotation type for F4.x features.
 *
 * Annotations are tags or comments attached to turns or tool calls,
 * enabling user-driven labelling and review workflows.
 */

/**
 * A user-created annotation on a turn or tool call.
 */
export interface Annotation {
  readonly id: string;
  readonly targetType: 'turn' | 'toolCall';
  readonly targetId: string;
  readonly label: string;
  readonly comment: string;
  readonly createdAt: string;
  readonly author: string;
}
