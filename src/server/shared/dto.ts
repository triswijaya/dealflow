// MONEY-01: "Pada JSON/DTO amount diserialisasi sebagai string integer."
// A single documented conversion point for every money field's outbound
// wire representation, so it stays exact (never routes through Number) and
// stays uniform across both transports (Server Actions and Route
// Handlers) per ARCH-03's "jangan menduplikasi aturan pada kedua transport."
export function toMoneyDto(amount: bigint): string {
  return amount.toString();
}

// DATA-04 instants (createdAt/updatedAt/sentAt/...) round-trip as a real
// Date object through a Server Action (React Flight supports it natively),
// but as a plain ISO string through a Route Handler's JSON.stringify --
// two different client-side JS types for the same field depending on
// which transport happened to serve it. Converting explicitly here closes
// that gap: the DTO contract stays one string shape regardless of
// transport, matching ARCH-03's transport-parity rule.
export function toIsoDto(instant: Date): string {
  return instant.toISOString();
}
