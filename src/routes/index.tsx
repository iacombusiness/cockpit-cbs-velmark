import { createFileRoute, redirect } from "@tanstack/react-router";

// A entrada do app é o cockpit do período.
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/periodo" });
  },
});
