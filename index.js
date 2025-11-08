const { ImapFlow } = require('imapflow');
const axios = require('axios');

const config = {
    imap: {
        host: process.env.IMAP_HOST || 'imap.exmail.qq.com',
        port: process.env.IMAP_PORT || 993,
        secure: process.env.IMAP_SECURE !== 'false',
        auth: {
            user: process.env.IMAP_USER,
            pass: process.env.IMAP_PASS
        },
        logger: {
            debug: () => {},
            info: console.info,
            warn: console.warn,
            error: console.error
        }
    },
    webhook: {
        url: process.env.WEBHOOK_URL
    },
    reconnectMinutes: process.env.RECONNECT_MINUTES || 10
};

if (!config.imap.auth.user || !config.imap.auth.pass || !config.webhook.url) {
    console.error('Missing required environment variables: IMAP_USER, IMAP_PASS, WEBHOOK_URL');
    process.exit(1);
}

const sendWebhook = async (data) => {
    console.log('Sending webhook with data:', {
        subject: data.subject,
        from: data.from,
        raw: 'raw content omitted for brevity'
    });
    try {
        await axios.post(config.webhook.url, data);
        console.log('Webhook sent successfully');
    } catch (error) {
        console.error('Error sending webhook:', error.message);
    }
};

const connect = async () => {
    const client = new ImapFlow(config.imap);

    client.on('connect', () => {
        console.log('connected');
    });

    client.on('close', () => {
        console.log('disconnected');
        throw new Error('IMAP connection closed');
    });

    client.on('error', err => {
        console.error('error', err);
        throw err;
    });

    await client.connect();

    let lock = await client.getMailboxLock('INBOX');
    try {
        client.on('mail', async () => {
            let message = await client.fetchOne(client.mailbox.exists, { source: true, headers: true });
            const raw = message.source.toString();
            const subject = message.headers.get('subject')?.[0] || '';
            const from = message.headers.get('from')?.value[0]?.address || '';

            sendWebhook({ subject, from, raw });
        });

        await client.idle();
    } finally {
        lock.release();
    }
};

const run = async () => {
    while (true) {
        try {
            await connect();
        } catch (err) {
            console.error('Connection error:', err.message);
            console.log(`Reconnecting in ${config.reconnectMinutes} minutes...`);
            await new Promise(resolve => setTimeout(resolve, config.reconnectMinutes * 60 * 1000));
        }
    }
};

run();
