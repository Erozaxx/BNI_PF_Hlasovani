import { notFound } from "next/navigation";
import { hashEventToken } from "@/lib/events/magic-link";
import {
  getEventByParticipantToken,
  getEventOptions,
  getEventVotesByParticipant,
} from "@/lib/db/queries/events";
import { VotingView } from "./_components/VotingView";
import { ResultsView } from "./_components/ResultsView";

interface PageProps {
  params: { eventId: string };
  searchParams: { t?: string };
}

export default async function EventPage({ params, searchParams }: PageProps) {
  const rawToken = searchParams.t;

  // No token → 404 (do not reveal event existence)
  if (!rawToken) {
    notFound();
  }

  const tokenHash = hashEventToken(rawToken);
  const result = await getEventByParticipantToken(tokenHash);

  // Token not found → 404
  if (!result) {
    notFound();
  }

  const { event, participant } = result;

  // Verify the eventId in URL matches participant's event
  if (event.id !== params.eventId) {
    notFound();
  }

  // done state → 404 (tokens are revoked in this state)
  if (event.status === "done") {
    notFound();
  }

  // draft state → also not publicly accessible
  if (event.status === "draft") {
    notFound();
  }

  // Fetch options with vote counts
  const options = await getEventOptions(event.id);

  // Fetch participant's own votes
  const myVotes = await getEventVotesByParticipant(participant.id);
  const myVotedOptionIds = new Set(myVotes.map((v) => v.optionId));

  if (event.status === "active") {
    return (
      <VotingView
        event={event}
        participant={participant}
        options={options}
        myVotedOptionIds={[...myVotedOptionIds]}
      />
    );
  }

  // status === "closed"
  return (
    <ResultsView
      event={event}
      options={options}
      myVotedOptionIds={[...myVotedOptionIds]}
    />
  );
}
