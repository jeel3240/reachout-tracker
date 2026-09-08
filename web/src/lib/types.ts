export const STATUSES = [
  "requested", "accepted", "messaged", "replied", "live",
  "soft_no", "hard_decline", "signed", "closed", "skipped",
] as const;
export const TYPES = ["client", "hiring", "network", "recruiter"] as const;
export const DIRECTIONS = ["outbound", "inbound"] as const;
export const CHANNELS = ["email", "linkedin", "call", "meeting"] as const;

export type Status = (typeof STATUSES)[number];
export type ContactType = (typeof TYPES)[number];
export type Direction = (typeof DIRECTIONS)[number];
export type Channel = (typeof CHANNELS)[number];

export const STATUS_LABEL: Record<Status, string> = {
  requested: "Requested",
  accepted: "Accepted",
  messaged: "Messaged",
  replied: "Replied",
  live: "Live",
  soft_no: "Soft no",
  hard_decline: "Hard decline",
  signed: "Signed",
  closed: "Closed",
  skipped: "Skipped",
};

export const STATUS_HINT: Record<Status, string> = {
  requested: "invite sent, not accepted yet",
  accepted: "connected, not messaged",
  messaged: "message sent, awaiting reply",
  replied: "they responded, needs triage",
  live: "active conversation, action needed",
  soft_no: "polite pass, recontactable after date",
  hard_decline: "never contact again",
  signed: "paid engagement",
  closed: "finished, no action",
  skipped: "not worth pursuing",
};

export interface Company {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  location: string | null;
  notes: string | null;
  created_at: string;
}

export interface Contact {
  id: string;
  company_id: string | null;
  first_name: string;
  last_name: string | null;
  linkedin_url: string | null;
  email: string | null;
  email_verified: boolean;
  phone: string | null;
  title: string | null;
  type: ContactType | null;
  status: Status;
  date_requested: string | null;
  date_accepted: string | null;
  last_touch_at: string | null;
  touch_count: number;
  best_fit: boolean;
  asu_tie: boolean;
  recontact_after: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Touch {
  id: string;
  contact_id: string;
  direction: Direction;
  channel: Channel;
  sent_at: string;
  subject: string | null;
  hook: string | null;
  body: string | null;
  created_at: string;
}

export type ContactWithCompany = Contact & { company: Pick<Company, "id" | "name" | "domain"> | null };

export interface ContactDetail {
  contact: Contact;
  company: Company | null;
  touches: Touch[];
}

export function fullName(c: Pick<Contact, "first_name" | "last_name">) {
  return [c.first_name, c.last_name].filter(Boolean).join(" ");
}
