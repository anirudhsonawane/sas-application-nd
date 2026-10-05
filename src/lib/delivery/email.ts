import nodemailer from "nodemailer";

import PDFDocument from "pdfkit";


type TicketEmail = {
    ticketNumber: string;
    ticketTypeName: string;
    customerName: string;
    qrCodeDataUrl: string;
};


type SendTicketEmailInput = {
    customerEmail: string;
    customerName: string;
    orderNumber: string;
    eventName: string;
    eventDate: string | null;
    venue: string | null;
    tickets: TicketEmail[];
};


function getRequiredEnv(
    name: string,
): string {
    const value =
        process.env[name];

    if (!value) {
        throw new Error(
            `${name} is not configured.`,
        );
    }

    return value;
}


function getTransporter() {
    const host =
        getRequiredEnv(
            "SMTP_HOST",
        );

    const port = Number(
        getRequiredEnv(
            "SMTP_PORT",
        ),
    );

    const secure =
        getRequiredEnv(
            "SMTP_SECURE",
        ) === "true";

    const user =
        getRequiredEnv(
            "SMTP_USER",
        );

    const pass =
        getRequiredEnv(
            "SMTP_PASS",
        );


    return nodemailer.createTransport({
        host,
        port,
        secure,
        auth: {
            user,
            pass,
        },
    });
}


function dataUrlToBuffer(
    dataUrl: string,
): Buffer {
    const match =
        dataUrl.match(
            /^data:([^;]+);base64,(.+)$/,
        );

    if (!match) {
        throw new Error(
            "Invalid QR code data URL.",
        );
    }

    return Buffer.from(
        match[2],
        "base64",
    );
}


async function generateTicketsPdf(
    input: SendTicketEmailInput,
): Promise<Buffer> {
    return new Promise(
        (resolve, reject) => {
            const document =
                new PDFDocument({
                    size: "A4",
                    margin: 40,
                    info: {
                        Title:
                            `${input.eventName} - Tickets`,
                        Author:
                            "Ticket Booking System",
                        Subject:
                            `Tickets for ${input.orderNumber}`,
                    },
                });


            const chunks: Buffer[] = [];


            document.on(
                "data",
                (chunk) => {
                    chunks.push(
                        Buffer.from(chunk),
                    );
                },
            );


            document.on(
                "end",
                () => {
                    resolve(
                        Buffer.concat(
                            chunks,
                        ),
                    );
                },
            );


            document.on(
                "error",
                (error) => {
                    reject(error);
                },
            );


            const formattedDate =
                input.eventDate
                    ? new Date(
                          input.eventDate,
                      ).toLocaleString(
                          "en-IN",
                          {
                              dateStyle:
                                  "full",
                              timeStyle:
                                  "short",
                          },
                      )
                    : "To be announced";


            input.tickets.forEach(
                (ticket, index) => {
                    if (index > 0) {
                        document.addPage();
                    }


                    /*
                     * Header
                     */
                    document
                        .fontSize(10)
                        .fillColor(
                            "#6b7280",
                        )
                        .text(
                            "EVENT TICKET",
                        );


                    document
                        .moveDown(0.4)
                        .fontSize(24)
                        .fillColor(
                            "#111827",
                        )
                        .font("Helvetica-Bold")
                        .text(
                            input.eventName,
                        );


                    document
                        .moveDown(0.5)
                        .fontSize(11)
                        .font("Helvetica")
                        .fillColor(
                            "#4b5563",
                        )
                        .text(
                            formattedDate,
                        );


                    document
                        .moveDown(0.2)
                        .text(
                            input.venue ||
                                "Venue to be announced",
                        );


                    /*
                     * Ticket information box
                     */
                    document
                        .moveDown(1)
                        .roundedRect(
                            40,
                            180,
                            515,
                            170,
                            12,
                        )
                        .fill(
                            "#f3f4f6",
                        );


                    document
                        .fillColor(
                            "#6b7280",
                        )
                        .fontSize(9)
                        .font(
                            "Helvetica-Bold",
                        )
                        .text(
                            "TICKET TYPE",
                            65,
                            205,
                        );


                    document
                        .fillColor(
                            "#111827",
                        )
                        .fontSize(20)
                        .text(
                            ticket.ticketTypeName,
                            65,
                            223,
                        );


                    document
                        .fillColor(
                            "#6b7280",
                        )
                        .fontSize(9)
                        .text(
                            "TICKET NUMBER",
                            65,
                            265,
                        );


                    document
                        .fillColor(
                            "#111827",
                        )
                        .fontSize(13)
                        .font(
                            "Helvetica-Bold",
                        )
                        .text(
                            ticket.ticketNumber,
                            65,
                            282,
                        );


                    document
                        .fillColor(
                            "#6b7280",
                        )
                        .fontSize(9)
                        .font(
                            "Helvetica",
                        )
                        .text(
                            "CUSTOMER",
                            65,
                            315,
                        );


                    document
                        .fillColor(
                            "#111827",
                        )
                        .fontSize(12)
                        .text(
                            ticket.customerName,
                            65,
                            330,
                        );


                    /*
                     * QR code
                     */
                    const qrBuffer =
                        dataUrlToBuffer(
                            ticket.qrCodeDataUrl,
                        );


                    document
                        .image(
                            qrBuffer,
                            185,
                            390,
                            {
                                fit: [
                                    225,
                                    225,
                                ],
                                align:
                                    "center",
                                valign:
                                    "center",
                            },
                        );


                    document
                        .fillColor(
                            "#4b5563",
                        )
                        .fontSize(10)
                        .text(
                            "Scan this QR code at the event entrance.",
                            40,
                            635,
                            {
                                width:
                                    515,
                                align:
                                    "center",
                            },
                        );


                    document
                        .fillColor(
                            "#9ca3af",
                        )
                        .fontSize(9)
                        .text(
                            "This ticket can be scanned only once.",
                            40,
                            655,
                            {
                                width:
                                    515,
                                align:
                                    "center",
                            },
                        );


                    /*
                     * Footer
                     */
                    document
                        .fillColor(
                            "#9ca3af",
                        )
                        .fontSize(8)
                        .text(
                            `Order: ${input.orderNumber}`,
                            40,
                            760,
                            {
                                width:
                                    515,
                                align:
                                    "center",
                            },
                        );
                },
            );


            document.end();
        },
    );
}


export async function sendTicketEmail(
    input: SendTicketEmailInput,
) {
    if (
        input.tickets.length === 0
    ) {
        throw new Error(
            "No tickets available for email delivery.",
        );
    }


    const emailFrom =
        getRequiredEnv(
            "EMAIL_FROM",
        );


    const transporter =
        getTransporter();


    const formattedDate =
        input.eventDate
            ? new Date(
                  input.eventDate,
              ).toLocaleString(
                  "en-IN",
                  {
                      dateStyle:
                          "full",
                      timeStyle:
                          "short",
                  },
              )
            : "To be announced";


    /*
     * Generate PDF containing
     * every ticket and QR code.
     */
    const pdfBuffer =
        await generateTicketsPdf(
            input,
        );


    /*
     * Generate CID references
     * for QR codes.
     *
     * CID is used instead of a
     * data:image URL because Gmail
     * reliably supports inline
     * MIME images this way.
     */
    const ticketRows =
        input.tickets
            .map(
                (ticket, index) => {
                    const cid =
                        `ticket-qr-${index}`;

                    return `
                        <div
                            style="
                                margin-bottom: 24px;
                                padding: 24px;
                                border: 1px solid #e5e7eb;
                                border-radius: 16px;
                                background: #ffffff;
                            "
                        >
                            <h2
                                style="
                                    margin: 0 0 16px;
                                    font-size: 20px;
                                    color: #111827;
                                "
                            >
                                ${escapeHtml(
                                    ticket.ticketTypeName,
                                )}
                            </h2>

                            <p
                                style="
                                    margin: 8px 0;
                                    color: #4b5563;
                                "
                            >
                                <strong>
                                    Ticket:
                                </strong>

                                ${escapeHtml(
                                    ticket.ticketNumber,
                                )}
                            </p>

                            <p
                                style="
                                    margin: 8px 0;
                                    color: #4b5563;
                                "
                            >
                                <strong>
                                    Name:
                                </strong>

                                ${escapeHtml(
                                    ticket.customerName,
                                )}
                            </p>

                            <div
                                style="
                                    margin-top: 20px;
                                    text-align: center;
                                "
                            >
                                <img
                                    src="cid:${cid}"
                                    alt="Ticket QR Code"
                                    width="260"
                                    height="260"
                                    style="
                                        display: block;
                                        margin: 0 auto;
                                        width: 260px;
                                        height: 260px;
                                    "
                                />

                                <p
                                    style="
                                        margin-top: 12px;
                                        font-size: 13px;
                                        color: #6b7280;
                                    "
                                >
                                    Present this QR code
                                    at the event entrance.
                                </p>
                            </div>
                        </div>
                    `;
                },
            )
            .join("");


    const attachments = input.tickets.map(
        (ticket, index) => ({
            filename:
                `${ticket.ticketNumber}.png`,
            content:
                dataUrlToBuffer(
                    ticket.qrCodeDataUrl,
                ),
            cid:
                `ticket-qr-${index}`,
            contentType:
                "image/png",
        }),
    );


    /*
     * Add the complete ticket PDF.
     */
    attachments.push({
        filename:
            `tickets-${input.orderNumber}.pdf`,
        content:
            pdfBuffer,
        contentType:
            "application/pdf",
        cid:
            `tickets-pdf-${input.orderNumber}`,
    });


    const result =
        await transporter.sendMail({
            from: emailFrom,

            to: input.customerEmail,

            subject:
                `${input.eventName} — Your Tickets (${input.orderNumber})`,

            html: `
                <!DOCTYPE html>

                <html>
                    <head>
                        <meta
                            charset="UTF-8"
                        />

                        <meta
                            name="viewport"
                            content="width=device-width, initial-scale=1.0"
                        />

                        <title>
                            Your Event Tickets
                        </title>
                    </head>

                    <body
                        style="
                            margin: 0;
                            padding: 0;
                            background: #f3f4f6;
                            font-family:
                                Arial,
                                Helvetica,
                                sans-serif;
                        "
                    >
                        <div
                            style="
                                max-width: 680px;
                                margin: 0 auto;
                                padding: 32px 16px;
                            "
                        >
                            <div
                                style="
                                    overflow: hidden;
                                    border-radius: 20px;
                                    background: #ffffff;
                                "
                            >
                                <div
                                    style="
                                        padding: 32px;
                                        background: #111827;
                                        color: #ffffff;
                                    "
                                >
                                    <p
                                        style="
                                            margin: 0;
                                            font-size: 12px;
                                            letter-spacing: 2px;
                                            text-transform: uppercase;
                                            color: #9ca3af;
                                        "
                                    >
                                        Payment Successful
                                    </p>

                                    <h1
                                        style="
                                            margin: 12px 0 0;
                                            font-size: 30px;
                                        "
                                    >
                                        Your tickets are ready
                                    </h1>
                                </div>

                                <div
                                    style="
                                        padding: 32px;
                                    "
                                >
                                    <p
                                        style="
                                            margin: 0 0 16px;
                                            font-size: 16px;
                                            color: #111827;
                                        "
                                    >
                                        Hello
                                        <strong>
                                            ${escapeHtml(
                                                input.customerName,
                                            )}
                                        </strong>,
                                    </p>

                                    <p
                                        style="
                                            margin: 0 0 24px;
                                            line-height: 1.6;
                                            color: #4b5563;
                                        "
                                    >
                                        Thank you for your booking.
                                        Your tickets for
                                        <strong>
                                            ${escapeHtml(
                                                input.eventName,
                                            )}
                                        </strong>
                                        are confirmed.
                                    </p>

                                    <div
                                        style="
                                            margin-bottom: 28px;
                                            padding: 20px;
                                            border-radius: 14px;
                                            background: #f9fafb;
                                        "
                                    >
                                        <p
                                            style="
                                                margin: 0 0 8px;
                                                color: #6b7280;
                                                font-size: 13px;
                                            "
                                        >
                                            ORDER NUMBER
                                        </p>

                                        <p
                                            style="
                                                margin: 0;
                                                font-size: 18px;
                                                font-weight: bold;
                                                color: #111827;
                                            "
                                        >
                                            ${escapeHtml(
                                                input.orderNumber,
                                            )}
                                        </p>

                                        <p
                                            style="
                                                margin: 16px 0 0;
                                                color: #4b5563;
                                            "
                                        >
                                            <strong>
                                                Event:
                                            </strong>

                                            ${escapeHtml(
                                                input.eventName,
                                            )}
                                        </p>

                                        <p
                                            style="
                                                margin: 8px 0 0;
                                                color: #4b5563;
                                            "
                                        >
                                            <strong>
                                                Date:
                                            </strong>

                                            ${escapeHtml(
                                                formattedDate,
                                            )}
                                        </p>

                                        <p
                                            style="
                                                margin: 8px 0 0;
                                                color: #4b5563;
                                            "
                                        >
                                            <strong>
                                                Venue:
                                            </strong>

                                            ${escapeHtml(
                                                input.venue ||
                                                    "To be announced",
                                            )}
                                        </p>
                                    </div>

                                    ${ticketRows}

                                    <div
                                        style="
                                            margin-top: 28px;
                                            padding: 20px;
                                            border-radius: 14px;
                                            background: #f9fafb;
                                            text-align: center;
                                        "
                                    >
                                        <p
                                            style="
                                                margin: 0;
                                                font-size: 14px;
                                                color: #374151;
                                            "
                                        >
                                            Your complete tickets are
                                            also attached as a PDF.
                                        </p>

                                        <p
                                            style="
                                                margin: 8px 0 0;
                                                font-size: 13px;
                                                color: #6b7280;
                                            "
                                        >
                                            Keep the PDF safely stored
                                            on your phone for entry.
                                        </p>
                                    </div>

                                    <div
                                        style="
                                            margin-top: 28px;
                                            padding-top: 24px;
                                            border-top: 1px solid #e5e7eb;
                                        "
                                    >
                                        <p
                                            style="
                                                margin: 0;
                                                font-size: 13px;
                                                line-height: 1.6;
                                                color: #6b7280;
                                            "
                                        >
                                            Each ticket has a unique QR
                                            code and can be scanned only
                                            once at the event entrance.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <p
                                style="
                                    margin: 24px 0 0;
                                    text-align: center;
                                    font-size: 12px;
                                    color: #9ca3af;
                                "
                            >
                                This is an automated ticket delivery email.
                            </p>
                        </div>
                    </body>
                </html>
            `,

            attachments,
        });


    return {
        success: true,
        messageId:
            result.messageId,
    };
}


function escapeHtml(
    value: string,
): string {
    return value
        .replaceAll(
            "&",
            "&amp;",
        )
        .replaceAll(
            "<",
            "&lt;",
        )
        .replaceAll(
            ">",
            "&gt;",
        )
        .replaceAll(
            '"',
            "&quot;",
        )
        .replaceAll(
            "'",
            "&#039;",
        );
}