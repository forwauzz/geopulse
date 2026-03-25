/**
 * Resend attachment limits — large PDFs use R2 link delivery (DA-003).
 * @see https://resend.com/docs/dashboard/emails/attachments
 */
export const DEEP_AUDIT_ATTACH_MAX_BYTES = 4 * 1024 * 1024;
