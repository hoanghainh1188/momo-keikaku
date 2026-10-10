export const DEMO_USERS = {
    linh: {
        id: '019b76da-a800-7000-8000-051111111111',
        email: 'linh@momo-digital.example',
        name: 'Nguyen Thi Linh',
        role: 'pm',
        onDemoProject: true,
    },
    hoang: {
        id: '019b76da-a800-7000-8000-0a2222222222',
        email: 'hoang@momo-digital.example',
        name: 'Hoang Hai',
        role: 'tenant_admin',
        onDemoProject: false,
    },
};
/** The audit actor for a user id — the one form, shared with `packages/app`'s audited writes. */
export function actorOf(userId) {
    return `user:${userId}`;
}
