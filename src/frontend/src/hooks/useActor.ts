/**
 * Stub hook — this app manages all state client-side.
 * The actor is not used for game logic, only available for optional backend calls.
 */
export function useActor() {
  return {
    actor: null as unknown as Record<
      string,
      (...args: unknown[]) => Promise<unknown>
    >,
    isFetching: false,
  };
}
