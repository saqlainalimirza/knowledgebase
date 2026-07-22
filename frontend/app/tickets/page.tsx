import TicketBoard from "@/components/TicketBoard";

export const metadata = { title: "Bug Tickets — Evergreen" };

export default function TicketsPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight text-deep">Bug Tickets</h1>
        <p className="mt-1 text-sm text-muted">
          Bugs from the <b>bugs-and-troubleshoot</b> Slack channel. Private ops board —
          not part of the client knowledge, the AI cannot see it.
        </p>
      </div>
      <TicketBoard />
    </div>
  );
}
