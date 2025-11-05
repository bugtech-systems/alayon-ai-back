import 'dotenv';
import axios from 'axios';
import nodemailer from 'nodemailer';
import { voicespeak } from '../../speak.js';
import { splitMessageWithPagination } from '../utils/helpers.js';


let system = '639368263352';

// SMS Tool
export async function sendSMS(config, context) {
    let { message_types, recipients, message } = config;

    let error;
    
    
    
    
    if (recipients.length) {
        recipients = recipients.map(a => String(a))
        let isSMS = message_types?.includes('SMS');
        let isFlash = message_types?.includes('FLASH');
        let isCall = message_types?.includes('CALL');

        let messages = splitMessageWithPagination(message);
        if(!messages.length) return { message: 'No Messages Provided' }
        if (isSMS) {

            const response = await axios({
                method: 'POST',
                url: 'https://swc.sharewin.pro/api/tasks/sms/bulk',
                data: {
                    recipients,
                    messages,
                    isFlash: false,
                    system: system

                }
            }).catch(err => {
                console.log(err)
                error = true;
            });
        }

        if (isFlash) {

            const response = await axios({
                method: 'POST',
                url: 'https://swc.sharewin.pro/api/tasks/sms/bulk',
                data: {
                    recipients,
                    messages,
                    isFlash: true,
                    system: system
                }
            }).catch(err => {
                console.log(err)
                error = err.response;
            });
        }

        if (isCall) {
            for (let call of recipients) {
                const response = await axios({
                    method: 'POST',
                    url: 'https://swc.sharewin.pro/api/tasks',
                    data: {
                        "taskId": "TASK-1001",
                        "title": "Call Mobile",
                        "category": "Call",
                        "status": "Todo",
                        "priority": "High",
                        "taskObject": {
                            "phone": call,
                            "system": "9368263352"
                        }
                    }
                }).catch(err => {
                console.log(err)
                error = error.response;
            });
            }
        }

        return error ? { message: 'Sending Message Error', messages, error } :  { message: 'Recipients SMS Processed', messages };

    } else {
        return { message: 'No Message Recipients' };
    }



    // Implementation for different SMS providers
    /*   if (provider === 'twilio') {
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
          ); */

}

// Add other providers...

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
    console.log(message, 'SPEAK')
    await voicespeak(message);
    return message
}