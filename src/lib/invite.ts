/** Link that opens the Join screen with the room code filled in. */
export function inviteUrl(code: string): string {
  return `${window.location.origin}${window.location.pathname}?join=${code}`;
}

/** Share sheet where the phone has one, otherwise copy. Returns a message for a toast, or null. */
export async function shareInvite(code: string): Promise<string | null> {
  const text = `Join my Makan apa? room. Code: ${code}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Makan apa?', text, url: inviteUrl(code) });
    } catch {
      /* closed the share sheet */
    }
    return null;
  }
  await navigator.clipboard.writeText(`${text}\n${inviteUrl(code)}`);
  return 'Invite link copied.';
}
