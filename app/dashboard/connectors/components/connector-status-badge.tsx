export function ConnectorStatusBadge({ status }: { readonly status: string }) {
  const isConnected = status === 'connected';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-0.5 text-xs font-semibold ${
        isConnected ? 'bg-primary/15 text-primary' : 'bg-surface-container-high text-on-surface-variant'
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-primary' : 'bg-on-surface-variant'}`}
        aria-hidden
      />
      {status}
    </span>
  );
}
