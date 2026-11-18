/**
 * Who is speaking, on the Brain's side of the conversation.
 *
 * The owner's turns sit on the right with nothing named; the Brain's sit on the
 * left under its name beside the product's mark — the same `.brand-mark` the
 * shell's top bar draws, so the answer is signed by the thing the owner already
 * recognises. The mark is decoration: the name is what assistive technology reads.
 */
export function AgentSpeaker({ agentName }: { agentName: string }) {
  return (
    <span className="chat-message-speaker">
      <span aria-hidden="true" className="brand-mark">B</span>
      {agentName}
    </span>
  );
}
