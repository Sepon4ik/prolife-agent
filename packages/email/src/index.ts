export { sendTransactionalEmail } from "./transactional";
export { sendOutreachEmail } from "./outreach";
export {
  pickMailbox,
  pickMailboxWithStatus,
  recordMailboxSend,
  updateMailboxMetrics,
  type MailboxForSending,
  type PickMailboxResult,
} from "./mailbox-rotation";
export {
  checkDnsHealth,
  calculateMailboxHealth,
  type DnsHealthResult,
  type MailboxHealth,
} from "./deliverability";
