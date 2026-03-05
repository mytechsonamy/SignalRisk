# Skill: react-dashboard

## Metadata
| Key | Value |
|-----|-------|
| **Agent Types** | FRONTEND_REACT |
| **Category** | frontend |

## Description
React SPA dashboard for SignalRisk fraud analysts and merchant admins. Built with Vite, Tailwind CSS, and design tokens from the design phase. Includes RBAC route guards, WebSocket real-time updates, and accessibility (WCAG 2.1 AA).

## Patterns
- Vite + React 18 + TypeScript
- Tailwind CSS with design tokens from `docs/design/design-tokens.json`
- App shell: sidebar navigation, header with user/merchant context, content area
- RBAC route guards: Admin, Senior Analyst, Analyst, Viewer roles
- WebSocket connection for real-time event stream and case updates
- React Query for server state management
- Pages: Overview, Cases (queue + detail), Rules (list + editor + approval), Settings, Analytics

## Architecture Reference
architecture-v3.md#2.1-service-catalog (dashboard-web, dashboard-api)

## Code Examples
```typescript
// RBAC route guard
const ProtectedRoute: React.FC<{ requiredRole: Role; children: React.ReactNode }> = ({
  requiredRole,
  children,
}) => {
  const { user } = useAuth();
  if (!user || !hasRole(user, requiredRole)) {
    return <Navigate to="/unauthorized" />;
  }
  return <>{children}</>;
};

// WebSocket real-time updates
const useEventStream = (merchantId: string) => {
  const [events, setEvents] = useState<FraudEvent[]>([]);
  useEffect(() => {
    const ws = new WebSocket(`${WS_URL}/events?merchant=${merchantId}`);
    ws.onmessage = (msg) => {
      const event = JSON.parse(msg.data);
      setEvents((prev) => [event, ...prev].slice(0, 100));
    };
    return () => ws.close();
  }, [merchantId]);
  return events;
};

// KPI card component
const KPICard: React.FC<{ title: string; value: string; trend: number }> = ({
  title, value, trend,
}) => (
  <div className="rounded-lg bg-white p-4 shadow-sm border border-gray-200">
    <p className="text-sm text-gray-500">{title}</p>
    <p className="text-2xl font-semibold">{value}</p>
    <TrendIndicator value={trend} />
  </div>
);
```

## Constraints
- All pages MUST handle: loading state, error state, empty state, and degraded state
- RBAC enforced on both routes AND individual UI elements (buttons, actions)
- WebSocket reconnection with exponential backoff + stale data indicator
- WCAG 2.1 AA compliance: keyboard navigation, screen reader support, color contrast
- Responsive: desktop-first, tablet view-only mode for mobile
- Never store sensitive data in localStorage -- use httpOnly cookies for session
- Design tokens from `docs/design/design-tokens.json` for colors, spacing, typography
