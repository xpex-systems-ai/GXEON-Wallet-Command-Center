# QUANTUM EVENT BUS SPECIFICATION

## Event Bus Architecture
The Quantum Event Bus (`src/events/eventBus.ts`) provides asynchronous, type-safe communication between adapters, agents, and UI components.

### Security Guarantees
- **Payload Redaction**: Keys matching `privateKey`, `seed`, `token`, `password`, or `secret` are automatically redacted to `[REDACTED_SECURITY_DATA]`.
- **Bounded History**: Maximum 100 recent events are retained in-memory to prevent browser memory leaks.
- **Wildcard Subscriptions**: Agents subscribe to `*` to observe system state changes seamlessly.
