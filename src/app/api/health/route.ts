// OBS-03 liveness: the process is up and can answer. Deliberately touches nothing
// else (no database, no session) and returns nothing about the deployment.
export function GET() {
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
