export const ANNOUNCEMENT_ID = 'UID-UNBROKEN-SERVER';
export const ANNOUNCEMENT_NAME = 'Server';

let sender: ((text: string) => number) | undefined;

export function SetAnnouncementSender(value: ((text: string) => number) | undefined): void {
    sender = value;
}

export function ValidAnnouncement(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0 && [...value].length <= 2048 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/.test(value);
}

export function SendAnnouncement(text: string): number | undefined {
    return sender?.(text);
}
