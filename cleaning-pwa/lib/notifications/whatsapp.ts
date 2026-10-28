/** Digits only, as required by wa.me (country code included, no "+"). */
export function toWaNumber(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** Click-to-chat deep link: opens WhatsApp (app or Web) with the message pre-filled. */
export function whatsappLink(phone: string, text: string): string {
  return `https://wa.me/${toWaNumber(phone)}?text=${encodeURIComponent(text)}`;
}
