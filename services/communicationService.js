import 'dotenv';
import axios from 'axios';
import nodemailer from 'nodemailer';
import { voicespeak } from '../speak.js';



// SMS Tool
export async function sendSMS(config) {
    const { provider, api_key, recipients, message } = config;

    // Implementation for different SMS providers
    if (provider === 'twilio') {
        const response = await axios.post(
            `https://api.twilio.com/2010-04-01/Accounts/${api_key.account_sid}/Messages.json`,
            new URLSearchParams({
                To: recipients.join(','),
                From: config.from_number,
                Body: message
            }),
            {
                auth: {
                    username: api_key.account_sid,
                    password: api_key.auth_token
                }
            }
        );
        return response.data;
    }

    // Add other providers...
}

// Email Tool
export async function sendEmail(config) {
    const { smtp_config, from, to, subject, body, attachments } = config;


    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: (smtp_config ? smtp_config.SMTP_USER : process.env.SMTP_GMAIL),
            pass: (smtp_config ? smtp_config.SMTP_TOKEN : process.env.SMTP_PASS),
        },
    });

    const mailOptions = {
        from,
        to,
        subject,
        html: body,
        attachments
    };

    return transporter.sendMail(mailOptions);
}

// Speak Tool
export async function sendSpeak(config) {
    const { message } = config;

    // const transporter = nodemailer.createTransport({
    //     host: smtp_config.host,
    //     port: smtp_config.port,
    //     secure: smtp_config.secure,
    //     auth: {
    //         user: smtp_config.username,
    //         pass: smtp_config.password
    //     }
    // });

    // const mailOptions = {
    //     from,
    //     to,
    //     subject,
    //     html: body,
    //     attachments
    // };
    return await voicespeak(message);

}